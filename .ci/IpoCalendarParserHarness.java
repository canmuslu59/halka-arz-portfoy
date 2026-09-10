package com.innative.halkaarz;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public final class IpoCalendarParserHarness {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("html path required");
        String html = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        List<IpoCalendarParser.Entry> entries = IpoCalendarParser.parse(html);
        IpoCalendarParser.Entry netgl = entries.stream()
                .filter(e -> "NETGL".equals(e.ticker))
                .findFirst()
                .orElseThrow(() -> new AssertionError("native parser: NETGL missing"));
        if (netgl.company == null || !netgl.company.toLowerCase(java.util.Locale.ROOT).contains("net global")) {
            throw new AssertionError("native parser: NETGL company invalid: " + netgl.company);
        }
        if (netgl.offerDates == null || !netgl.offerDates.contains("Eylül 2026")) {
            throw new AssertionError("native parser: NETGL offer dates invalid: " + netgl.offerDates);
        }
        System.out.println("NATIVE_NETGL_OK ticker=" + netgl.ticker + " dates=" + netgl.offerDates + " company=" + netgl.company);
    }
}
