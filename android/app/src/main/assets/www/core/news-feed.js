// Çok kaynaklı finans haber akışı. Saf fonksiyonlar: DOM'a, ağa veya
// localStorage'a dokunmaz; böylece Node testleriyle doğrulanabilir.

export const NEWS_CATEGORIES = Object.freeze({
  borsa:'Borsa',
  sirketler:'Şirketler',
  'halka-arz':'Halka Arz',
  doviz:'Döviz',
  altin:'Altın',
  ekonomi:'Ekonomi',
});

// defaultEnabled:false olan kaynaklar finans dışı haber oranı yüksek olduğu için
// kullanıcı Ayarlar > Haber kaynakları bölümünden açana kadar çekilmez.
export const NEWS_SOURCES = Object.freeze([
  Object.freeze({ id:'bloomberght', name:'Bloomberg HT', url:'https://www.bloomberght.com/rss/tum-haberler.xml', defaultEnabled:true }),
  Object.freeze({ id:'aa', name:'Anadolu Ajansı', url:'https://www.aa.com.tr/tr/rss/default?cat=ekonomi', defaultEnabled:true }),
  Object.freeze({ id:'trt', name:'TRT Haber', url:'https://www.trthaber.com/ekonomi_articles.rss', defaultEnabled:true }),
  Object.freeze({ id:'cnnturk', name:'CNN Türk', url:'https://www.cnnturk.com/feed/rss/ekonomi/news', defaultEnabled:true }),
  Object.freeze({ id:'haberturk', name:'Habertürk', url:'https://www.haberturk.com/rss/ekonomi.xml', defaultEnabled:false }),
]);

export function resolveEnabledSources(saved) {
  const preferences = saved && typeof saved === 'object' ? saved : {};
  return Object.fromEntries(NEWS_SOURCES.map(source => [
    source.id,
    typeof preferences[source.id] === 'boolean' ? preferences[source.id] : source.defaultEnabled,
  ]));
}

const MAX_ITEMS_PER_SOURCE = 60;
const SUMMARY_MAX_CHARS = 220;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

const NAMED_ENTITIES = Object.freeze({
  amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', rsquo:'’', lsquo:'‘',
  rdquo:'”', ldquo:'“', hellip:'…', ndash:'–', mdash:'—', laquo:'«', raquo:'»',
});

export function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

function stripCdata(value) {
  return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

export function stripHtml(value) {
  const withoutTags = stripCdata(value)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  // Bazı akışlar HTML'i iki kez kaçırır (&lt;p&gt;); çözdükten sonra tekrar temizle.
  return decodeEntities(decodeEntities(withoutTags).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tagText(block, name) {
  const pattern = new RegExp('<' + escapeRegExp(name) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + escapeRegExp(name) + '>', 'i');
  const match = pattern.exec(block);
  return match ? stripCdata(match[1]).trim() : '';
}

function tagAttr(block, name, attr) {
  const pattern = new RegExp('<' + escapeRegExp(name) + '\\b[^>]*?\\s' + escapeRegExp(attr) + '\\s*=\\s*(["\'])([^"\']*)\\1[^>]*>', 'gi');
  const values = [];
  let match;
  while ((match = pattern.exec(block))) values.push({ value:decodeEntities(match[2]).trim(), tag:match[0] });
  return values;
}

export function normalizeHttpsUrl(value) {
  const raw = decodeEntities(String(value ?? '').trim());
  if (!raw) return null;
  const upgraded = raw.startsWith('//') ? 'https:' + raw : raw.replace(/^http:\/\//i, 'https://');
  try {
    const url = new URL(upgraded);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function firstImage(block, descriptionRaw) {
  const candidates = [];
  for (const { value, tag } of tagAttr(block, 'media:content', 'url')) {
    if (/\btype\s*=\s*["'](?!image)/i.test(tag) && !/medium\s*=\s*["']image/i.test(tag)) continue;
    candidates.push(value);
  }
  for (const { value, tag } of tagAttr(block, 'enclosure', 'url')) {
    if (/\btype\s*=\s*["'](?!image)/i.test(tag)) continue;
    candidates.push(value);
  }
  for (const { value } of tagAttr(block, 'media:thumbnail', 'url')) candidates.push(value);
  const imageText = tagText(block, 'image');
  if (imageText && !imageText.includes('<')) candidates.push(imageText);
  const inline = /<img\b[^>]*?\ssrc\s*=\s*(["'])([^"']+)\1/i.exec(decodeEntities(stripCdata(descriptionRaw)));
  if (inline) candidates.push(inline[2]);
  for (const candidate of candidates) {
    const url = normalizeHttpsUrl(candidate);
    if (url) return url;
  }
  return null;
}

export function parseNewsDate(value, now = Date.now()) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const stamp = Date.parse(raw);
  if (!Number.isFinite(stamp)) return null;
  if (stamp > now + FUTURE_TOLERANCE_MS) return null;
  return new Date(stamp).toISOString();
}

export function truncateText(value, max = SUMMARY_MAX_CHARS) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/u, '') + '…';
}

function lowerTr(value) {
  return String(value ?? '').toLocaleLowerCase('tr-TR');
}

const CATEGORY_RULES = Object.freeze([
  ['halka-arz', /halka arz|halka açıl|talep toplama|borsada işlem görmeye|borsaya açıl|arz fiyatı/],
  ['altin', /\baltın|gram altın|çeyrek altın|\bons\b|kıymetli maden|\bgümüş/],
  ['doviz', /döviz|parite|\bkur(?:u|da|lar)?\b|\bdolar(?:ın|ı|da)?\b|\bsterlin|\b(?:euro|avro)\s*\/|dolar\/tl|euro\/tl|\btl\b.*değer (?:kaybı|kazancı)/],
  ['borsa', /borsa|\bbist\b|bist 100|bist100|\bhisse|endeks|\bspk\b|temettü|bedelsiz|piyasa değeri|geri alım/],
  ['sirketler', /şirket|holding|\ba\.ş\.|satın al|birleşme|bilanço|finansal sonuç|net kâr|net kar|\bciro|(?<!merkez )bankası(?![a-zçğıöşü])|sürdürülebilirlik raporu|yatırım(?:ını)? açıkladı/],
]);

// Özet metni başlıktan daha gürültülü olduğu için yalnız güçlü sinyaller kullanılır.
const SUMMARY_RULES = Object.freeze([
  ['halka-arz', /halka arz|talep toplama|borsada işlem görmeye/],
  ['altin', /gram altın|ons altın|altın fiyat|çeyrek altın/],
  ['doviz', /döviz kuru|dolar\/tl|euro\/tl|\bdoların\b|kur(?:u|da) /],
  ['borsa', /borsa istanbul|\bbist\b|bist 100|hisse senedi|hisseleri/],
]);

const SOURCE_CATEGORY_HINTS = Object.freeze([
  ['halka-arz', /halka arz/],
  ['altin', /altın/],
  ['doviz', /döviz/],
  ['borsa', /borsa|piyasa/],
  ['sirketler', /şirket/],
]);

export function classifyNewsCategory(title, summary = '', sourceCategory = '') {
  const titleText = lowerTr(title);
  for (const [category, pattern] of CATEGORY_RULES) if (pattern.test(titleText)) return category;
  const bodyText = lowerTr(summary).slice(0, 260);
  for (const [category, pattern] of SUMMARY_RULES) if (pattern.test(bodyText)) return category;
  const hint = lowerTr(sourceCategory);
  for (const [category, pattern] of SOURCE_CATEGORY_HINTS) if (pattern.test(hint)) return category;
  return 'ekonomi';
}

export function parseRssFeed(xml, source, { now = Date.now() } = {}) {
  const text = String(xml ?? '');
  const items = [];
  const seen = new Set();
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemPattern.exec(text)) && items.length < MAX_ITEMS_PER_SOURCE) {
    const block = match[1];
    const title = stripHtml(tagText(block, 'title'));
    if (title.length < 12) continue;
    const guidTag = /<guid\b[^>]*>([\s\S]*?)<\/guid>/i.exec(block);
    const guidText = guidTag ? stripCdata(guidTag[1]).trim() : '';
    const linkCandidates = [
      tagText(block, 'link'),
      ...tagAttr(block, 'atom:link', 'href').map(entry => entry.value),
      /^https?:\/\//i.test(guidText) ? guidText : '',
    ];
    const url = linkCandidates.map(normalizeHttpsUrl).find(Boolean);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const descriptionRaw = tagText(block, 'description') || tagText(block, 'content:encoded');
    const summary = truncateText(stripHtml(descriptionRaw));
    const rssCategory = stripHtml(tagText(block, 'category'));
    items.push({
      id:(source?.id || 'kaynak') + ':' + url,
      sourceId:source?.id || '',
      source:source?.name || 'Finans',
      title,
      summary:summary && lowerTr(summary) !== lowerTr(title) ? summary : '',
      url,
      imageUrl:firstImage(block, descriptionRaw),
      publishedAt:parseNewsDate(tagText(block, 'pubDate') || tagText(block, 'dc:date'), now),
      category:classifyNewsCategory(title, summary, rssCategory),
    });
  }
  return items;
}

export function newsTitleKey(title) {
  return lowerTr(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ıçğöşü ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function newsTime(item) {
  const stamp = item?.publishedAt ? Date.parse(item.publishedAt) : NaN;
  return Number.isFinite(stamp) ? stamp : -Infinity;
}

// Kaynak listelerini tek akışta birleştirir: aynı URL veya aynı başlığa sahip
// haberleri teke indirir (görseli olan sürümü tercih eder) ve yeniden eskiye sıralar.
export function mergeNewsItems(lists, { limit = 160 } = {}) {
  const byKey = new Map();
  const byUrl = new Map();
  let order = 0;
  for (const list of Array.isArray(lists) ? lists : []) {
    for (const item of Array.isArray(list) ? list : []) {
      if (!item?.url || !item?.title) continue;
      const key = newsTitleKey(item.title);
      const existing = byUrl.get(item.url) || (key ? byKey.get(key) : null);
      if (existing) {
        if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
        if (!existing.summary && item.summary) existing.summary = item.summary;
        if (!existing.publishedAt && item.publishedAt) existing.publishedAt = item.publishedAt;
        continue;
      }
      const copy = { ...item, _order:order++ };
      byUrl.set(copy.url, copy);
      if (key) byKey.set(key, copy);
    }
  }
  return [...byUrl.values()]
    .sort((a, b) => (newsTime(b) - newsTime(a)) || (a._order - b._order))
    .slice(0, limit)
    .map(({ _order, ...item }) => item);
}

// "FON SORUŞTURMASI NEDİR? … Kimler Gözaltına Alındı?" gibi arama motoru için
// yazılmış açıklayıcı sayfalar; öne çıkanlar listesine alınmaz.
export function isExplainerTitle(value) {
  const title = String(value ?? '').trim();
  if ((title.match(/\?/g) || []).length >= 2) return true;
  if (/(?:^|[^A-ZÇĞİÖŞÜ])(?:NEDİR|KİMDİR|NE ZAMAN|NE KADAR|NASIL|HANGİ|NEREDE|KAÇ)(?![A-ZÇĞİÖŞÜ])[^?]*\?/.test(title)) return true;
  const letters = title.match(/\p{L}/gu) || [];
  const upper = letters.filter(char => char === char.toLocaleUpperCase('tr-TR') && char !== char.toLocaleLowerCase('tr-TR'));
  return letters.length >= 24 && upper.length >= letters.length * 0.6;
}

// Öne çıkanlar: görseli olan en yeni haberlerden farklı kaynak ve kategorileri
// önceliklendirerek seçer; açıklayıcı SEO sayfaları öne çıkarılmaz.
export function chooseFeaturedNews(items, limit = 5) {
  const pool = (Array.isArray(items) ? items : []).filter(item => item?.imageUrl && !isExplainerTitle(item.title));
  const result = [];
  const usedSources = new Set();
  const usedCategories = new Set();
  for (const item of pool) {
    if (result.length >= limit) break;
    if (usedSources.has(item.sourceId) || usedCategories.has(item.category)) continue;
    result.push(item);
    usedSources.add(item.sourceId);
    usedCategories.add(item.category);
  }
  for (const item of pool) {
    if (result.length >= limit) break;
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

const COMPANY_STOP_WORDS = new Set([
  'türk', 'türkiye', 'anonim', 'şirketi', 'şirket', 'sanayi', 'sanayii', 'ticaret', 'holding', 'enerji',
  'yatırım', 'yatırımları', 'gayrimenkul', 'teknoloji', 'teknolojileri', 'üretim', 'pazarlama', 'inşaat',
  'gıda', 'turizm', 'grup', 'grubu', 'elektrik', 'metal', 'çelik', 'tekstil', 'kimya', 'madencilik',
  'otomotiv', 'lojistik', 'yazılım', 'bilişim', 'ortaklığı', 'katılım', 'banka', 'bankası', 'sigorta',
  'girişim', 'sermayesi', 'tarım', 'hizmetleri', 'yapı', 'malzemeleri', 'kağıt', 'plastik', 'cam',
]);
const LETTER = 'A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû0-9';

// Şirket adından haber eşleştirmesi için ayırt edici ifade seçer. Kısa veya
// genel kelimeler tek başına yanlış eşleşme üretir ("hava", "koç"); bu durumda
// sonraki kelimeyle birlikte ifade olarak aranır ("hava yolları", "koç holding").
function companyKeyword(company) {
  const words = lowerTr(company)
    .replace(/[^a-zçğıöşüâîû0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (let index = 0; index < Math.min(words.length, 3); index += 1) {
    const word = words[index];
    if (word.length < 3 || COMPANY_STOP_WORDS.has(word) || /^\d+$/.test(word)) continue;
    if (word.length >= 5) return word;
    const next = words[index + 1];
    return next ? word + ' ' + next : null;
  }
  return null;
}

export function buildHoldingMatchers(holdings) {
  const matchers = [];
  const seen = new Set();
  for (const holding of Array.isArray(holdings) ? holdings : []) {
    const ticker = String(holding?.ticker || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,6}$/.test(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    const patterns = [new RegExp('(^|[^' + LETTER + '])' + escapeRegExp(ticker) + '(?=$|[^' + LETTER + '])')];
    const keyword = companyKeyword(holding?.company);
    if (keyword) {
      const phrase = keyword.split(' ').map(escapeRegExp).join('\\s+');
      patterns.push(new RegExp('(^|[^' + LETTER + '])' + phrase + '(?=$|[^' + LETTER + '])'));
    }
    matchers.push({ ticker, keyword, patterns });
  }
  return matchers;
}

export function matchNewsToHoldings(item, matchers) {
  if (!item || !Array.isArray(matchers) || !matchers.length) return [];
  const original = String(item.title || '') + ' ' + String(item.summary || '');
  const lowered = lowerTr(original);
  const tickers = [];
  for (const matcher of matchers) {
    const [tickerPattern, companyPattern] = matcher.patterns;
    if (tickerPattern.test(original) || (companyPattern && companyPattern.test(lowered))) tickers.push(matcher.ticker);
  }
  return tickers;
}

export function filterNews(items, { category = 'all', query = '', sources = null, holdingMatchers = [], savedIds = null } = {}) {
  const needle = lowerTr(query).trim();
  return (Array.isArray(items) ? items : []).filter(item => {
    if (sources && item.sourceId && sources[item.sourceId] === false) return false;
    if (category === 'saved') { if (!savedIds?.has(item.id)) return false; }
    else if (category === 'portfolio') { if (!matchNewsToHoldings(item, holdingMatchers).length) return false; }
    else if (category !== 'all' && item.category !== category) return false;
    if (needle && !lowerTr(item.title + ' ' + (item.summary || '') + ' ' + (item.source || '')).includes(needle)) return false;
    return true;
  });
}
