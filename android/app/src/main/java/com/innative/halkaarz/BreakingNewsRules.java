package com.innative.halkaarz;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Son dakika seçimi. Kalıp metinleri cloudflare/news-notifications.js BREAKING_PATTERNS ile
 * birebir aynıdır; test/news-breaking-rules.test.js iki tarafı aynı başlıklarla karşılaştırır.
 * Android'e bağımlılığı yoktur, bu yüzden testte düz javac ile derlenir.
 */
final class BreakingNewsRules {
    static final int DAILY_CAP = 8;
    static final long MIN_GAP_MS = 10L * 60L * 1000L;

    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final Locale TURKISH = Locale.forLanguageTag("tr-TR");
    private static final Pattern PREFIX = Pattern.compile("^(?:[Hh][Aa][Bb][Ee][Rr][Ll][Ee][Rr]|[Pp]İ[Yy][Aa][Ss][Aa][Ll][Aa][Rr])\\s+");
    private static final Pattern TRAILING_NUMBER = Pattern.compile("(\\d+([.,]\\d+)?)$");
    private static final String TICKER_EDGE = "[^A-Za-z0-9ÇĞİÖŞÜçğıöşüÂâÎîÛû]";
    private static final String WORD_EDGE_BEFORE = "(?<![a-z0-9çğıöşüâîû])";
    private static final String WORD_EDGE_AFTER = "(?![a-z0-9çğıöşüâîû])";

    private static final Map<String, Integer> PRIORITY = new HashMap<>();
    private static final Map<String, Long> COOLDOWN_MS = new HashMap<>();
    private static final Map<String, Pattern> PATTERNS = new HashMap<>();

    static {
        PRIORITY.put("rate", 1);
        PRIORITY.put("market", 1);
        PRIORITY.put("portfolio", 2);
        PRIORITY.put("regulation", 2);
        PRIORITY.put("enforcement", 2);
        PRIORITY.put("fx", 3);

        COOLDOWN_MS.put("rate", 60L * 60_000L);
        COOLDOWN_MS.put("market", 30L * 60_000L);
        COOLDOWN_MS.put("portfolio", 2L * 60L * 60_000L);
        COOLDOWN_MS.put("regulation", 60L * 60_000L);
        COOLDOWN_MS.put("enforcement", 60L * 60_000L);
        COOLDOWN_MS.put("fx", 6L * 60L * 60_000L);

        pattern("explainer", "(?<![a-z0-9çğıöşüâîû])(nedir|kimdir|nasıl|ne zaman|ne kadar|hangi|nerede|kaç)(?![a-z0-9çğıöşüâîû])[^?]*\\?");
        pattern("centralBank", "(tcmb|para politikası kurulu|(?<![a-z0-9çğıöşüâîû])(ppk|fed|amb|ecb|boe|boj|snb|pboc|pbc)(?![a-z0-9çğıöşüâîû])|merkez bankası|federal reserve|fomc|bank of england|bank of japan|people'?s bank of china|bank of canada|reserve bank)");
        pattern("rateWord", "(politika faiz|faiz karar|faiz oran|faizini|faizi|faizleri|faiz indirim|faiz artırım|zorunlu karşılık|rezerv opsiyon|kur korumalı|likidite)");
        pattern("rateDecision", "(artırdı|artirdi|indirdi|düşürdü|sabit tuttu|sabit bıraktı|değiştirmedi|kararını açıkladı|kararini acikladi|değiştirdi|degistirdi|karar verdi|indirime gitti|indirimine gitti|artırıma gitti|artırımına gitti|indirim yaptı|artırım yaptı|beklentilere paralel|sürpriz)");
        pattern("emergency", "(olağanüstü|olaganustu|plan dışı|ara toplantı|acil toplan)");
        pattern("meetingOrRate", "(toplan|karar|faiz)");
        pattern("marketWide", "(borsa [iı]stanbul|(?<![a-z0-9çğıöşüâîû])b[iı]st(?![a-z])|piyasa genelinde|piyasa geneli|pay piyasası|pay piyasasında|tüm piyasada|tum piyasada)");
        pattern("marketHalt", "(işlemler(i)?( geçici olarak)? durdur|işlemlere ara ver|işlem durdur|devre kesici)");
        pattern("indexContext", "(borsa [iı]stanbul|(?<![a-z0-9çğıöşüâîû])b[iı]st(?![a-z])|(?<![a-z0-9çğıöşüâîû])borsa|nasdaq|dow jones|s&p ?500|(?<![a-z0-9çğıöşüâîû])dax(?![a-z]))");
        pattern("indexPercent", "(borsa [iı]stanbul|(?<![a-z0-9çğıöşüâîû])b[iı]st(?![a-z])|(?<![a-z0-9çğıöşüâîû])borsa|nasdaq|dow jones|s&p ?500|(?<![a-z0-9çğıöşüâîû])dax(?![a-z]))[^.?!]{0,50}?(yüzde|%) ?(\\d+([.,]\\d+)?)");
        pattern("indexCrash", "(borsa [iı]stanbul|(?<![a-z0-9çğıöşüâîû])b[iı]st(?![a-z])|(?<![a-z0-9çğıöşüâîû])borsa)[^.?!]{0,50}?(çöktü|çöküş|tarihi düşüş|kara pazartesi|panik satış|sert satış)");
        pattern("move", "(düş|geriled|kaybet|çök|eridi|sert|yüksel|arttı|artış|tırman|uçtu|değer kazan|çakıldı|sıçra)");
        pattern("fund", "(?<![a-z0-9çğıöşüâîû])fon(lar|ların|larında|larda|unda|un|u)?(?![a-z0-9çğıöşüâîû])");
        pattern("fundFreeze", "(işlemler(i)?( geçici olarak)? durdur|askıya al|satışlar(ı)? durdur|alım satım(ı)? durdur|geri ödeme(ler(i)?)? durdur)");
        pattern("currency", "(dolar|(?<![a-z0-9çğıöşüâîû])euro(?! ?bölge)|avro|sterlin|döviz kuru|(?<![a-z0-9çğıöşüâîû])kur(?![a-z0-9çğıöşüâîû]))");
        pattern("currencyPercent", "(dolar|(?<![a-z0-9çğıöşüâîû])euro(?! ?bölge)|avro|sterlin|(?<![a-z0-9çğıöşüâîû])kur(?![a-z0-9çğıöşüâîû])|kurlar)[^.?!]{0,40}?(yüzde|%) ?(\\d+([.,]\\d+)?)");
        pattern("sharp", "(sert|ani |tarihi|şok)");
        pattern("sharpMove", "(yüksel|düş|değer kaybet|çakıldı|uçtu|tırman|sıçra)");
        pattern("record", "(rekor|tüm zamanların en yüksek|tarihi zirve)");
        pattern("gold", "(gram altın|ons altın|altının onsu|(?<![a-z0-9çğıöşüâîû])altın|(?<![a-z0-9çğıöşüâîû])ons(?![a-z0-9çğıöşüâîû]))");
        pattern("goldPercent", "((?<![a-z0-9çğıöşüâîû])altın|(?<![a-z0-9çğıöşüâîû])ons(?![a-z0-9çğıöşüâîû]))[^.?!]{0,40}?(yüzde|%) ?(\\d+([.,]\\d+)?)");
        pattern("regulator", "((?<![a-z0-9çğıöşüâîû])spk(?![a-z0-9çğıöşüâîû])|sermaye piyasası kurulu|(?<![a-z0-9çğıöşüâîû])bddk(?![a-z0-9çğıöşüâîû])|bankacılık düzenleme|hazine ve maliye|resm[iî] gazete|(?<![a-z0-9çğıöşüâîû])masak(?![a-z0-9çğıöşüâîû])|tcmb)");
        pattern("systemic", "(açığa satış|olağanüstü tedbir|sermaye kontrol|vergi oran|stopaj|kdv oran|(?<![a-z0-9çğıöşüâîû])ötv|harç|kredi kart|taksit|kredi büyüme|kredi sınır|mevduat|zorunlu karşılık|kripto|döviz alım|döviz satış|yatırım fon|(?<![a-z0-9çğıöşüâîû])fon(lar)?a (yönelik|ilişkin))");
        pattern("regulationAction", "(yasak|kısıtla|sınırla|tedbir|düzenleme|değişiklik|değişti|değiştir|yürürlüğe|kaldırıl|getirildi|getirdi|artırıldı|indirildi|zorunlu hale|uygulama başla)");
        pattern("financialContext", "(finans|(?<![a-z0-9çğıöşüâîû])fon|borsa|hisse|yatırım|yatirim|banka|bankacılık|bankacilik|piyasa|sermaye|(?<![a-z0-9çğıöşüâîû])spk(?![a-z0-9çğıöşüâîû])|şirket|sirket|holding|portföy|portfoy|kripto|döviz|doviz|aracı kurum)");
        pattern("enforcement", "(gözalt|tutuklan|yakalama kararı|operasyon|malvarlığ.*dondur|(tutar|hesap|varlık|varlik|milyon|milyar).*dondur|el koy|kayyum|(?<![a-z0-9çğıöşüâîû])tmsf)");
        pattern("minister", "(bakan|cumhurbaşkanı yardımcısı)");
        pattern("policyTopic", "(vergi|stopaj|(?<![a-z0-9çğıöşüâîû])kdv|(?<![a-z0-9çğıöşüâîû])ötv|harç|asgari ücret|emekli|memur maaş|(?<![a-z0-9çğıöşüâîû])zam(?![a-z0-9çğıöşüâîû])|zammı|zam oran|faiz|enflasyon|(?<![a-z0-9çğıöşüâîû])kur(?![a-z0-9çğıöşüâîû])|döviz|borsa|piyasa|yatırımcı|teşvik|destek paket|ekonomik paket|ekonomi program|bütçe|tasarruf|kredi|ihracat|ithalat|gümrük|(?<![a-z0-9çğıöşüâîû])fon)");
        pattern("announce", "(açıkl|duyur|bildir|müjde|yürürlüğe|karar|onaylandı|yasalaştı)");
        pattern("future", "(açıklayacak|duyuracak|bekleniyor|yarın|gelecek hafta)");
        pattern("corporateEvent", "(sermaye artırım|bedelsiz|bedelli|temettü|kâr payı|kar payı|geri alım|birleşme|devral|devir|satın al|iflas|konkordato|işlem yasağı|tedbir|işlemler(i)?( geçici olarak)? durdur|işlemlerine ara|işlem sırası|(?<![a-z0-9çğıöşüâîû])kap(?![a-z0-9çğıöşüâîû])|bilanço|net kâr|net kar|net zarar|finansal sonuç|kâr açıkla|kar açıkla|zarar açıkla|halka arz|kredi not|ihale|sözleşme|anlaşma|sipariş|iş ilişkisi|yatırım|kapasite|vazgeçti|soruşturma|ceza|dava|onay|pay satış|blok satış|ortaklık|genel kurul|hisse satış)");
    }

    // Tek kelimelik şirket adı yalnız ayırt ediciyse kullanılır; aksi halde ilk iki kelime aranır.
    private static final String[] COMMON_COMPANY_WORDS = {
            "türkiye", "anadolu", "global", "ulusal", "merkez", "istanbul", "avrasya", "teknoloji",
            "enerji", "yatırım", "holding", "sanayi", "ticaret", "gayrimenkul", "elektrik", "tekstil"
    };

    private BreakingNewsRules() {}

    private static void pattern(String key, String source) {
        PATTERNS.put(key, Pattern.compile(source));
    }

    static final class Holding {
        final String ticker;
        final String company;

        Holding(String ticker, String company) {
            this.ticker = ticker == null ? "" : ticker.trim().toUpperCase(Locale.ROOT);
            this.company = company == null ? "" : company.trim();
        }
    }

    static final class Classification {
        final String reason;
        final int priority;
        final String ticker;

        Classification(String reason, String ticker) {
            this.reason = reason;
            this.priority = PRIORITY.get(reason);
            this.ticker = ticker == null ? "" : ticker;
        }

        String key() {
            return "portfolio".equals(reason) ? "portfolio:" + ticker : reason;
        }

        String title() {
            return "portfolio".equals(reason) && !ticker.isEmpty() ? "🔴 Son Dakika · " + ticker : "🔴 Son Dakika";
        }
    }

    static final class LogEntry {
        final String key;
        final long at;

        LogEntry(String key, long at) {
            this.key = key == null ? "" : key;
            this.at = at;
        }
    }

    static Classification classify(String rawTitle, String rawSummary, List<Holding> holdings) {
        String title = cleanHeadline(rawTitle);
        if (title.isEmpty()) return null;
        String summary = cleanText(rawSummary);
        String text = title.toLowerCase(TURKISH);
        if (isExplainer(text)) return null;

        String ticker = mentionedHolding(title + " " + summary, holdings);
        if (!ticker.isEmpty() && has("corporateEvent", text + " " + summary.toLowerCase(TURKISH))) {
            return new Classification("portfolio", ticker);
        }

        if (has("centralBank", text)
                && ((has("rateWord", text) && has("rateDecision", text)) || (has("emergency", text) && has("meetingOrRate", text)))) {
            return new Classification("rate", "");
        }

        if ((has("marketWide", text) && has("marketHalt", text))
                || (text.contains("devre kesici") && has("indexContext", text))
                || (has("move", text) && proximityPercent("indexPercent", text) >= 3)
                || has("indexCrash", text)
                || (has("fund", text) && has("fundFreeze", text))) {
            return new Classification("market", "");
        }

        if (has("regulator", text) && has("systemic", text) && has("regulationAction", text)) return new Classification("regulation", "");
        if (has("financialContext", text) && has("enforcement", text)) return new Classification("enforcement", "");
        if (has("minister", text) && has("policyTopic", text) && has("announce", text) && !has("future", text)) {
            return new Classification("regulation", "");
        }

        if (has("gold", text) && (has("record", text) || (has("move", text) && proximityPercent("goldPercent", text) >= 3))) {
            return new Classification("fx", "");
        }
        if (has("currency", text) && ((has("move", text) && proximityPercent("currencyPercent", text) >= 2)
                || (has("sharp", text) && has("sharpMove", text)))) {
            return new Classification("fx", "");
        }
        return null;
    }

    /** "send": gönder, "defer": sonraki turda tekrar dene, "drop": bu haberi atla. */
    static String guard(List<LogEntry> log, Classification classification, long nowMs, boolean sentThisRun) {
        if (sentThisRun) return "defer";
        List<LogEntry> entries = new ArrayList<>();
        if (log != null) for (LogEntry entry : log) if (entry != null && !entry.key.isEmpty() && entry.at > 0L) entries.add(entry);
        String today = istanbulDay(nowMs);
        int todayCount = 0;
        for (LogEntry entry : entries) if (today.equals(istanbulDay(entry.at))) todayCount += 1;
        if (todayCount >= DAILY_CAP) return "drop";
        String key = classification.key();
        Long configured = COOLDOWN_MS.get(classification.reason);
        long cooldown = configured == null ? 60L * 60_000L : configured;
        long lastAt = 0L;
        for (LogEntry entry : entries) {
            if (entry.key.equals(key) && nowMs - entry.at < cooldown) return "drop";
            lastAt = Math.max(lastAt, entry.at);
        }
        if (lastAt > 0L && nowMs - lastAt < MIN_GAP_MS) return "defer";
        return "send";
    }

    static String cleanHeadline(String value) {
        return PREFIX.matcher(cleanText(value)).replaceFirst("").trim();
    }

    private static boolean isExplainer(String text) {
        int questions = 0;
        for (int i = 0; i < text.length(); i++) if (text.charAt(i) == '?') questions += 1;
        return questions >= 2 || has("explainer", text);
    }

    private static boolean has(String key, String text) {
        return PATTERNS.get(key).matcher(text).find();
    }

    private static double proximityPercent(String key, String text) {
        Matcher matcher = PATTERNS.get(key).matcher(text);
        if (!matcher.find()) return 0d;
        Matcher number = TRAILING_NUMBER.matcher(matcher.group());
        if (!number.find()) return 0d;
        try {
            return Double.parseDouble(number.group(1).replace(',', '.'));
        } catch (NumberFormatException ignored) {
            return 0d;
        }
    }

    private static String mentionedHolding(String original, List<Holding> holdings) {
        if (holdings == null) return "";
        for (Holding holding : holdings) {
            if (!holding.ticker.matches("[A-Z0-9]{3,6}")) continue;
            Pattern ticker = Pattern.compile("(^|" + TICKER_EDGE + ")" + Pattern.quote(holding.ticker) + "(?=$|" + TICKER_EDGE + ")");
            if (ticker.matcher(original).find()) return holding.ticker;
        }
        String lower = original.toLowerCase(TURKISH);
        for (Holding holding : holdings) {
            if (!holding.ticker.matches("[A-Z0-9]{3,6}")) continue;
            for (String phrase : companyPhrases(holding.company)) {
                Pattern company = Pattern.compile(WORD_EDGE_BEFORE + Pattern.quote(phrase) + WORD_EDGE_AFTER);
                if (company.matcher(lower).find()) return holding.ticker;
            }
        }
        return "";
    }

    static List<String> companyPhrases(String company) {
        List<String> phrases = new ArrayList<>();
        String normalized = cleanText(company).toLowerCase(TURKISH).replaceAll("[^a-zçğıöşüâîû0-9 ]+", " ").trim();
        if (normalized.isEmpty()) return phrases;
        String[] words = normalized.split("\\s+");
        String first = words[0];
        if (first.length() < 3) return phrases;
        if (first.length() >= 6 && !isCommonCompanyWord(first)) phrases.add(first);
        if (words.length >= 2) phrases.add(first + " " + words[1]);
        return phrases;
    }

    private static boolean isCommonCompanyWord(String word) {
        for (String common : COMMON_COMPANY_WORDS) if (common.equals(word)) return true;
        return false;
    }

    private static String istanbulDay(long epochMs) {
        return Instant.ofEpochMilli(epochMs).atZone(ISTANBUL).toLocalDate().toString();
    }

    // JavaScript \s ile aynı boşluk kümesi; iki tarafta başlıklar aynı temizlenir.
    private static final Pattern JS_WHITESPACE = Pattern.compile("[\\t\\n\\x0B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+");

    private static String cleanText(String value) {
        String collapsed = JS_WHITESPACE.matcher(String.valueOf(value == null ? "" : value)).replaceAll(" ");
        int start = collapsed.startsWith(" ") ? 1 : 0;
        int end = collapsed.endsWith(" ") && collapsed.length() > start ? collapsed.length() - 1 : collapsed.length();
        return collapsed.substring(start, end);
    }
}
