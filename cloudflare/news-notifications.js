const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';
const ISTANBUL_OFFSET = '+03:00';
const BREAKING_MAX_AGE_MS = 90 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleKey(value) {
  return cleanText(value).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
}

const GENERIC_NEWS_HEADLINES = new Set([
  'hisse senetleri',
  'borsa kapanış',
  'çeyrek altın',
  'cumhuriyet altını',
  'ziynet altını',
  'yatırım fonları',
  'halka arz takvimi',
  'ekonomi haberleri',
  'borsa haberleri',
  'altın fiyatları',
  'gram altın fiyatı',
  'çeyrek altın fiyatı',
  'borsa',
  'altın',
  'döviz',
  'piyasalar',
  'ekonomi',
]);

const CATEGORY_LABELS = Object.freeze({
  borsa:'Borsa',
  sirketler:'Şirketler',
  doviz:'Döviz',
  altin:'Altın',
  ekonomi:'Ekonomi',
  'halka-arz':'Halka Arz',
});

function urlOf(item) {
  try { return new URL(cleanText(item?.url)); }
  catch { return null; }
}

export function cleanNotificationHeadline(value) {
  return cleanText(value)
    .replace(/^(?:HABERLER|PİYASALAR)\s+/iu, '')
    .trim();
}

export function isGenericNewsHeadline(value) {
  const key = titleKey(cleanNotificationHeadline(value));
  if (!key || GENERIC_NEWS_HEADLINES.has(key)) return true;
  return /^(?:borsa|altın|döviz|ekonomi|şirketler|halka arz)(?: haber(?:i|leri)?| fiyat(?:ı|ları)?| gündemi| takvimi| kapanış)?$/iu.test(key);
}

export function isLikelyNewsArticle(item) {
  const url = urlOf(item);
  if (!url || !/^https?:$/.test(url.protocol)) return false;
  const host = url.hostname.toLocaleLowerCase('tr-TR');
  if (host === 'bloomberght.com' || host === 'www.bloomberght.com') {
    return /-\d{6,}\/?$/u.test(url.pathname);
  }
  return true;
}

export function isNotificationNewsItem(item) {
  return isLikelyNewsArticle(item) && !isGenericNewsHeadline(item?.title);
}

function shortHeadline(value, maxLength = 72) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function parseDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function istanbulParts(dateLike) {
  const date = parseDate(dateLike);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const result = {};
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = part.value;
  }
  return {
    day: `${result.year}-${result.month}-${result.day}`,
    hour: Number(result.hour),
    minute: Number(result.minute),
  };
}

function previousIstanbulDay(day) {
  const anchor = new Date(`${day}T12:00:00${ISTANBUL_OFFSET}`);
  anchor.setTime(anchor.getTime() - 86_400_000);
  return istanbulParts(anchor)?.day || day;
}

function boundary(day, hour) {
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00${ISTANBUL_OFFSET}`);
}

function effectiveImportance(item) {
  const explicit = Number(item?.importance);
  const scored = scoreNewsImportance(item);
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 5) return Math.max(explicit, scored);
  return scored;
}

function newsIdentity(item) {
  const id = cleanText(item?.id);
  if (id) return id;
  const url = cleanText(item?.url);
  if (url) return url;
  return titleKey(item?.title);
}

export function scoreNewsImportance(item) {
  const title = cleanNotificationHeadline(item?.title).toLocaleLowerCase('tr-TR');
  const category = cleanText(item?.category).toLocaleLowerCase('tr-TR');
  if (!title) return 1;

  const centralBank = /(tcmb|para politikası kurulu|ppk|merkez bankası|federal reserve|\bfed\b|fomc|avrupa merkez bankası|\bamb\b|\becb\b|bank of england|\bboe\b|bank of japan|\bboj\b|people'?s bank of china|\bpbo?c\b|isviçre merkez bankası|\bsnb\b|bank of canada|reserve bank)/.test(title);
  const rateOrSystemPolicy = /(politika faiz|faiz karar|faiz oran|faizini|faizi|zorunlu karşılık|rezerv opsiyon|kur korumalı|likidite)/.test(title);
  const decisionVerb = /(artırdı|artirdi|indirdi|sabit tuttu|kararını açıkladı|kararini acikladi|değiştirdi|degistirdi|karar verdi|beklentilere paralel|olağanüstü|olaganustu)/.test(title);
  if (centralBank && rateOrSystemPolicy && decisionVerb) return 5;

  const marketWideExchange = /(borsa istanbul|\bbist\b|piyasa genelinde|piyasa geneli|pay piyasasında|pay piyasasinda|tüm piyasada|tum piyasada)/.test(title);
  const marketHalt = /(işlemler(?:i)?(?: geçici olarak)? durdur|işlemlere ara ver|işlem durdur|piyasa genelinde.*devre kesici|devre kesici.*piyasa geneli)/.test(title);
  if (marketWideExchange && marketHalt) return 5;

  const regulator = /(spk|sermaye piyasası kurulu|hazine ve maliye|resm[iî] gazete)/.test(title);
  const systemicRestriction = /(açığa satış yasa|işlem yasa|olağanüstü tedbir|sermaye kontrol|vergi oran.*değiş|stopaj.*değiş)/.test(title);
  if (regulator && systemicRestriction) return 5;

  const financialContext = /(finans|fon\b|borsa|hisse|yatırım|yatirim|banka|bankacılık|bankacilik|piyasa|sermaye|spk|şirket|sirket|holding|portföy|portfoy|kripto|döviz|doviz)/.test(title);
  const enforcementAction = /(gözalt|tutuklan|yakalama kararı|operasyon|malvarlığ.*dondur|(?:tutar|hesap|varlık|varlik|milyon|milyar).*dondur|el koy|kayyum)/.test(title);
  if (financialContext && enforcementAction) return 5;

  const ministerStatement = /(bakan\b|bakanl)/.test(title)
    && /(açıkl|acikl|duyur|bildir|konuş|konus|değerlendir|degerlendir)/.test(title);
  if (ministerStatement) return 5;

  if (centralBank || regulator || /borsa istanbul/.test(title)) return 4;
  if (/(halka arz|sermaye artır|temettü|bilanço|kredi not|enflasyon|işsizlik|büyüme|döviz rezerv)/.test(title)) return 3;
  if (/(dolar|euro|altın|borsa|endeks|hisse)/.test(title)) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Son dakika seçimi. 1-5 önem puanı (yukarıda) yalnız özet sıralamasında kullanılır;
// son dakika kararı aşağıdaki kurallarla verilir. Kalıp metinleri
// android/.../BreakingNewsRules.java ile birebir aynıdır (test/news-breaking-rules.test.js).
// ---------------------------------------------------------------------------
export const BREAKING_PATTERNS = Object.freeze({
  explainer:"(?<![a-z0-9çğıöşüâîû])(nedir|kimdir|nasıl|ne zaman|ne kadar|hangi|nerede|kaç)(?![a-z0-9çğıöşüâîû])[^?]*\\?",
  centralBank:"(tcmb|para politikası kurulu|(?<![a-z0-9çğıöşüâîû])(ppk|fed|amb|ecb|boe|boj|snb|pboc|pbc)(?![a-z0-9çğıöşüâîû])|merkez bankası|federal reserve|fomc|bank of england|bank of japan|people'?s bank of china|bank of canada|reserve bank)",
  rateWord:"(politika faiz|faiz karar|faiz oran|faizini|faizi|faizleri|faiz indirim|faiz artırım|zorunlu karşılık|rezerv opsiyon|kur korumalı|likidite)",
  rateDecision:"(artırdı|artirdi|indirdi|düşürdü|sabit tuttu|sabit bıraktı|değiştirmedi|kararını açıkladı|kararini acikladi|değiştirdi|degistirdi|karar verdi|indirime gitti|indirimine gitti|artırıma gitti|artırımına gitti|indirim yaptı|artırım yaptı|beklentilere paralel|sürpriz)",
  emergency:"(olağanüstü|olaganustu|plan dışı|ara toplantı|acil toplan)",
  meetingOrRate:"(toplan|karar|faiz)",
  marketWide:"(borsa [iı]stanbul|(?<![a-z0-9çğıöşüâîû])b[iı]st(?![a-z])|piyasa genelinde|piyasa geneli|pay piyasası|pay piyasasında|tüm piyasada|tum piyasada)",
  marketHalt:"(işlemler(i)?( geçici olarak)? durdur|işlemlere ara ver|işlem durdur|devre kesici)",
  indexContext:"(borsa [iı]stanbul|(?<![a-z0-9çğıöşüâîû])b[iı]st(?![a-z])|(?<![a-z0-9çğıöşüâîû])borsa|nasdaq|dow jones|s&p ?500|(?<![a-z0-9çğıöşüâîû])dax(?![a-z]))",
  indexPercent:"(borsa [iı]stanbul|(?<![a-z0-9çğıöşüâîû])b[iı]st(?![a-z])|(?<![a-z0-9çğıöşüâîû])borsa|nasdaq|dow jones|s&p ?500|(?<![a-z0-9çğıöşüâîû])dax(?![a-z]))[^.?!]{0,50}?(yüzde|%) ?(\\d+([.,]\\d+)?)",
  indexCrash:"(borsa [iı]stanbul|(?<![a-z0-9çğıöşüâîû])b[iı]st(?![a-z])|(?<![a-z0-9çğıöşüâîû])borsa)[^.?!]{0,50}?(çöktü|çöküş|tarihi düşüş|kara pazartesi|panik satış|sert satış)",
  move:"(düş|geriled|kaybet|çök|eridi|sert|yüksel|arttı|artış|tırman|uçtu|değer kazan|çakıldı|sıçra)",
  fund:"(?<![a-z0-9çğıöşüâîû])fon(lar|ların|larında|larda|unda|un|u)?(?![a-z0-9çğıöşüâîû])",
  fundFreeze:"(işlemler(i)?( geçici olarak)? durdur|askıya al|satışlar(ı)? durdur|alım satım(ı)? durdur|geri ödeme(ler(i)?)? durdur)",
  currency:"(dolar|(?<![a-z0-9çğıöşüâîû])euro(?! ?bölge)|avro|sterlin|döviz kuru|(?<![a-z0-9çğıöşüâîû])kur(?![a-z0-9çğıöşüâîû]))",
  currencyPercent:"(dolar|(?<![a-z0-9çğıöşüâîû])euro(?! ?bölge)|avro|sterlin|(?<![a-z0-9çğıöşüâîû])kur(?![a-z0-9çğıöşüâîû])|kurlar)[^.?!]{0,40}?(yüzde|%) ?(\\d+([.,]\\d+)?)",
  sharp:"(sert|ani |tarihi|şok)",
  sharpMove:"(yüksel|düş|değer kaybet|çakıldı|uçtu|tırman|sıçra)",
  record:"(rekor|tüm zamanların en yüksek|tarihi zirve)",
  gold:"(gram altın|ons altın|altının onsu|(?<![a-z0-9çğıöşüâîû])altın|(?<![a-z0-9çğıöşüâîû])ons(?![a-z0-9çğıöşüâîû]))",
  goldPercent:"((?<![a-z0-9çğıöşüâîû])altın|(?<![a-z0-9çğıöşüâîû])ons(?![a-z0-9çğıöşüâîû]))[^.?!]{0,40}?(yüzde|%) ?(\\d+([.,]\\d+)?)",
  regulator:"((?<![a-z0-9çğıöşüâîû])spk(?![a-z0-9çğıöşüâîû])|sermaye piyasası kurulu|(?<![a-z0-9çğıöşüâîû])bddk(?![a-z0-9çğıöşüâîû])|bankacılık düzenleme|hazine ve maliye|resm[iî] gazete|(?<![a-z0-9çğıöşüâîû])masak(?![a-z0-9çğıöşüâîû])|tcmb)",
  systemic:"(açığa satış|olağanüstü tedbir|sermaye kontrol|vergi oran|stopaj|kdv oran|(?<![a-z0-9çğıöşüâîû])ötv|harç|kredi kart|taksit|kredi büyüme|kredi sınır|mevduat|zorunlu karşılık|kripto|döviz alım|döviz satış|yatırım fon|(?<![a-z0-9çğıöşüâîû])fon(lar)?a (yönelik|ilişkin))",
  regulationAction:"(yasak|kısıtla|sınırla|tedbir|düzenleme|değişiklik|değişti|değiştir|yürürlüğe|kaldırıl|getirildi|getirdi|artırıldı|indirildi|zorunlu hale|uygulama başla)",
  financialContext:"(finans|(?<![a-z0-9çğıöşüâîû])fon|borsa|hisse|yatırım|yatirim|banka|bankacılık|bankacilik|piyasa|sermaye|(?<![a-z0-9çğıöşüâîû])spk(?![a-z0-9çğıöşüâîû])|şirket|sirket|holding|portföy|portfoy|kripto|döviz|doviz|aracı kurum)",
  enforcement:"(gözalt|tutuklan|yakalama kararı|operasyon|malvarlığ.*dondur|(tutar|hesap|varlık|varlik|milyon|milyar).*dondur|el koy|kayyum|(?<![a-z0-9çğıöşüâîû])tmsf)",
  minister:"(bakan|cumhurbaşkanı yardımcısı)",
  policyTopic:"(vergi|stopaj|(?<![a-z0-9çğıöşüâîû])kdv|(?<![a-z0-9çğıöşüâîû])ötv|harç|asgari ücret|emekli|memur maaş|(?<![a-z0-9çğıöşüâîû])zam(?![a-z0-9çğıöşüâîû])|zammı|zam oran|faiz|enflasyon|(?<![a-z0-9çğıöşüâîû])kur(?![a-z0-9çğıöşüâîû])|döviz|borsa|piyasa|yatırımcı|teşvik|destek paket|ekonomik paket|ekonomi program|bütçe|tasarruf|kredi|ihracat|ithalat|gümrük|(?<![a-z0-9çğıöşüâîû])fon)",
  announce:"(açıkl|duyur|bildir|müjde|yürürlüğe|karar|onaylandı|yasalaştı)",
  future:"(açıklayacak|duyuracak|bekleniyor|yarın|gelecek hafta)",
  corporateEvent:"(sermaye artırım|bedelsiz|bedelli|temettü|kâr payı|kar payı|geri alım|birleşme|devral|devir|satın al|iflas|konkordato|işlem yasağı|tedbir|işlemler(i)?( geçici olarak)? durdur|işlemlerine ara|işlem sırası|(?<![a-z0-9çğıöşüâîû])kap(?![a-z0-9çğıöşüâîû])|bilanço|net kâr|net kar|net zarar|finansal sonuç|kâr açıkla|kar açıkla|zarar açıkla|halka arz|kredi not|ihale|sözleşme|anlaşma|sipariş|iş ilişkisi|yatırım|kapasite|vazgeçti|soruşturma|ceza|dava|onay|pay satış|blok satış|ortaklık|genel kurul|hisse satış)",
});

const BREAKING_REGEX = Object.freeze(Object.fromEntries(
  Object.entries(BREAKING_PATTERNS).map(([key, source]) => [key, new RegExp(source)])
));

export const BREAKING_PRIORITY = Object.freeze({ rate:1, market:1, portfolio:2, regulation:2, enforcement:2, fx:3 });
export const BREAKING_COOLDOWN_MS = Object.freeze({
  rate:60 * 60_000,
  market:30 * 60_000,
  portfolio:2 * 60 * 60_000,
  regulation:60 * 60_000,
  enforcement:60 * 60_000,
  fx:6 * 60 * 60_000,
});
export const BREAKING_DAILY_CAP = 8;
export const BREAKING_MIN_GAP_MS = 10 * 60_000;

function has(key, text) {
  return BREAKING_REGEX[key].test(text);
}

// Kalıbın eşleştiği metnin sonundaki yüzde değeri ("yüzde 3,2" -> 3.2); eşleşme yoksa 0.
function proximityPercent(key, text) {
  const match = BREAKING_REGEX[key].exec(text);
  if (!match) return 0;
  const number = /(\d+([.,]\d+)?)$/.exec(match[0]);
  return number ? Number(number[1].replace(',', '.')) : 0;
}

function isExplainerHeadline(text) {
  return (text.match(/\?/g) || []).length >= 2 || has('explainer', text);
}

export function holdingTickers(registration) {
  const tickers = [];
  for (const holding of Array.isArray(registration?.holdings) ? registration.holdings : []) {
    const ticker = cleanText(holding?.ticker).toUpperCase();
    if (!/^[A-Z0-9]{3,6}$/.test(ticker) || !(Number(holding?.lots) > 0) || tickers.includes(ticker)) continue;
    tickers.push(ticker);
  }
  return tickers;
}

// Hisse kodu yalnız büyük harfle ve tam kelime olarak geçtiğinde eşleşir ("ASELS'te", "(ASELS)").
function mentionedTicker(original, tickers) {
  for (const ticker of tickers) {
    if (new RegExp(`(^|[^A-Za-z0-9ÇĞİÖŞÜçğıöşüÂâÎîÛû])${ticker}(?=$|[^A-Za-z0-9ÇĞİÖŞÜçğıöşüÂâÎîÛû])`).test(original)) return ticker;
  }
  return '';
}

function breaking(reason, ticker = '') {
  return { reason, priority:BREAKING_PRIORITY[reason], ticker };
}

export function classifyBreakingNews(item, { tickers = [] } = {}) {
  const title = cleanNotificationHeadline(item?.title);
  if (!title) return null;
  const summary = cleanText(item?.summary);
  const text = title.toLocaleLowerCase('tr-TR');
  if (isExplainerHeadline(text)) return null;

  const ticker = mentionedTicker(`${title} ${summary}`, Array.isArray(tickers) ? tickers : []);
  if (ticker && has('corporateEvent', `${text} ${summary.toLocaleLowerCase('tr-TR')}`)) return breaking('portfolio', ticker);

  if (has('centralBank', text)
    && ((has('rateWord', text) && has('rateDecision', text)) || (has('emergency', text) && has('meetingOrRate', text)))) {
    return breaking('rate');
  }

  if ((has('marketWide', text) && has('marketHalt', text))
    || (text.includes('devre kesici') && has('indexContext', text))
    || (has('move', text) && proximityPercent('indexPercent', text) >= 3)
    || has('indexCrash', text)
    || (has('fund', text) && has('fundFreeze', text))) {
    return breaking('market');
  }

  if (has('regulator', text) && has('systemic', text) && has('regulationAction', text)) return breaking('regulation');
  if (has('financialContext', text) && has('enforcement', text)) return breaking('enforcement');
  if (has('minister', text) && has('policyTopic', text) && has('announce', text) && !has('future', text)) {
    return breaking('regulation');
  }

  if (has('gold', text) && (has('record', text) || (has('move', text) && proximityPercent('goldPercent', text) >= 3))) {
    return breaking('fx');
  }
  if (has('currency', text) && ((has('move', text) && proximityPercent('currencyPercent', text) >= 2)
    || (has('sharp', text) && has('sharpMove', text)))) {
    return breaking('fx');
  }
  return null;
}

export function breakingKey(classification) {
  return classification?.reason === 'portfolio' ? `portfolio:${classification.ticker}` : String(classification?.reason || '');
}

export function breakingTitle(classification) {
  return classification?.reason === 'portfolio' && classification.ticker
    ? `🔴 Son Dakika · ${classification.ticker}`
    : '🔴 Son Dakika';
}

// 'send': gönder, 'defer': sonraki turda tekrar dene, 'drop': bu haberi atla.
export function breakingGuard(log, classification, nowMs, { sentThisRun = false } = {}) {
  if (sentThisRun) return 'defer';
  const entries = (Array.isArray(log) ? log : [])
    .map(entry => ({ key:String(entry?.key || ''), at:Date.parse(entry?.at) }))
    .filter(entry => entry.key && Number.isFinite(entry.at));
  const today = istanbulParts(nowMs)?.day;
  if (entries.filter(entry => istanbulParts(entry.at)?.day === today).length >= BREAKING_DAILY_CAP) return 'drop';
  const key = breakingKey(classification);
  const cooldown = BREAKING_COOLDOWN_MS[classification?.reason] ?? 60 * 60_000;
  if (entries.some(entry => entry.key === key && nowMs - entry.at < cooldown)) return 'drop';
  const lastAt = entries.reduce((latest, entry) => Math.max(latest, entry.at), 0);
  if (lastAt && nowMs - lastAt < BREAKING_MIN_GAP_MS) return 'defer';
  return 'send';
}

export function selectDigestItems(items, { slot, now = new Date() } = {}) {
  const nowParts = istanbulParts(now);
  if (!nowParts || (slot !== 'morning' && slot !== 'evening')) return [];

  let start;
  let end;
  if (slot === 'morning') {
    start = boundary(previousIstanbulDay(nowParts.day), 19);
    end = boundary(nowParts.day, 10);
  } else {
    start = boundary(nowParts.day, 10);
    end = boundary(nowParts.day, 19);
  }

  const seen = new Set();
  const candidates = [];
  for (const raw of Array.isArray(items) ? items : []) {
    if (!isNotificationNewsItem(raw)) continue;
    const publishedAt = parseDate(raw?.publishedAt);
    if (!publishedAt || publishedAt < start || publishedAt >= end) continue;
    const importance = effectiveImportance(raw);
    const identity = newsIdentity(raw);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    candidates.push({
      ...raw,
      title:cleanNotificationHeadline(raw.title),
      importance,
      _publishedMs:publishedAt.getTime(),
    });
  }

  candidates.sort((a, b) => {
    const importanceDiff = Number(b.importance) - Number(a.importance);
    if (importanceDiff) return importanceDiff;
    return b._publishedMs - a._publishedMs;
  });

  const important = candidates.filter(item => Number(item.importance) >= 3);
  const selected = important.length ? important.slice(0, 4) : candidates.slice(0, 1);
  return selected.map(({ _publishedMs, ...item }) => item);
}

export function digestTitle(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const text = list.map(item => cleanNotificationHeadline(item?.title)).join(' ').toLocaleLowerCase('tr-TR');
  if (/(tcmb|politika faizi|faiz kararı|faiz oranı)/u.test(text)) return '🏦 Faiz ve Piyasa Gündemi';
  if (/(enflasyon|büyüme|işsizlik|üretici fiyat|tüketici fiyat)/u.test(text)) return '📊 Ekonomi Verileri Gündemde';

  const categories = [];
  for (const item of list) {
    const category = cleanText(item?.category).toLocaleLowerCase('tr-TR');
    if (CATEGORY_LABELS[category] && !categories.includes(category)) categories.push(category);
  }
  if (categories.includes('borsa') && categories.includes('altin')) return '📈 Borsa ve Altın Gündemi';
  if (categories.includes('altin') && categories.includes('doviz')) return '💱 Altın ve Döviz Gündemi';
  if (categories.includes('borsa') && categories.includes('sirketler')) return '📈 Borsa ve Şirketler Gündemi';
  if (categories.includes('halka-arz')) return '🔔 Halka Arz ve Piyasa Gündemi';

  const first = categories[0];
  if (first === 'borsa') return '📈 Borsada Öne Çıkan Gelişmeler';
  if (first === 'altin') return '🪙 Altın Piyasasında Öne Çıkanlar';
  if (first === 'doviz') return '💱 Döviz Piyasasında Öne Çıkanlar';
  if (first === 'sirketler') return '🏢 Şirketler Gündeminde Öne Çıkanlar';
  if (first === 'ekonomi') return '📊 Ekonomi Gündeminde Öne Çıkanlar';
  return '📰 Finans Gündeminde Öne Çıkanlar';
}

export function digestMessage(slot, items) {
  const visible = (Array.isArray(items) ? items : [])
    .filter(isNotificationNewsItem)
    .slice(0, 4);
  const title = slot === 'morning' ? '☀️ Sabah Finans Özeti'
    : slot === 'evening' ? '🌙 Akşam Finans Özeti'
    : digestTitle(visible);
  const body = visible
    .map((item) => `• ${shortHeadline(cleanNotificationHeadline(item?.title), 72)}`)
    .join('\n\n');
  return { title, body };
}

export function currentDigestSlot(now = new Date()) {
  const parts = istanbulParts(now);
  if (!parts) return null;
  const minuteOfDay = parts.hour * 60 + parts.minute;
  // Do not rely on a narrow 15-minute delivery window. The durable alarm may
  // run late after a deployment/network interruption; per-day state prevents duplicates.
  if (minuteOfDay >= 19 * 60) return 'evening';
  if (minuteOfDay >= 10 * 60) return 'morning';
  return null;
}

const ROUTINE_NEWS_INTERVAL_MS = 6 * 60 * 60_000;

export function routineNewsSlot(now = new Date()) {
  const parts = istanbulParts(now);
  if (!parts) return null;
  return `routine-${String(Math.floor(parts.hour / 6) * 6).padStart(2, '0')}`;
}

export function selectRoutineNewsItem(items, { now = new Date() } = {}) {
  const checkedAt = parseDate(now);
  if (!checkedAt) return null;
  const candidates = normalizeFeed(items)
    .map(item => ({ ...item, _published:parseDate(item.publishedAt) }))
    .filter(item => item._published && item._published <= checkedAt
      && checkedAt.getTime() - item._published.getTime() <= 24 * 60 * 60_000)
    .sort((a, b) => {
      const importance = Number(b.importance) - Number(a.importance);
      if (importance) return importance;
      return b._published.getTime() - a._published.getTime();
    });
  if (!candidates.length) return null;
  const { _published, ...selected } = candidates[0];
  return selected;
}

function normalizeFeed(payload) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item) => ({ ...item, title:cleanNotificationHeadline(item?.title), importance:effectiveImportance(item) }))
    .filter(isNotificationNewsItem);
}

function newsStateOf(registration) {
  const value = registration?.newsState;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function updateRegistrationNewsState(store, installKey, patch) {
  await store.mutate((state) => {
    if (!state?.installations?.[installKey]) return state;
    const registration = state.installations[installKey];
    registration.newsState = { ...newsStateOf(registration), ...patch };
    return state;
  });
}

export function createNewsNotificationEngine({
  store,
  sender,
  fetchNews,
  now = () => new Date(),
  breakingMaxAgeMs = BREAKING_MAX_AGE_MS,
} = {}) {
  if (!store?.read || !store?.mutate) throw new Error('news notification store is required');
  if (!sender?.send) throw new Error('news notification sender is required');
  if (typeof fetchNews !== 'function') throw new Error('news feed fetcher is required');

  return {
    async check() {
      const checkedAt = parseDate(now()) || new Date();
      const feed = normalizeFeed(await fetchNews());
      const state = await store.read();
      const installations = state?.installations && typeof state.installations === 'object' ? state.installations : {};
      let breakingSent = 0;
      let digestSent = 0;
      let routineSent = 0;

      const freshItems = feed.filter((item) => {
        const publishedAt = parseDate(item.publishedAt);
        if (!publishedAt) return false;
        const age = checkedAt.getTime() - publishedAt.getTime();
        return age >= -CLOCK_SKEW_MS && age <= breakingMaxAgeMs;
      });

      for (const [installKey, registration] of Object.entries(installations)) {
        if (!registration?.fcmToken || registration.newsEnabled === false) continue;
        let localState = newsStateOf(registration);
        let breakingSeen = Array.isArray(localState.breakingSeen) ? [...localState.breakingSeen] : [];
        let breakingLog = Array.isArray(localState.breakingLog) ? [...localState.breakingLog] : [];
        const tickers = holdingTickers(registration);
        const breakingCandidates = freshItems
          .map(item => ({ item, classification:classifyBreakingNews(item, { tickers }) }))
          .filter(candidate => candidate.classification)
          .sort((a, b) => (a.classification.priority - b.classification.priority)
            || (parseDate(b.item.publishedAt).getTime() - parseDate(a.item.publishedAt).getTime()));
        let sentThisRun = false;

        for (const { item, classification } of breakingCandidates) {
          const identity = newsIdentity(item);
          if (!identity || breakingSeen.includes(identity)) continue;
          const decision = breakingGuard(breakingLog, classification, checkedAt.getTime(), { sentThisRun });
          if (decision === 'defer') continue;
          breakingSeen = [...breakingSeen, identity].slice(-100);
          if (decision === 'drop') {
            await updateRegistrationNewsState(store, installKey, { breakingSeen });
            continue;
          }
          await sender.send(registration.fcmToken, {
            title: breakingTitle(classification),
            body: shortHeadline(item.title, 120),
            data: {
              kind: 'news_breaking',
              news_id: identity,
              news_url: cleanText(item.url),
              importance: '5',
              breaking_reason: classification.reason,
              ...(classification.ticker ? { ticker:classification.ticker } : {}),
            },
          });
          breakingLog = [...breakingLog, { at:checkedAt.toISOString(), key:breakingKey(classification) }].slice(-50);
          await updateRegistrationNewsState(store, installKey, {
            breakingSeen,
            breakingLog,
            lastNotificationAt:checkedAt.toISOString(),
          });
          breakingSent += 1;
          sentThisRun = true;
        }

        const slot = currentDigestSlot(checkedAt);
        if (!slot) continue;
        const slotBoundary = boundary(istanbulParts(checkedAt).day, slot === 'morning' ? 10 : 19);
        const selected = selectDigestItems(feed, { slot, now: checkedAt });
        const fallback = selected.length ? null : selectRoutineNewsItem(feed, { now: slotBoundary });
        const digestItems = selected.length ? selected : fallback ? [fallback] : [];
        if (digestItems.length < 1) continue;

        const day = istanbulParts(checkedAt)?.day;
        const dayKey = slot === 'morning' ? 'morningDigestDay' : 'eveningDigestDay';
        const latestState = (await store.read())?.installations?.[installKey];
        localState = newsStateOf(latestState || registration);
        if (localState[dayKey] === day) continue;

        const message = digestMessage(slot, digestItems);
        await sender.send(registration.fcmToken, {
          ...message,
          data: {
            kind: 'news_digest',
            digest_slot: slot,
            digest_day: day,
            news_count: String(digestItems.length),
            ...(digestItems.length === 1 && cleanText(digestItems[0]?.url) ? { news_url:cleanText(digestItems[0].url) } : {}),
          },
        });
        await updateRegistrationNewsState(store, installKey, {
          [dayKey]: day,
          lastNotificationAt:checkedAt.toISOString(),
        });
        digestSent += 1;
      }

      // Six-hour silence guard is evaluated per installation after breaking/digest work.
      for (const [installKey, registration] of Object.entries(installations)) {
        if (!registration?.fcmToken || registration.newsEnabled === false) continue;
        let localState = newsStateOf((await store.read())?.installations?.[installKey] || registration);
        const lastNotificationAt = parseDate(localState.lastNotificationAt);
        const routineDue = !lastNotificationAt
          || checkedAt.getTime() - lastNotificationAt.getTime() >= ROUTINE_NEWS_INTERVAL_MS;
        if (!routineDue) continue;
        const routineItem = selectRoutineNewsItem(feed, { now:checkedAt });
        if (!routineItem) continue;
        const routineSlot = routineNewsSlot(checkedAt);
        const routineDay = istanbulParts(checkedAt)?.day;
        const message = digestMessage(routineSlot, [routineItem]);
        await sender.send(registration.fcmToken, {
          ...message,
          data: {
            kind:'news_digest',
            digest_slot:routineSlot,
            digest_day:routineDay,
            news_count:'1',
            routine_interval_hours:'6',
            ...(cleanText(routineItem.url) ? { news_url:cleanText(routineItem.url) } : {}),
          },
        });
        await updateRegistrationNewsState(store, installKey, {
          lastNotificationAt:checkedAt.toISOString(),
          lastRoutineSlot:`${routineDay}:${routineSlot}`,
        });
        routineSent += 1;
      }

      return {
        checkedAt: checkedAt.toISOString(),
        feedCount: feed.length,
        breakingSent,
        digestSent,
        routineSent,
      };
    },
  };
}
