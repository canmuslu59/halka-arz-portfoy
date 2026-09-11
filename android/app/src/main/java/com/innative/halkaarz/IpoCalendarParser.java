package com.innative.halkaarz;

import java.util.ArrayList;
import java.util.Collections;
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
            this.ticker = normalizeTicker(ticker);
            this.company = clean(company);
            this.offerDates = clean(offerDates);
        }
    }

    private static final Pattern GEDIK_ACTIVE = Pattern.compile(
            "\\b([A-Z0-9]{3,8})\\s+(.{3,180}?A\\.?\\s*Ş\\.?)\\s+(?:(?:AKTİF|Aktif|aktif)\\s+)?((?:\\d{1,2}\\s*[-–—]\\s*){0,2}\\d{1,2}\\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\\s+20\\d{2})\\s+[0-9.]+(?:,[0-9]+)?\\s*TL"
    );

    private IpoCalendarParser() {}

    static List<Entry> parseGedik(String html) {
        String text = stripHtml(html);
        if (text.isEmpty()) return Collections.emptyList();
        Map<String, Entry> rows = new LinkedHashMap<>();
        Matcher matcher = GEDIK_ACTIVE.matcher(text);
        while (matcher.find()) {
            String ticker = normalizeTicker(matcher.group(1));
            if (ticker.isEmpty()) continue;
            String company = clean(matcher.group(2));
            String dates = normalizeGedikDates(matcher.group(3));
            rows.put(ticker, new Entry(ticker, company, dates));
        }
        return new ArrayList<>(rows.values());
    }

    private static String normalizeGedikDates(String value) {
        String text = clean(value);
        Matcher triple = Pattern.compile("^(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+(.+)$").matcher(text);
        if (triple.find()) return triple.group(1) + "-" + triple.group(3) + " " + clean(triple.group(4));
        return text.replaceAll("\\s*[-–—]\\s*", "-");
    }

    static List<Entry> parse(String html) {
        String text = stripHtml(html);
        if (text.isEmpty()) return Collections.emptyList();
        List<Entry> entries = new ArrayList<>();
        Matcher matcher = Pattern.compile(
                "(?iu)\\b([A-Z0-9]{3,8})\\b\\s+(.{3,180}?A\\.?\\s*Ş\\.?)\\s+((?:\\d{1,2}\\s*[-–—]\\s*){0,2}\\d{1,2}\\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\\s+20\\d{2})"
        ).matcher(text);
        while (matcher.find()) {
            String ticker = normalizeTicker(matcher.group(1));
            if (ticker.isEmpty()) continue;
            entries.add(new Entry(ticker, matcher.group(2), matcher.group(3)));
        }
        return entries;
    }

    private static String normalizeTicker(String value) {
        return String.valueOf(value == null ? "" : value)
                .trim().toUpperCase(Locale.ROOT)
                .replace(".IS", "")
                .replaceAll("[^A-Z0-9]", "");
    }

    private static String clean(String value) {
        return String.valueOf(value == null ? "" : value).replaceAll("\\s+", " ").trim();
    }

    private static String stripHtml(String html) {
        return String.valueOf(html == null ? "" : html)
                .replaceAll("(?is)<script\\b[^>]*>.*?</script>", " ")
                .replaceAll("(?is)<style\\b[^>]*>.*?</style>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replaceAll("\\s+", " ")
                .trim();
    }
}