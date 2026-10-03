package com.innative.halkaarz;

import android.content.Context;
import android.content.SharedPreferences;

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
    private static final long ROUTINE_NEWS_INTERVAL_MS = 6L * 60L * 60L * 1000L;
    private static final String BREAKING_SEEN_KEY = "breaking_seen_v1";

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
        Context app = getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(NewsTestScheduler.PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putLong(NewsTestScheduler.LAST_RUN_AT, System.currentTimeMillis())
                .putString(NewsTestScheduler.LAST_ERROR, "")
                .apply();
        try {
            List<NewsItem> items = fetchVerifiedItems();
            prefs.edit().putInt(NewsTestScheduler.LAST_ITEM_COUNT, items.size()).apply();

            if (!items.isEmpty()) {
                ZonedDateTime now = ZonedDateTime.now(ISTANBUL);
                sendBreakingIfNeeded(items, now);
                sendDigestIfDue(items, now);
                sendRoutineIfDue(items, now);
            }

            prefs.edit()
                    .putLong(NewsTestScheduler.LAST_SUCCESS_AT, System.currentTimeMillis())
                    .apply();
            return Result.success();
        } catch (Exception error) {
            prefs.edit()
                    .putString(NewsTestScheduler.LAST_ERROR, String.valueOf(error.getMessage()))
                    .apply();
            return Result.retry();
        } finally {
            NewsTestScheduler.scheduleDailyTargets(app);
        }
    }

    // Son dakika kuralları ve aralık/konu sınırları bulutla aynıdır (BreakingNewsRules).
    // Gösterilen son dakikalar (buluttan gelenler dahil) NotificationHelper kaydından okunur.
    private void sendBreakingIfNeeded(List<NewsItem> items, ZonedDateTime now) {
        Context app = getApplicationContext();
        Instant nowInstant = now.toInstant();
        long nowMs = nowInstant.toEpochMilli();
        List<BreakingNewsRules.Holding> holdings = loadHoldings(app);
        List<BreakingNewsRules.LogEntry> log = NotificationHelper.breakingLog(app);
        SharedPreferences prefs = app.getSharedPreferences(NewsTestScheduler.PREFS, Context.MODE_PRIVATE);
        List<String> seen = readSeen(prefs);

        List<NewsItem> fresh = new ArrayList<>();
        Map<NewsItem, BreakingNewsRules.Classification> classified = new HashMap<>();
        for (NewsItem item : items) {
            if (item.publishedAt == null || seen.contains(item.url)) continue;
            long age = Duration.between(item.publishedAt, nowInstant).toMinutes();
            if (age < -5 || age > BREAKING_MAX_AGE_MINUTES) continue;
            BreakingNewsRules.Classification classification = BreakingNewsRules.classify(item.title, "", holdings);
            if (classification == null) continue;
            fresh.add(item);
            classified.put(item, classification);
        }
        fresh.sort(Comparator.comparingInt((NewsItem item) -> classified.get(item).priority)
                .thenComparing((NewsItem item) -> item.publishedAt, Comparator.reverseOrder()));

        for (NewsItem item : fresh) {
            BreakingNewsRules.Classification classification = classified.get(item);
            String decision = BreakingNewsRules.guard(log, classification, nowMs, false);
            if ("defer".equals(decision)) continue;
            seen.add(item.url);
            if ("drop".equals(decision)) continue;
            Map<String, String> data = new HashMap<>();
            data.put("kind", "news_breaking");
            data.put("news_id", item.url);
            data.put("news_url", item.url);
            data.put("title", classification.title());
            data.put("body", shorten(item.title, 120));
            data.put("breaking_reason", classification.reason);
            if (!classification.ticker.isEmpty()) data.put("ticker", classification.ticker);
            NotificationHelper.show(app, data);
            break;
        }
        writeSeen(prefs, seen);
    }

    private static List<String> readSeen(SharedPreferences prefs) {
        List<String> seen = new ArrayList<>();
        try {
            JSONArray stored = new JSONArray(prefs.getString(BREAKING_SEEN_KEY, "[]"));
            for (int i = 0; i < stored.length(); i++) seen.add(stored.optString(i, ""));
        } catch (Exception ignored) {}
        return seen;
    }

    private static void writeSeen(SharedPreferences prefs, List<String> seen) {
        JSONArray stored = new JSONArray();
        for (int i = Math.max(0, seen.size() - 100); i < seen.size(); i++) stored.put(seen.get(i));
        prefs.edit().putString(BREAKING_SEEN_KEY, stored.toString()).apply();
    }

    // Uygulamanın kendi portföy kaydı (MainActivity PREFS / PORTFOLIO_KEY); yalnız eldeki hisseler.
    private static List<BreakingNewsRules.Holding> loadHoldings(Context context) {
        List<BreakingNewsRules.Holding> result = new ArrayList<>();
        try {
            SharedPreferences prefs = context.getSharedPreferences("halka_arz_portfoy", Context.MODE_PRIVATE);
            String raw = prefs.getString("portfolio_json_v1", "");
            if (raw == null || raw.trim().isEmpty()) raw = prefs.getString("portfolio_json_v1_backup", "");
            JSONArray holdings = new JSONObject(raw == null || raw.trim().isEmpty() ? "{}" : raw).optJSONArray("holdings");
            if (holdings == null) return result;
            for (int i = 0; i < holdings.length(); i++) {
                JSONObject holding = holdings.optJSONObject(i);
                if (holding == null || holding.optDouble("currentLots", 0d) <= 0d) continue;
                JSONObject ipo = holding.optJSONObject("ipoSnapshot");
                String company = ipo != null && !ipo.optString("company", "").trim().isEmpty()
                        ? ipo.optString("company", "")
                        : holding.optString("company", "");
                result.add(new BreakingNewsRules.Holding(holding.optString("ticker", ""), company));
            }
        } catch (Exception ignored) {}
        return result;
    }

    private void sendDigestIfDue(List<NewsItem> items, ZonedDateTime now) {
        int minuteOfDay = now.getHour() * 60 + now.getMinute();
        String slot;
        ZonedDateTime start;
        ZonedDateTime end;
        if (minuteOfDay >= 19 * 60) {
            slot = "evening";
            start = now.toLocalDate().atTime(10, 0).atZone(ISTANBUL);
            end = now.toLocalDate().atTime(19, 0).atZone(ISTANBUL);
        } else if (minuteOfDay >= 10 * 60) {
            slot = "morning";
            start = now.toLocalDate().minusDays(1).atTime(19, 0).atZone(ISTANBUL);
            end = now.toLocalDate().atTime(10, 0).atZone(ISTANBUL);
        } else {
            return;
        }

        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences(NewsTestScheduler.PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(NewsTestScheduler.LAST_DIGEST_SLOT, slot)
                .putLong(NewsTestScheduler.LAST_DIGEST_ATTEMPT_AT, System.currentTimeMillis())
                .putBoolean(NewsTestScheduler.LAST_DIGEST_DELIVERED, false)
                .apply();

        Instant startInstant = start.toInstant();
        List<NewsItem> eligible = new ArrayList<>();
        for (NewsItem item : items) {
            if (item.publishedAt == null) continue;
            if (item.publishedAt.isBefore(startInstant) || !item.publishedAt.isBefore(end.toInstant())) continue;
            eligible.add(item);
        }
        if (eligible.isEmpty()) {
            for (NewsItem item : items) {
                if (item.publishedAt == null) continue;
                if (!item.publishedAt.isAfter(end.toInstant().minus(Duration.ofHours(24)))
                        || item.publishedAt.isAfter(end.toInstant())) continue;
                eligible.add(item);
            }
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
        String digestBody = body.toString();
        data.put("title", "morning".equals(slot) ? "Sabah Finans Özeti" : "Akşam Finans Özeti");
        data.put("body", digestBody);
        if (selected.size() == 1) data.put("news_url", selected.get(0).url);
        boolean delivered = NotificationHelper.show(getApplicationContext(), data);
        prefs.edit()
                .putBoolean(NewsTestScheduler.LAST_DIGEST_DELIVERED, delivered)
                .apply();
    }

    private void sendRoutineIfDue(List<NewsItem> items, ZonedDateTime now) {
        long lastDeliveredAt = NotificationHelper.lastNewsDeliveredAt(getApplicationContext());
        long nowMs = now.toInstant().toEpochMilli();
        if (lastDeliveredAt > 0L && nowMs - lastDeliveredAt < ROUTINE_NEWS_INTERVAL_MS) return;

        List<NewsItem> eligible = new ArrayList<>();
        Instant nowInstant = now.toInstant();
        for (NewsItem item : items) {
            if (item.publishedAt == null || item.publishedAt.isAfter(nowInstant)) continue;
            eligible.add(item);
        }
        if (eligible.isEmpty()) return;

        eligible.sort((a, b) -> {
            int importance = Integer.compare(b.importance, a.importance);
            if (importance != 0) return importance;
            return b.publishedAt.compareTo(a.publishedAt);
        });

        NewsItem selected = eligible.get(0);
        int slotHour = (now.getHour() / 6) * 6;
        String slot = String.format(Locale.ROOT, "routine-%02d", slotHour);
        String body = "• " + shorten(selected.title, 72);

        Map<String, String> data = new HashMap<>();
        data.put("kind", "news_digest");
        data.put("digest_slot", slot);
        data.put("digest_day", now.toLocalDate().toString());
        data.put("routine_interval_hours", "6");
        data.put("title", NewsNotificationFormatter.digestTitle("Finans Gündemi", body));
        data.put("body", body);
        data.put("news_url", selected.url);
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
            String rawTitle = NewsNotificationFormatter.cleanHeadline(cleanFeedTitle(item.optString("title", "")));
            if (isGenericTitle(rawTitle)) continue;
            Instant feedPublishedAt = parseInstant(item.optString("publishedAt", ""));
            candidates.add(new NewsItem(url, rawTitle, category, feedPublishedAt, score(rawTitle)));
            if (candidates.size() >= MAX_ARTICLES_TO_VERIFY) break;
        }

        List<NewsItem> verified = new ArrayList<>();
        for (NewsItem candidate : candidates) {
            String title = NewsNotificationFormatter.cleanHeadline(candidate.title);
            Instant publishedAt = candidate.publishedAt;

            // Try to repair the feed headline from the article's real og:title.
            // Failure here must never discard a feed item that already has a valid time.
            try {
                ArticleMetadata metadata = fetchArticleMetadata(candidate.url);
                if (metadata.title != null && !metadata.title.isEmpty()) {
                    title = NewsNotificationFormatter.cleanHeadline(metadata.title);
                }
                if (publishedAt == null) publishedAt = metadata.publishedAt;
            } catch (Exception ignored) {
                // Feed timestamp/title remain usable as a resilient fallback.
            }

            if (publishedAt == null || isGenericTitle(title)) continue;
            verified.add(new NewsItem(
                    candidate.url,
                    title,
                    candidate.category,
                    publishedAt,
                    score(title)
            ));
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

        if (title != null && title.length() < 8) title = null;
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
        boolean centralBank = containsAny(
                title,
                "tcmb",
                "para politikası kurulu",
                "ppk",
                "merkez bankası",
                "federal reserve",
                " fed ",
                "fomc",
                "avrupa merkez bankası",
                " amb ",
                " ecb ",
                "bank of england",
                " boe ",
                "bank of japan",
                " boj ",
                "people's bank of china",
                "pbc",
                "pboc",
                "isviçre merkez bankası",
                "snb",
                "bank of canada",
                "reserve bank"
        );
        boolean rate = containsAny(title, "politika faiz", "faiz karar", "faiz oran", "faizini", "faizi", "zorunlu karşılık", "likidite");
        boolean decision = containsAny(
                title,
                "artırdı",
                "indirdi",
                "sabit tuttu",
                "kararını açıkladı",
                "değiştirdi",
                "karar verdi",
                "beklentilere paralel",
                "olağanüstü"
        );
        if (centralBank && rate && decision) return 5;

        boolean marketWide = containsAny(title, "borsa istanbul", "bist", "piyasa geneli", "pay piyasası");
        boolean halt = containsAny(title, "işlemleri durdur", "işlemlere ara ver", "devre kesici");
        if (marketWide && halt) return 5;

        boolean regulator = containsAny(title, "spk", "sermaye piyasası kurulu", "hazine ve maliye", "resmî gazete", "resmi gazete");
        boolean restriction = containsAny(title, "açığa satış yasa", "işlem yasa", "olağanüstü tedbir", "stopaj", "vergi oran");
        if (regulator && restriction) return 5;

        boolean financialContext = containsAny(
                title,
                "finans",
                "fon",
                "borsa",
                "hisse",
                "yatırım",
                "banka",
                "bankacılık",
                "piyasa",
                "sermaye",
                "spk",
                "şirket",
                "holding",
                "portföy",
                "kripto",
                "döviz"
        );
        boolean enforcementAction = containsAny(
                title,
                "gözalt",
                "tutuklan",
                "yakalama kararı",
                "operasyon",
                "malvarlığ",
                "tutar dondur",
                "el koy",
                "kayyum"
        );
        if (title.contains("dondur") && containsAny(title, "tutar", "hesap", "varlık", "milyon", "milyar")) {
            enforcementAction = true;
        }
        if (financialContext && enforcementAction) return 5;

        boolean ministerStatement = containsAny(title, "bakan ", "bakanl", "bakan'dan", "bakan’dan")
                && containsAny(title, "açıkl", "duyur", "bildir", "konuş", "değerlendir");
        if (ministerStatement) return 5;

        if (centralBank || regulator || title.contains("borsa istanbul")) return 4;
        if (containsAny(title, "halka arz", "sermaye artır", "temettü", "bilanço", "kredi not", "enflasyon", "işsizlik", "büyüme", "döviz rezerv")) return 3;
        if (containsAny(title, "dolar", "euro", "altın", "borsa", "endeks", "hisse")) return 2;
        return 1;
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
