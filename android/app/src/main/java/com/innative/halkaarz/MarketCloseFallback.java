package com.innative.halkaarz;

/** Pure rules for the persisted post-close price fallback. */
final class MarketCloseFallback {
    private MarketCloseFallback() {}

    static boolean shouldCapture(String quoteDay, String currentDay, int localHour, double currentPrice) {
        return isIsoDay(quoteDay)
                && quoteDay.equals(currentDay)
                && localHour >= 20
                && Double.isFinite(currentPrice)
                && currentPrice > 0;
    }

    static double choosePreviousClose(double verifiedPreviousClose, String cachedDay, double cachedClose, String currentDay) {
        if (Double.isFinite(verifiedPreviousClose) && verifiedPreviousClose > 0) return verifiedPreviousClose;
        if (!isIsoDay(cachedDay) || !isIsoDay(currentDay)) return Double.NaN;
        if (cachedDay.compareTo(currentDay) >= 0) return Double.NaN;
        return Double.isFinite(cachedClose) && cachedClose > 0 ? cachedClose : Double.NaN;
    }

    private static boolean isIsoDay(String value) {
        return value != null && value.matches("\\d{4}-\\d{2}-\\d{2}");
    }
}
