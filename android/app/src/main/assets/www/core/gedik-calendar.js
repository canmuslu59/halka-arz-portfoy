import { cleanTicker } from './domain.js';
import { numTR } from './parsers.js';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&uuml;/gi, 'ü')
    .replace(/&ouml;/gi, 'ö')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Ccedil;/g, 'Ç');
}

function textFromHtml(html = '') {
  return decodeHtml(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function normalizeOfferDates(value = '') {
  const compact = String(value)
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const match = compact.match(/^(\d{1,2}(?:-\d{1,2})+)\s+(.+)$/u);
  if (!match) return compact;
  const days = match[1].split('-').filter(Boolean);
  if (days.length < 2) return compact;
  return `${days[0]}-${days.at(-1)} ${match[2]}`;
}

const ROW_PATTERN = /(?:^|\s)([A-Z0-9]{3,8})\s+(.{3,180}?A\.?\s*[Şş]\.?)\s+((?:AKTİF|Aktif|aktif)\s+)?((?:\d{1,2}\s*[-–—]\s*){0,2}\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2})\s+([0-9.]+(?:,[0-9]+)?)\s*TL/g;
const NAVIGATION_NOISE = /(?:KANALLARIMIZ|BİZE\s+ULAŞIN|BIZE\s+ULASIN|HESAP\s+AÇIN|HESAP\s+ACIN|GİRİŞ\s+YAP|GIRIS\s+YAP|HALKA\s+ARZ\s+TAKVİMİ)/i;

function parseRowsFromText(text, unique) {
  ROW_PATTERN.lastIndex = 0;
  let match;
  while ((match = ROW_PATTERN.exec(text)) !== null) {
    const ticker = cleanTicker(match[1]);
    if (!ticker) continue;
    const company = match[2].replace(/\s+/g, ' ').trim();
    if (NAVIGATION_NOISE.test(company)) continue;
    const offerDates = normalizeOfferDates(match[4]);
    const key = `${ticker}|${offerDates}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      ticker,
      company,
      sector: null,
      ipoPrice: numTR(match[5]),
      offerDates,
      ipoSizeTRY: null,
      consortiumLeaders: [],
      detailUrl: null,
      source: 'Gedik Yatırım',
      status: match[3] ? 'active' : null,
    });
  }
}

export function parseGedikCalendar(html) {
  const source = String(html || '');
  const unique = new Map();

  // Gedik renders IPO cards as links. Parse each link independently so page navigation
  // text such as “İŞLEM KANALLARIMIZ” can never bleed into a neighbouring IPO record.
  const anchors = source.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const anchor of anchors) parseRowsFromText(textFromHtml(anchor), unique);
  if (unique.size) return [...unique.values()];

  // Keep a conservative fallback for saved fixtures or a future markup change.
  parseRowsFromText(textFromHtml(source), unique);
  return [...unique.values()];
}
