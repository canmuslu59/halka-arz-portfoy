package com.innative.halkaarz;

import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

final class NativeHttpPolicy {
    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList(
            "query1.finance.yahoo.com",
            "www.ahlatciyatirim.com.tr",
            "ahlatciyatirim.com.tr",
            "gedik.com",
            "www.gedik.com",
            "fintables.com",
            "www.fintables.com",
            "webservice.foreks.com",
            "oyakyatirim.com.tr",
            "www.oyakyatirim.com.tr"
    ));

    private NativeHttpPolicy() {}

    static boolean isAllowed(URL url) {
        if (url == null || !"https".equalsIgnoreCase(url.getProtocol())) return false;
        String host = url.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        return ALLOWED_HOSTS.contains(host);
    }

    static URL requireAllowed(String urlText) throws Exception {
        return requireAllowed(new URL(urlText));
    }

    static URL requireAllowed(URL url) {
        if (!isAllowed(url)) {
            throw new IllegalArgumentException("Bu veri kaynağına izin verilmiyor.");
        }
        return url;
    }

    static URL resolveRedirect(URL current, String location) throws Exception {
        if (location == null || location.trim().isEmpty()) {
            throw new IllegalArgumentException("Geçersiz yönlendirme yanıtı.");
        }
        URL target = new URL(current, location.trim());
        return requireAllowed(target);
    }
}
