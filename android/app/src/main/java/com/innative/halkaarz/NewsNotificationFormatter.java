package com.innative.halkaarz;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class NewsNotificationFormatter {
    private static final String GENERIC_TITLE = "📰 Ekonomi ve Finans Gündemi";
    private static final String[] DESCRIPTION_MARKERS = new String[] {
            " Türkiye Cumhuriyet Merkez Bankası",
            " Türkiye Cumhuriyet Merk",
            " TCMB,",
            " SPK,",
            " Sermaye Piyasası Kurulu",
            " Bloomberg HT",
            " Anadolu Ajansı",
            " AA,",
            " Hazine ve Maliye Bakanlığı"
    };

    private NewsNotificationFormatter() {}

    static String digestTitle(String originalTitle, String rawBody) {
        List<String> headlines = digestHeadlines(rawBody);
        if (headlines.isEmpty()) return nonEmpty(originalTitle, GENERIC_TITLE);

        int rateCount = 0;
        int economyDataCount = 0;
        for (String headline : headlines) {
            String text = headline.toLowerCase(Locale.forLanguageTag("tr-TR"));
            if (containsAny(text, "politika faizi", "faiz kararı", "faiz oranı", "faizi ", " faiz ")) {
                rateCount += 1;
            }
            if (containsAny(text, "enflasyon", "büyüme", "işsizlik", "üretici fiyat", "tüketici fiyat")) {
                economyDataCount += 1;
            }
        }

        int required = headlines.size() <= 1 ? 1 : Math.max(2, (headlines.size() + 1) / 2);
        if (rateCount >= required) return "🏦 Faiz ve Piyasa Gündemi";
        if (economyDataCount >= required) return "📊 Ekonomi Verileri Gündemde";

        String original = nonEmpty(originalTitle, "");
        if (original.contains("Faiz ve Piyasa Gündemi") || original.contains("Ekonomi Verileri Gündemde")) {
            return GENERIC_TITLE;
        }
        return original.isEmpty() ? GENERIC_TITLE : original;
    }

    static String digestBody(String rawBody) {
        List<String> headlines = digestHeadlines(rawBody);
        if (headlines.isEmpty()) return cleanText(rawBody);
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < headlines.size(); i++) {
            if (i > 0) result.append("\n\n");
            result.append("• ").append(headlines.get(i));
        }
        return result.toString();
    }

    static CharSequence spacedDigestBody(String body) {
        return digestBody(body).replace("\n\n", "\n\u200B\n");
    }

    static String cleanHeadline(String value) {
        String text = cleanText(value)
                .replaceFirst("(?iu)^(?:HABERLER|PİYASALAR)\\s+", "")
                .trim();
        for (String marker : DESCRIPTION_MARKERS) {
            int index = text.indexOf(marker);
            if (index >= 24) {
                text = text.substring(0, index).trim();
                break;
            }
        }
        return text
                .replaceFirst("(?u)(?:\\.\\.\\.|…)+$", "")
                .trim();
    }

    private static List<String> digestHeadlines(String rawBody) {
        List<String> result = new ArrayList<>();
        String[] lines = String.valueOf(rawBody == null ? "" : rawBody).split("\\r?\\n");
        for (String line : lines) {
            String text = cleanText(line).replaceFirst("^[•\\-]\\s*", "").trim();
            if (text.isEmpty()) continue;
            text = cleanHeadline(text);
            if (!text.isEmpty()) result.add(shorten(text, 72));
            if (result.size() >= 4) break;
        }
        return result;
    }

    private static boolean containsAny(String value, String... needles) {
        for (String needle : needles) if (value.contains(needle)) return true;
        return false;
    }

    private static String nonEmpty(String value, String fallback) {
        String text = cleanText(value);
        return text.isEmpty() ? fallback : text;
    }

    private static String cleanText(String value) {
        return String.valueOf(value == null ? "" : value).replaceAll("\\s+", " ").trim();
    }

    private static String shorten(String value, int maxLength) {
        String text = cleanText(value);
        if (text.length() <= maxLength) return text;
        return text.substring(0, Math.max(1, maxLength - 1)).trim() + "…";
    }
}
