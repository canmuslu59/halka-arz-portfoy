package com.innative.halkaarz;

final class AlertPolicy {
    enum Zone { NEUTRAL, UP, DOWN }

    private AlertPolicy() {}

    static Zone classify(double dailyPct, double threshold) {
        if (!Double.isFinite(dailyPct) || !Double.isFinite(threshold) || threshold <= 0.0) {
            return Zone.NEUTRAL;
        }
        if (dailyPct >= threshold) return Zone.UP;
        if (dailyPct <= -threshold) return Zone.DOWN;
        return Zone.NEUTRAL;
    }

    static boolean shouldNotify(Zone previous, Zone current) {
        return current != Zone.NEUTRAL && current != previous;
    }
}
