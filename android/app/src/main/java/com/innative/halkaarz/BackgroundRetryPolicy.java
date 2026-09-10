package com.innative.halkaarz;

import java.io.IOException;

final class BackgroundRetryPolicy {
    private BackgroundRetryPolicy() {}

    static boolean isRetryableHttpStatus(int status) {
        return status == 408
                || status == 425
                || status == 429
                || (status >= 500 && status <= 599);
    }

    static boolean shouldRetry(Throwable error) {
        Throwable current = error;
        int depth = 0;
        while (current != null && depth < 8) {
            if (current instanceof HttpStatusException) {
                return isRetryableHttpStatus(((HttpStatusException) current).status);
            }
            if (current instanceof IOException) return true;
            current = current.getCause();
            depth += 1;
        }
        return false;
    }

    static final class HttpStatusException extends IOException {
        final int status;

        HttpStatusException(int status) {
            super("HTTP " + status);
            this.status = status;
        }
    }
}
