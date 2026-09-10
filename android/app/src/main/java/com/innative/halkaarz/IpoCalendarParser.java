package com.innative.halkaarz;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class IpoCalendarParser {
    static final class Entry {
        final String ticker;
        final String company;
        final String offerDates;
        Entry(String ticker, String company, String offerDates) {
            this.ticker = ticker;
            this.company = company;
            this.offerDates = offerDates;
        }
    }

    private static final Pattern COMPLETED = Pattern.compile("(?iu)Tamamlanm(?:ış|is)\\s+Halka\\s+Arzlar");
    private static final Pattern LINK = Pattern.compile("(?is)<a\\b[^>]*href=[\"']([^\"']*/halka-arz/[^\"'?#]+)[\"'][^>]*>([\\s\\S]*?)</a>");
    private static final Pattern TICKER_STATE = Pattern.compile("(?iu)\\b([A-ZÇĞİÖŞÜ0-9]{3,8})\\s+(Aktif|Yaklaşan)\\b");
    private static final Pattern DATE = Pattern.compile("(?iu)Talep\\s+Tarih(?:leri|i)\\s*((?:\\d{1,2}\\s*[-–—]\\s*)?\\d{1,2}\\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\\s+20\\d{2})");

    private IpoCalendarParser() {}

    static List<Entry> parse(String html) {
        String raw = html == null ? "" : html;
        Matcher completed = COMPLETED.matcher(stripHtmlKeepHeadings(raw));
        int end = raw.length();
        if (completed.find()) {
            String marker = completed.group();
            int rawMarker = raw.toLowerCase(Locale.ROOT).indexOf(marker.toLowerCase(Locale.ROOT));
            if (rawMarker >= 0) end = rawMarker;
        }
        String scope = raw.substring(0, Math.max(0, Math.min(end, raw.length())));

        List<Link> links = new ArrayList<>();
        Matcher matcher = LINK.matcher(scope);
        while (matcher.find()) {
            String href = matcher.group(1);
            String anchor = stripHtml(matcher.group(2));
            Link previous = links.isEmpty() ? null : links.get(links.size() - 1);
            if (previous != null && previous.href.equals(href)) continue;
            links.add(new Link(href, anchor, matcher.start()));
        }

        Map<String, Entry> unique = new LinkedHashMap<>();
        for (int i = 0; i < links.size(); i++) {
            Link link = links.get(i);
            int cardEnd = i + 1 < links.size() ? links.get(i + 1).start : scope.length();
            String cardText = stripHtml(scope.substring(link.start, cardEnd));
            if (!cardText.matches("(?is).*Talep\\s+Tarih(?:leri|i).*")) continue;
            Matcher ticker = TICKER_STATE.matcher(cardText);
            if (!ticker.find()) continue;
            String symbol = normalizeTicker(ticker.group(1));
            if (symbol.isEmpty()) continue;

            String company = link.anchor;
            if (company.isEmpty() || company.toLowerCase(Locale.ROOT).matches(".*(katıl|incele|detay).*")) {
                int tickerPos = cardText.indexOf(ticker.group(0));
                company = tickerPos > 0 ? cardText.substring(0, tickerPos).trim() : symbol;
            }
            company = company.replaceAll("(?iu)\\s+" + Pattern.quote(symbol) + "\\s*$", "").trim();
            if (company.length() > 180) company = symbol;

            Matcher date = DATE.matcher(cardText);
            String dates = date.find() ? date.group(1).replace('–','-').replace('—','-').replaceAll("\\s*-\\s*", "-").trim() : "";
            unique.putIfAbsent(symbol, new Entry(symbol, company, dates));
        }
        return new ArrayList<>(unique.values());
    }

    private static String normalizeTicker(String value) {
        return value == null ? "" : value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    private static String stripHtmlKeepHeadings(String html) {
        return stripHtml(html);
    }

    private static String stripHtml(String html) {
        return String.valueOf(html == null ? "" : html)
                .replaceAll("(?is)<script\\b[^>]*>.*?</script>", " ")
                .replaceAll("(?is)<style\\b[^>]*>.*?</style>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", "\"")
                .replace("&#39;", "'").replaceAll("\\s+", " ").trim();
    }

    private static final class Link {
        final String href;
        final String anchor;
        final int start;
        Link(String href, String anchor, int start) { this.href = href; this.anchor = anchor; this.start = start; }
    }
}
