package com.innative.halkaarz;

import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;

public final class BackgroundRetryPolicyHarness {
    private static void expect(boolean actual, boolean expected, String label) {
        if (actual != expected) {
            throw new AssertionError(label + ": expected " + expected + " but got " + actual);
        }
    }

    public static void main(String[] args) {
        int[] retryStatuses = {408, 425, 429, 500, 502, 503, 599};
        for (int status : retryStatuses) {
            expect(BackgroundRetryPolicy.isRetryableHttpStatus(status), true, "retry HTTP " + status);
        }

        int[] permanentStatuses = {400, 401, 403, 404, 409, 422};
        for (int status : permanentStatuses) {
            expect(BackgroundRetryPolicy.isRetryableHttpStatus(status), false, "permanent HTTP " + status);
        }

        expect(BackgroundRetryPolicy.shouldRetry(new UnknownHostException("offline")), true, "unknown host");
        expect(BackgroundRetryPolicy.shouldRetry(new SocketTimeoutException("timeout")), true, "socket timeout");
        expect(BackgroundRetryPolicy.shouldRetry(new ConnectException("connect")), true, "connect failure");
        expect(BackgroundRetryPolicy.shouldRetry(new IOException("io")), true, "generic IO");
        expect(BackgroundRetryPolicy.shouldRetry(new BackgroundRetryPolicy.HttpStatusException(503)), true, "HTTP 503 exception");
        expect(BackgroundRetryPolicy.shouldRetry(new BackgroundRetryPolicy.HttpStatusException(404)), false, "HTTP 404 exception");
        expect(BackgroundRetryPolicy.shouldRetry(new RuntimeException("outer", new UnknownHostException("offline"))), true, "nested network failure");
        expect(BackgroundRetryPolicy.shouldRetry(new IllegalArgumentException("bad data")), false, "data/programming failure");
    }
}
