package com.innative.halkaarz;

public final class MarketCloseFallbackProbe {
    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void requireClose(double actual, double expected, String message) {
        if (!Double.isFinite(actual) || Math.abs(actual - expected) > 1e-9) {
            throw new AssertionError(message + ": expected=" + expected + " actual=" + actual);
        }
    }

    public static void main(String[] args) {
        require(MarketCloseFallback.shouldCapture("2026-09-15", "2026-09-15", 20, 123.45),
                "20:00 sonrası aynı işlem gününün kapanışı kaydedilmeli");
        require(!MarketCloseFallback.shouldCapture("2026-09-15", "2026-09-15", 19, 123.45),
                "20:00 öncesi kapanış snapshot'ı alınmamalı");
        require(!MarketCloseFallback.shouldCapture("2026-09-12", "2026-09-15", 20, 123.45),
                "eski piyasa günü yeni kapanış gibi kaydedilmemeli");

        requireClose(MarketCloseFallback.choosePreviousClose(101.25, "2026-09-14", 99.50, "2026-09-15"), 101.25,
                "doğrulanmış previousClose her zaman öncelikli olmalı");
        requireClose(MarketCloseFallback.choosePreviousClose(Double.NaN, "2026-09-14", 99.50, "2026-09-15"), 99.50,
                "doğrulanmış referans yoksa önceki işlem gününün saklı kapanışı kullanılmalı");
        requireClose(MarketCloseFallback.choosePreviousClose(Double.NaN, "2026-09-11", 88.10, "2026-09-14"), 88.10,
                "hafta sonu boyunca cuma kapanışı pazartesi referansı olarak kullanılabilmeli");
        require(Double.isNaN(MarketCloseFallback.choosePreviousClose(Double.NaN, "2026-09-15", 99.50, "2026-09-15")),
                "aynı gün kaydı previousClose fallback olmamalı");
        require(Double.isNaN(MarketCloseFallback.choosePreviousClose(Double.NaN, "2026-09-16", 99.50, "2026-09-15")),
                "gelecek tarihli kayıt reddedilmeli");
    }
}
