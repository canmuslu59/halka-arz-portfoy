from pathlib import Path
import re

root = Path('.')

def replace_once(path, old, new):
    p = root / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Keep the inherited Code19 regression suite aligned with the intentional Code22 behavior.
replace_once(
    'test/code19-behavior.test.js',
    """test('Android back button navigates WebView first and requires a second root press to exit', async () => {\n  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');\n  assert.match(main, /EXIT_BACK_WINDOW_MS\\s*=\\s*2000/);\n  assert.match(main, /if \\(webView != null && webView\\.canGoBack\\(\\)\\) \\{[\\s\\S]*webView\\.goBack\\(\\)/);\n  assert.match(main, /lastBackPressMs/);\n  assert.match(main, /Çıkmak için tekrar geri basın/);\n  assert.match(main, /now - lastBackPressMs <= EXIT_BACK_WINDOW_MS[\\s\\S]*super\\.onBackPressed\\(\\)/);\n});\n""",
    """test('Android back button delegates to SPA history first and requires a second root press to exit', async () => {\n  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');\n  const app = await read('public/app.js');\n  assert.match(main, /EXIT_BACK_WINDOW_MS\\s*=\\s*2000/);\n  assert.match(main, /__handleAndroidBack/);\n  assert.doesNotMatch(main, /webView\\.canGoBack\\(\\)/);\n  assert.match(app, /window\\.__handleAndroidBack\\s*=/);\n  assert.match(app, /history\\.back\\(\\)/);\n  assert.match(app, /navDepth/);\n  assert.match(main, /Çıkmak için tekrar geri basın/);\n  assert.match(main, /now - lastBackPressMs <= EXIT_BACK_WINDOW_MS[\\s\\S]*super\\.onBackPressed\\(\\)/);\n});\n""",
)

# Strengthen the inherited scheduler contract: IPO monitoring must work even with an empty portfolio.
p = root / 'test/code19-behavior.test.js'
text = p.read_text(encoding='utf-8')
text = text.replace(
    "test('Android schedules network-constrained periodic background market checks', async () => {",
    "test('Android schedules network-constrained background market and IPO checks even with an empty portfolio', async () => {",
    1,
)
needle = "  assert.match(scheduler, /enqueueUniquePeriodicWork/);\n  assert.match(sync, /BackgroundAlertScheduler\\.sync/);"
replacement = "  assert.match(scheduler, /enqueueUniquePeriodicWork/);\n  assert.match(scheduler, /OneTimeWorkRequest/);\n  assert.doesNotMatch(scheduler, /holdings\\.length\\(\\)\\s*>\\s*0/);\n  assert.match(sync, /BackgroundAlertScheduler\\.sync/);\n  assert.doesNotMatch(sync, /holdings\\.length\\(\\)\\s*>\\s*0/);"
if needle not in text:
    raise SystemExit('test/code19-behavior.test.js: scheduler assertion anchor missing')
text = text.replace(needle, replacement, 1)
p.write_text(text, encoding='utf-8')

# Production-native, dependency-free parser. CI compiles and executes this exact class against the live page twice.
helper = r'''package com.innative.halkaarz;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class IpoCalendarParser {
    static final class Entry {
        final String ticker;
        final String company;
        final String offerDates;
        Entry(String ticker, String company, String offerDates) {
            this.ticker = ticker;
            this.company = company;
            this.offerDates = offerDates;
        }
    }

    private static final Pattern COMPLETED = Pattern.compile("(?iu)Tamamlanm(?:ış|is)\\s+Halka\\s+Arzlar");
    private static final Pattern LINK = Pattern.compile("(?is)<a\\b[^>]*href=[\"']([^\"']*/halka-arz/[^\"'?#]+)[\"'][^>]*>([\\s\\S]*?)</a>");
    private static final Pattern TICKER_STATE = Pattern.compile("(?iu)\\b([A-ZÇĞİÖŞÜ0-9]{3,8})\\s+(Aktif|Yaklaşan)\\b");
    private static final Pattern DATE = Pattern.compile("(?iu)Talep\\s+Tarih(?:leri|i)\\s*((?:\\d{1,2}\\s*[-–—]\\s*)?\\d{1,2}\\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\\s+20\\d{2})");

    private IpoCalendarParser() {}

    static List<Entry> parse(String html) {
        String raw = html == null ? "" : html;
        Matcher completed = COMPLETED.matcher(stripHtmlKeepHeadings(raw));
        int end = raw.length();
        if (completed.find()) {
            String marker = completed.group();
            int rawMarker = raw.toLowerCase(Locale.ROOT).indexOf(marker.toLowerCase(Locale.ROOT));
            if (rawMarker >= 0) end = rawMarker;
        }
        String scope = raw.substring(0, Math.max(0, Math.min(end, raw.length())));

        List<Link> links = new ArrayList<>();
        Matcher matcher = LINK.matcher(scope);
        while (matcher.find()) {
            String href = matcher.group(1);
            String anchor = stripHtml(matcher.group(2));
            Link previous = links.isEmpty() ? null : links.get(links.size() - 1);
            if (previous != null && previous.href.equals(href)) continue;
            links.add(new Link(href, anchor, matcher.start()));
        }

        Map<String, Entry> unique = new LinkedHashMap<>();
        for (int i = 0; i < links.size(); i++) {
            Link link = links.get(i);
            int cardEnd = i + 1 < links.size() ? links.get(i + 1).start : scope.length();
            String cardText = stripHtml(scope.substring(link.start, cardEnd));
            if (!cardText.matches("(?is).*Talep\\s+Tarih(?:leri|i).*")) continue;
            Matcher ticker = TICKER_STATE.matcher(cardText);
            if (!ticker.find()) continue;
            String symbol = normalizeTicker(ticker.group(1));
            if (symbol.isEmpty()) continue;

            String company = link.anchor;
            if (company.isEmpty() || company.toLowerCase(Locale.ROOT).matches(".*(katıl|incele|detay).*")) {
                int tickerPos = cardText.indexOf(ticker.group(0));
                company = tickerPos > 0 ? cardText.substring(0, tickerPos).trim() : symbol;
            }
            company = company.replaceAll("(?iu)\\s+" + Pattern.quote(symbol) + "\\s*$", "").trim();
            if (company.length() > 180) company = symbol;

            Matcher date = DATE.matcher(cardText);
            String dates = date.find() ? date.group(1).replace('–','-').replace('—','-').replaceAll("\\s*-\\s*", "-").trim() : "";
            unique.putIfAbsent(symbol, new Entry(symbol, company, dates));
        }
        return new ArrayList<>(unique.values());
    }

    private static String normalizeTicker(String value) {
        return value == null ? "" : value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    private static String stripHtmlKeepHeadings(String html) {
        return stripHtml(html);
    }

    private static String stripHtml(String html) {
        return String.valueOf(html == null ? "" : html)
                .replaceAll("(?is)<script\\b[^>]*>.*?</script>", " ")
                .replaceAll("(?is)<style\\b[^>]*>.*?</style>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", "\"")
                .replace("&#39;", "'").replaceAll("\\s+", " ").trim();
    }

    private static final class Link {
        final String href;
        final String anchor;
        final int start;
        Link(String href, String anchor, int start) { this.href = href; this.anchor = anchor; this.start = start; }
    }
}
'''
(root / 'android/app/src/main/java/com/innative/halkaarz/IpoCalendarParser.java').write_text(helper, encoding='utf-8')

# Make the actual Worker use the exact parser class verified by CI.
worker_path = root / 'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java'
worker = worker_path.read_text(encoding='utf-8')
pattern = re.compile(r'    private static void checkIpoCalendar\(Context context, SharedPreferences prefs\) throws Exception \{[\s\S]*?\n    \}\n\n    private static void showIpoNotification', re.M)
replacement = '''    private static void checkIpoCalendar(Context context, SharedPreferences prefs) throws Exception {
        String html = fetchText(IPO_CALENDAR_URL, 3 * 1024 * 1024);
        Set<String> seen = new HashSet<>();
        try {
            JSONArray old = new JSONArray(prefs.getString(IPO_STATE_KEY, "[]"));
            for (int i = 0; i < old.length(); i++) {
                String ticker = normalizeTicker(old.optString(i, ""));
                if (!ticker.isEmpty()) seen.add(ticker);
            }
        } catch (Exception ignored) {}

        boolean changed = false;
        for (IpoCalendarParser.Entry entry : IpoCalendarParser.parse(html)) {
            if (entry.ticker.isEmpty() || seen.contains(entry.ticker)) continue;
            showIpoNotification(context, entry.ticker, entry.company, entry.offerDates);
            seen.add(entry.ticker);
            changed = true;
        }
        if (changed) prefs.edit().putString(IPO_STATE_KEY, toJsonArrayStrings(seen).toString()).apply();
    }

    private static void showIpoNotification'''
worker, count = pattern.subn(replacement, worker, count=1)
if count != 1:
    raise SystemExit(f'BackgroundAlertWorker.java: expected one IPO parser body, found {count}')
worker_path.write_text(worker, encoding='utf-8')
