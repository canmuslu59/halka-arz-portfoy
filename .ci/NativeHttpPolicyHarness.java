package com.innative.halkaarz;

import java.net.URL;

public final class NativeHttpPolicyHarness {
    private static void assertTrue(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    private static void assertRejected(String url, String message) throws Exception {
        assertTrue(!NativeHttpPolicy.isAllowed(new URL(url)), message);
    }

    public static void main(String[] args) throws Exception {
        assertTrue(NativeHttpPolicy.isAllowed(new URL("https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS")), "Yahoo quote host must be allowed");
        assertTrue(NativeHttpPolicy.isAllowed(new URL("https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1")), "Ahlatci host must be allowed");
        assertTrue(NativeHttpPolicy.isAllowed(new URL("https://fintables.com/sirketler/THYAO")), "Fintables host must be allowed");

        assertRejected("http://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS", "HTTP must be rejected");
        assertRejected("https://evil.example/data", "arbitrary hosts must be rejected");
        assertRejected("https://query1.finance.yahoo.com.evil.example/data", "suffix-confusion host must be rejected");
        assertRejected("https://www.ahlatciyatirim.com.tr.evil.example/data", "Ahlatci suffix-confusion host must be rejected");

        URL current = new URL("https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1");
        URL relative = NativeHttpPolicy.resolveRedirect(current, "/halka-arz?sayfa=2");
        assertTrue(NativeHttpPolicy.isAllowed(relative), "same-host relative redirect must remain allowed");

        boolean escaped = false;
        try {
            NativeHttpPolicy.resolveRedirect(current, "https://evil.example/capture");
        } catch (IllegalArgumentException expected) {
            escaped = true;
        }
        assertTrue(escaped, "redirect escape to a foreign host must be rejected before following it");
    }
}
