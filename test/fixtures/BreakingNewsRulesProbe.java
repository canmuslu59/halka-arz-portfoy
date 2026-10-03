package com.innative.halkaarz;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

// test/news-breaking-rules.test.js tarafından düz javac ile derlenip çalıştırılır.
// classify satırı: başlık \t özet \t KOD1,KOD2 \t şirket1|şirket2
// guard satırı:    sebep \t kod \t şimdiMs \t buTurdaGönderildi \t anahtar@ms,anahtar@ms
public final class BreakingNewsRulesProbe {
    public static void main(String[] args) throws Exception {
        List<String> lines = Files.readAllLines(Paths.get(args[1]), StandardCharsets.UTF_8);
        for (String line : lines) {
            String[] parts = line.split("\t", -1);
            if ("classify".equals(args[0])) {
                List<BreakingNewsRules.Holding> holdings = new ArrayList<>();
                String[] tickers = parts[2].isEmpty() ? new String[0] : parts[2].split(",");
                String[] companies = parts[3].isEmpty() ? new String[0] : parts[3].split("\\|", -1);
                for (int i = 0; i < tickers.length; i++) {
                    holdings.add(new BreakingNewsRules.Holding(tickers[i], i < companies.length ? companies[i] : ""));
                }
                BreakingNewsRules.Classification result = BreakingNewsRules.classify(parts[0], parts[1], holdings);
                System.out.println(result == null ? "null|" : result.reason + "|" + result.ticker);
            } else {
                List<BreakingNewsRules.LogEntry> log = new ArrayList<>();
                if (!parts[4].isEmpty()) {
                    for (String entry : parts[4].split(",")) {
                        int at = entry.lastIndexOf('@');
                        log.add(new BreakingNewsRules.LogEntry(entry.substring(0, at), Long.parseLong(entry.substring(at + 1))));
                    }
                }
                BreakingNewsRules.Classification classification = new BreakingNewsRules.Classification(parts[0], parts[1]);
                System.out.println(BreakingNewsRules.guard(log, classification, Long.parseLong(parts[2]), Boolean.parseBoolean(parts[3])));
            }
        }
    }
}
