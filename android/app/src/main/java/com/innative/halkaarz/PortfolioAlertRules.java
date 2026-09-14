package com.innative.halkaarz;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Pure portfolio threshold and aligned-sample calculations; no Android dependencies. */
final class PortfolioAlertRules {
    private PortfolioAlertRules() {}

    static List<Double> levels(double percent, double threshold) {
        List<Double> levels = new ArrayList<>();
        if (!Double.isFinite(percent)) return levels;
        double step = Math.round(Math.max(1, Math.min(10, Double.isFinite(threshold) ? threshold : 3)) * 2) / 2.0;
        int count = (int)Math.floor((Math.abs(percent) + 1e-9) / step);
        // Quotes outside normal price bounds must not cause an unbounded notification loop.
        count = Math.min(count, 100);
        double sign = percent < 0 ? -1 : 1;
        for (int index = 1; index <= count; index++) levels.add(sign * Math.round(index * step * 2) / 2.0);
        return levels;
    }

    static List<Double> sampledPercentages(List<Map<Long, Double>> positionValues, double previousValue, long sinceEpoch) {
        List<Double> result = new ArrayList<>();
        if (positionValues.isEmpty() || !(previousValue > 0) || !Double.isFinite(previousValue)) return result;
        Map<Long, Double> first = new TreeMap<>(positionValues.get(0));
        for (Long timestamp : first.keySet()) {
            if (timestamp < sinceEpoch) continue;
            double total = 0;
            boolean complete = true;
            for (Map<Long, Double> position : positionValues) {
                Double value = position.get(timestamp);
                if (value == null || !(value > 0) || !Double.isFinite(value)) { complete = false; break; }
                total += value;
            }
            if (complete) result.add((total - previousValue) / previousValue * 100.0);
        }
        return result;
    }
}
