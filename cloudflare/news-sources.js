const BLOOMBERG_ORIGIN = 'https://www.bloomberght.com';
const TCMB_ORIGIN = 'https://www.tcmb.gov.tr';

const CATEGORY_RULES = [
  ['halka-arz', /\b(halka arz|ikincil halka arz|spk|sermaye piyasası kurulu)\b/i],
  ['borsa', /\b(bist|borsa|endeks|hisse|nasdaq|s&p|dow jones|xu100|devre kesici)\b/i],
  ['altin', /\b(altın|altinin|altının|ons|gram altın|gümüş|emtia)\b/i],
  ['doviz', /\b(dolar|euro|avro|sterlin|döviz|kur\b|usd\b|eur\b|türk lirası|tl\/)\b/i],
  ['sirketler', /\b(şirket|holding|banka|bankası|bankasi|thy|ortaklık|ortaklik|finansal sonuç|sermaye artırımı|sermaye artırımı|temettü|tmsf)\b/i],
  ['ekonomi', /\b(fed|tcmb|merkez bankası|merkez bankasi|faiz|enflasyon|istihdam|işsizlik|issizlik|tahvil|bono|petrol|brent|kredi|mevduat|bütçe|butce|cari|ekonomi|finansal|piyasa|ppk|para politikası|para politikasi|büyüme|buyume)\b/i],
];

const FINANCE_FALLBACK = /\b(fiyat|yatırım|yatirim|sermaye|fon|bankacılık|bankacilik|sigorta|ticaret|ihracat|ithalat|vergi|hazine)\b/i;

function decodeEntities(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanText(value = '') {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textLines(value = '') {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:div|p|li|h1|h2|h3|h4|article|section|time|a)>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function stableHash(value) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

function normalizeTitleKey(value) {
  return cleanText(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]+/g, ' ')
    .trim();
}

function safeDate(value, fallback) {
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed;
  const fb = fallback instanceof Date ? fallback : new Date(fallback || Date.now());
  return Number.isFinite(fb.getTime()) ? fb : new Date();
}

function parseTurkishDate(value, time, fallback) {
  const months = {
    ocak:0, şubat:1, subat:1, mart:2, nisan:3, mayıs:4, mayis:4, haziran:5,
    temmuz:6, ağustos:7, agustos:7, eylül:8, eylul:8, ekim:9, kasım:10, kasim:10, aralık:11, aralik:11,
  };
  const match = String(value || '').toLocaleLowerCase('tr-TR').match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})/i);
  const tm = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !tm) return safeDate(fallback, fallback);
  const month = months[match[2]];
  if (!Number.isInteger(month)) return safeDate(fallback, fallback);
  const iso = new Date(Date.UTC(Number(match[3]), month, Number(match[1]), Number(tm[1]) - 3, Number(tm[2]), 0));
  return Number.isFinite(iso.getTime()) ? iso : safeDate(fallback, fallback);
}

function absoluteUrl(href, origin) {
  try {
    return new URL(String(href || ''), origin).toString();
  } catch {
    return origin;
  }
}

function buildItem({ source, category, title, summary = '', url, publishedAt, breaking = false }) {
  const cleanTitle = cleanText(title);
  const cleanSummary = cleanText(summary).slice(0, 240);
  const safeUrl = absoluteUrl(url, source === 'TCMB' ? TCMB_ORIGIN : BLOOMBERG_ORIGIN);
  const iso = safeDate(publishedAt, new Date()).toISOString();
  return Object.freeze({
    id:`news_${stableHash(`${source}|${safeUrl}|${cleanTitle}`)}`,
    source,
    category,
    title:cleanTitle,
    summary:cleanSummary,
    url:safeUrl,
    publishedAt:iso,
    breaking:Boolean(breaking),
  });
}

export function classifyNews(title) {
  const text = cleanText(title);
  for (const [category, matcher] of CATEGORY_RULES) {
    if (matcher.test(text)) return category;
  }
  return FINANCE_FALLBACK.test(text) ? 'ekonomi' : null;
}

export function parseBloombergLatest(html, now = new Date()) {
  const items = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let index = 0;
  while ((match = anchorRe.exec(String(html || '')))) {
    const title = cleanText(match[2]);
    if (title.length < 12 || title.length > 220) continue;
    const category = classifyNews(title);
    if (!category) continue;
    const key = normalizeTitleKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const publishedAt = new Date(safeDate(now).getTime() - index * 60_000);
    items.push(buildItem({
      source:'Bloomberg HT', category, title, url:match[1], publishedAt, breaking:false,
    }));
    index += 1;
  }
  return items;
}

export function parseBloombergBreaking(html, now = new Date()) {
  const lines = textLines(html);
  const items = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\d{1,2}:\d{2}$/.test(lines[i])) continue;
    const time = lines[i];
    let dateLine = '';
    let title = '';
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      if (/\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4}/.test(lines[j])) {
        dateLine = lines[j];
        continue;
      }
      if (lines[j].length >= 18) {
        title = lines[j];
        break;
      }
    }
    const category = classifyNews(title);
    if (!title || !category) continue;
    const key = normalizeTitleKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const publishedAt = parseTurkishDate(dateLine, time, now);
    items.push(buildItem({
      source:'Bloomberg HT', category, title,
      url:`/sondakika#${stableHash(`${time}|${title}`)}`,
      publishedAt, breaking:true,
    }));
  }
  return items;
}

function xmlField(block, tag) {
  const match = String(block).match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

export function parseTcmbRss(xml, now = new Date()) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  let index = 0;
  while ((match = itemRe.exec(String(xml || '')))) {
    const block = match[1];
    const title = xmlField(block, 'title');
    if (!title) continue;
    const category = classifyNews(title) || 'ekonomi';
    const link = xmlField(block, 'link') || TCMB_ORIGIN;
    const pubDate = xmlField(block, 'pubDate');
    const description = xmlField(block, 'description');
    const fallback = new Date(safeDate(now).getTime() - index * 60_000);
    items.push(buildItem({
      source:'TCMB', category, title, summary:description, url:link,
      publishedAt:safeDate(pubDate, fallback), breaking:false,
    }));
    index += 1;
  }
  return items;
}

export function normalizeNewsItems(groups = []) {
  const byTitle = new Map();
  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : []) {
      if (!item || !classifyNews(item.title)) continue;
      const key = normalizeTitleKey(item.title);
      if (!key) continue;
      const current = byTitle.get(key);
      if (!current) {
        byTitle.set(key, item);
        continue;
      }
      const currentTime = Date.parse(current.publishedAt) || 0;
      const nextTime = Date.parse(item.publishedAt) || 0;
      const preferred = item.breaking && !current.breaking
        ? item
        : current.breaking && !item.breaking
          ? current
          : nextTime > currentTime ? item : current;
      byTitle.set(key, preferred);
    }
  }
  return [...byTitle.values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}

export const NEWS_SOURCE_URLS = Object.freeze({
  bloombergLatest:'https://www.bloomberght.com/tumhaberler',
  bloombergBreaking:'https://www.bloomberght.com/sondakika',
  tcmbPress:'https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Bottom+Menu/Diger/RSS/Basin+Duyurulari',
});
