package com.innative.halkaarz;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class NewsTestWorker extends Worker {
    private static final String FEED_URL = "https://halka-arz-portfoy-news-test.grass-airboat.workers.dev/v1/news?limit=60";
    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final int MAX_FEED_BYTES = 768 * 1024;
    private static final int MAX_ARTICLE_BYTES = 768 * 1024;
    private static final int MAX_ARTICLES_TO_VERIFY = 12;
    private static final long BREAKING_MAX_AGE_MINUTES = 90L;

    private static final Pattern BLOOMBERG_ARTICLE_PATH = Pattern.compile("-\\d{6,}/?$");
    private static final Pattern META_TAG = Pattern.compile("(?is)<meta\\b[^>]*>");
    private static final Pattern ATTR = Pattern.compile("(?i)([\\w:-]+)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))");

    public NewsTestWorker(@NonNull Context appContext, @NonNull WorkerParameters params) {
        super(appContext, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (!NewsTestScheduler.enabled()) return Result.success();
        try {
            List<NewsItem> items = fetchVerifiedItems();
            if (items.isEmpty()) return Result.success();

            ZonedDateTime now = ZonedDateTime.now(ISTANBUL);
            sendBreakingIfNeeded(items, now);
            sendDigestIfDue(items, now);
            return Result.success();
        } catch (Exception error) {
            return Result.retry();
        }
    }

    private void sendBreakingIfNeeded(List<NewsItem> items, ZonedDateTime now) {
        Instant nowInstant = now.toInstant();
        items.stream()
                .filter(item -> item.importance == 5 && item.publishedAt != null)
                .filter(item -> {
                    long age = Duration.between(item.publishedAt, nowInstant).toMinutes();
                    return age >= -5 && age <= BREAKING_MAX_AGE_MINUTES;
                })
                .sorted(Comparator.comparing((NewsItem item) -> item.publishedAt).reversed())
                .limit(1)
                .forEach(item -> {
                    Map<String, String> data = new HashMap<>();
                    data.put("kind", "news_breaking");
                    data.put("news_id", item.url);
                    data.put("title", "🔴 Son Dakika");
                    data.put("body", shorten(item.title, 120));
                    NotificationHelper.show(getApplicationContext(), data);
                });
    }

    private void sendDigestIfDue(List<NewsItem> items, ZonedDateTime now) {
        int minuteOfDay = now.getHour() * 60 + now.getMinute();
        String slot;
        ZonedDateTime start;
        if (minuteOfDay >= 19 * 60) {
            slot = "evening";
            start = now.toLocalDate().atTime(10, 0).atZone(ISTANBUL);
        } else if (minuteOfDay >= 10 * 60) {
            slot = "morning";
            start = now.toLocalDate().minusDays(1).atTime(19, 0).atZone(ISTANBUL);
        } else {
            return;
        }

        Instant startInstant = start.toInstant();
        List<NewsItem> eligible = new ArrayList<>();
        for (NewsItem item : items) {
            if (item.publishedAt == null) continue;
            if (item.publishedAt.isBefore(startInstant) || item.publishedAt.isAfter(now.toInstant())) continue;
            eligible.add(item);
        }
        if (eligible.isEmpty()) return;

        eligible.sort((a, b) -> {
            int importance = Integer.compare(b.importance, a.importance);
            if (importance != 0) return importance;
            return b.publishedAt.compareTo(a.publishedAt);
        });

        List<NewsItem> selected = new ArrayList<>();
        for (NewsItem item : eligible) {
            if (item.importance >= 3 && selected.size() < 4) selected.add(item);
        }
        if (selected.isEmpty()) selected.add(eligible.get(0));

        StringBuilder body = new StringBuilder();
        for (int i = 0; i < selected.size(); i++) {
            if (i > 0) body.append("\n\n");
            body.append("• ").append(shorten(selected.get(i).title, 72));
        }

        Map<String, String> data = new HashMap<>();
        data.put("kind", "news_digest");
        data.put("digest_slot", slot);
        data.put("digest_day", now.toLocalDate().toString());
        data.put("title", digestTitle(selected));
        data.put("body", body.toString());
        NotificationHelper.show(getApplicationContext(), data);
    }

    private List<NewsItem> fetchVerifiedItems() throws Exception {
        JSONObject payload = new JSONObject(fetchText(FEED_URL, MAX_FEED_BYTES));
        JSONArray source = payload.optJSONArray("items");
        if (source == null) return new ArrayList<>();

        List<NewsItem> candidates = new ArrayList<>();
        for (int i = 0; i < source.length(); i++) {
            JSONObject item = source.optJSONObject(i);
            if (item == null) continue;
            String url = item.optString("url", "").trim();
            String category = item.optString("category", "").trim();
            if (!isRealArticleUrl(url)) continue;
            String rawTitle = cleanFeedTitle(item.optString("title", ""));
            if (isGenericTitle(rawTitle)) continue;
            candidates.add(new NewsItem(url, rawTitle, category, null, score(rawTitle)));
            if (candidates.size() >= MAX_ARTICLES_TO_VERIFY) break;
        }

        List<NewsItem> verified = new ArrayList<>();
        for (NewsItem candidate : candidates) {
            try {
                ArticleMetadata metadata = fetchArticleMetadata(candidate.url);
                String title = metadata.title == null || metadata.title.isEmpty() ? candidate.title : metadata.title;
                if (isGenericTitle(title)) continue;
                verified.add(new NewsItem(
                        candidate.url,
                        title,
                        candidate.category,
                        metadata.publishedAt,
                        score(title)
                ));
            } catch (Exception ignored) {
                // Source-verified publication time is required for delivery.
            }
        }
        return verified;
    }

    private ArticleMetadata fetchArticleMetadata(String url) throws Exception {
        String html = fetchText(url, MAX_ARTICLE_BYTES);
        String title = null;
        Instant publishedAt = null;

        Matcher matcher = META_TAG.matcher(html);
        while (matcher.find()) {
            Map<String, String> attrs = attributes(matcher.group());
            String marker = value(attrs.get("property"), attrs.get("name")).toLowerCase(Locale.ROOT);
            String content = decodeHtml(attrs.get("content"));
            if (title == null && ("og:title".equals(marker) || "twitter:title".equals(marker))) {
                title = cleanArticleTitle(content);
            }
            if (publishedAt == null && "article:published_time".equals(marker)) {
                publishedAt = parseInstant(content);
            }
        }

        if (title == null || title.length() < 8) throw new IllegalStateException("article title unavailable");
        if (publishedAt == null) throw new IllegalStateException("article time unavailable");
        return new ArticleMetadata(title, publishedAt);
    }

    private static Map<String, String> attributes(String tag) {
        Map<String, String> result = new HashMap<>();
        Matcher matcher = ATTR.matcher(tag == null ? "" : tag);
        while (matcher.find()) {
            String value = matcher.group(2) != null ? matcher.group(2)
                    : matcher.group(3) != null ? matcher.group(3)
                    : matcher.group(4) != null ? matcher.group(4) : "";
            result.put(matcher.group(1).toLowerCase(Locale.ROOT), value);
        }
        return result;
    }

    private static String value(String first, String second) {
        return first != null && !first.isEmpty() ? first : second == null ? "" : second;
    }

    private static Instant parseInstant(String value) {
        try { return Instant.parse(value); } catch (Exception ignored) {}
        try { return ZonedDateTime.parse(value).toInstant(); } catch (Exception ignored) {}
        return null;
    }

    private static boolean isRealArticleUrl(String value) {
        try {
            URL url = new URL(value);
            if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
            String host = url.getHost().toLowerCase(Locale.ROOT);
            if ("bloomberght.com".equals(host) || "www.bloomberght.com".equals(host)) {
                return BLOOMBERG_ARTICLE_PATH.matcher(url.getPath()).find();
            }
            return false;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String cleanFeedTitle(String value) {
        return cleanText(value).replaceFirst("(?iu)^(?:HABERLER|PİYASALAR)\\s+", "").trim();
    }

    private static String cleanArticleTitle(String value) {
        return cleanText(decodeHtml(value))
                .replaceFirst("(?iu)\\s*[|\\-–—]\\s*Bloomberg\\s*HT\\s*$", "")
                .trim();
    }

    private static boolean isGenericTitle(String value) {
        String title = lower(value);
        return title.isEmpty()
                || title.equals("hisse senetleri")
                || title.equals("borsa kapanış")
                || title.equals("çeyrek altın")
                || title.equals("cumhuriyet altını")
                || title.equals("ziynet altını")
                || title.equals("yatırım fonları")
                || title.equals("halka arz takvimi")
                || title.equals("ekonomi haberleri")
                || title.equals("borsa haberleri")
                || title.equals("altın fiyatları")
                || title.equals("gram altın fiyatı");
    }

    private static int score(String value) {
        String title = lower(value);
        boolean centralBank = containsAny(title, "tcmb", "para politikası kurulu", "ppk");
        boolean rate = containsAny(title, "politika faiz", "faiz", "zorunlu karşılık", "likidite");
        boolean decision = containsAny(title, "artırdı", "indirdi", "sabit tuttu", "kararını açıkladı", "olağanüstü");
        if (centralBank && rate && decision) return 5;

        boolean marketWide = containsAny(title, "borsa istanbul", "bist", "piyasa geneli", "pay piyasası");
        boolean halt = containsAny(title, "işlemleri durdur", "işlemlere ara ver", "devre kesici");
        if (marketWide && halt) return 5;

        boolean regulator = containsAny(title, "spk", "sermaye piyasası kurulu", "hazine ve maliye", "resmî gazete", "resmi gazete");
        boolean restriction = containsAny(title, "açığa satış yasa", "işlem yasa", "olağanüstü tedbir", "stopaj", "vergi oran");
        if (regulator && restriction) return 5;
        if (centralBank || regulator || title.contains("borsa istanbul")) return 4;
        if (containsAny(title, "halka arz", "sermaye artır", "temettü", "bilanço", "kredi not", "enflasyon", "işsizlik", "büyüme", "döviz rezerv")) return 3;
        if (containsAny(title, "dolar", "euro", "altın", "borsa", "endeks", "hisse")) return 2;
        return 1;
    }

    private static String digestTitle(List<NewsItem> items) {
        StringBuilder joined = new StringBuilder();
        boolean borsa = false, altin = false, doviz = false, sirket = false, halkaArz = false;
        String firstCategory = "";
        for (NewsItem item : items) {
            joined.append(' ').append(lower(item.title));
            if (firstCategory.isEmpty()) firstCategory = item.category;
            if ("borsa".equals(item.category)) borsa = true;
            if ("altin".equals(item.category)) altin = true;
            if ("doviz".equals(item.category)) doviz = true;
            if ("sirketler".equals(item.category)) sirket = true;
            if ("halka-arz".equals(item.category)) halkaArz = true;
        }
        String text = joined.toString();
        if (containsAny(text, "tcmb", "politika faizi", "faiz kararı")) return "🏦 Faiz ve Piyasa Gündemi";
        if (containsAny(text, "enflasyon", "büyüme", "işsizlik", "üretici fiyat", "tüketici fiyat")) return "📊 Ekonomi Verileri Gündemde";
        if (borsa && altin) return "📈 Borsa ve Altın Gündemi";
        if (altin && doviz) return "💱 Altın ve Döviz Gündemi";
        if (borsa && sirket) return "📈 Borsa ve Şirketler Gündemi";
        if (halkaArz) return "🔔 Halka Arz ve Piyasa Gündemi";
        if ("borsa".equals(firstCategory)) return "📈 Borsada Öne Çıkan Gelişmeler";
        if ("altin".equals(firstCategory)) return "🪙 Altın Piyasasında Öne Çıkanlar";
        if ("doviz".equals(firstCategory)) return "💱 Döviz Piyasasında Öne Çıkanlar";
        if ("sirketler".equals(firstCategory)) return "🏢 Şirketler Gündeminde Öne Çıkanlar";
        return "📰 Finans Gündeminde Öne Çıkanlar";
    }

    private static boolean containsAny(String value, String... needles) {
        for (String needle : needles) if (value.contains(needle)) return true;
        return false;
    }

    private static String lower(String value) {
        return cleanText(value).toLowerCase(Locale.forLanguageTag("tr-TR"));
    }

    private static String cleanText(String value) {
        return String.valueOf(value == null ? "" : value).replaceAll("\\s+", " ").trim();
    }

    private static String decodeHtml(String value) {
        return cleanText(value)
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&apos;", "'")
                .replace("&lt;", "<")
                .replace("&gt;", ">");
    }

    private static String shorten(String value, int maxLength) {
        String text = cleanText(value);
        if (text.length() <= maxLength) return text;
        return text.substring(0, Math.max(1, maxLength - 1)).trim() + "…";
    }

    private static String fetchText(String urlText, int maxBytes) throws Exception {
        URL url = new URL(urlText);
        if (!"https".equalsIgnoreCase(url.getProtocol())) throw new IllegalArgumentException("HTTPS required");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json,text/html,*/*");
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/154 Mobile Safari/537.36");
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("HTTP " + status);
            try (InputStream input = connection.getInputStream();
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > maxBytes) throw new IllegalStateException("Response too large");
                    output.write(buffer, 0, read);
                }
                return output.toString("UTF-8");
            }
        } finally {
            connection.disconnect();
        }
    }

    private static final class NewsItem {
        final String url;
        final String title;
        final String category;
        final Instant publishedAt;
        final int importance;

        NewsItem(String url, String title, String category, Instant publishedAt, int importance) {
            this.url = url;
            this.title = title;
            this.category = category;
            this.publishedAt = publishedAt;
            this.importance = importance;
        }
    }

    private static final class ArticleMetadata {
        final String title;
        final Instant publishedAt;

        ArticleMetadata(String title, Instant publishedAt) {
            this.title = title;
            this.publishedAt = publishedAt;
        }
    }
}
