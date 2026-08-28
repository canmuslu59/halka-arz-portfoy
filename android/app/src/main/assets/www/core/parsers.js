import { cleanTicker, cleanSectorName } from './domain.js';

export function numTR(value) {
  if (value == null) return null;
  let s = String(value).trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function decodeHtml(s = '') {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&uuml;/gi, 'ü')
    .replace(/&ouml;/gi, 'ö')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Ccedil;/g, 'Ç')
    .replace(/&#8378;/g, '₺');
}

function textFromHtml(s = '') {
  return decodeHtml(
    s
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function isoFromTurkishDate(text) {
  if (!text) return null;
  const months = {
    ocak: 1,
    şubat: 2,
    subat: 2,
    mart: 3,
    nisan: 4,
    mayıs: 5,
    mayis: 5,
    haziran: 6,
    temmuz: 7,
    ağustos: 8,
    agustos: 8,
    eylül: 9,
    eylul: 9,
    ekim: 10,
    kasım: 11,
    kasim: 11,
    aralık: 12,
    aralik: 12,
  };
  const match = String(text).toLocaleLowerCase('tr-TR').match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(20\d{2})/i);
  if (!match) return null;
  const month = months[match[2].toLocaleLowerCase('tr-TR')];
  return month
    ? `${match[3]}-${String(month).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`
    : null;
}

export function parseYahooChart(json, ticker) {
  const key = cleanTicker(ticker);
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Fiyat verisi bulunamadı.');
  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const zone = meta.exchangeTimezoneName || 'Europe/Istanbul';
  const dateInZone = epoch => {
    if (!Number.isFinite(epoch)) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(epoch * 1000));
    const pick = type => parts.find(p => p.type === type)?.value;
    const y = pick('year'), m = pick('month'), d = pick('day');
    return y && m && d ? `${y}-${m}-${d}` : null;
  };
  const rows = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = quote.close?.[i];
    if (!Number.isFinite(close)) continue;
    rows.push({
      date: dateInZone(timestamps[i]) || new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      close,
      high: Number.isFinite(quote.high?.[i]) ? quote.high[i] : null,
      low: Number.isFinite(quote.low?.[i]) ? quote.low[i] : null,
      open: Number.isFinite(quote.open?.[i]) ? quote.open[i] : null,
    });
  }
  rows.sort((a,b) => a.date.localeCompare(b.date));
  const latestMarketDate = dateInZone(meta.regularMarketTime) || rows.at(-1)?.date || null;
  const exactLatestIndex = latestMarketDate ? rows.findLastIndex(row => row.date === latestMarketDate) : rows.length - 1;
  const latestCompletedBeforeMarket = latestMarketDate
    ? rows.findLast(row => row.date < latestMarketDate)
    : null;
  const latestRow = exactLatestIndex >= 0 ? rows[exactLatestIndex] : rows.at(-1) || null;
  const previousRow = exactLatestIndex > 0
    ? rows[exactLatestIndex - 1]
    : exactLatestIndex < 0
      ? latestCompletedBeforeMarket
      : null;
  const lastClose = latestRow?.close ?? rows.at(-1)?.close ?? null;
  const previousClose = previousRow?.close
    ?? (Number.isFinite(meta.previousClose) ? meta.previousClose : null)
    ?? (Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : lastClose);
  const current = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : lastClose;
  return {
    ticker: key,
    symbol: `${key}.IS`,
    currency: meta.currency || 'TRY',
    current,
    previousClose,
    latestMarketDate,
    marketTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    exchangeName: meta.fullExchangeName || meta.exchangeName || 'BIST',
    exchangeTimezoneName: zone,
    history: rows,
  };
}

export function parseAhlatciList(html, ticker) {
  const key = cleanTicker(ticker);
  const rows = String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const text = textFromHtml(row);
    if (!new RegExp(`\\b${key}\\b`, 'i').test(text)) continue;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => textFromHtml(match[1]));
    const hrefMatch = row.match(/href=["']([^"']+)["']/i);
    const priceCell = cells.find(value => /[₺]/.test(value)) || text;
    const priceMatch = priceCell.match(/([0-9]{1,5}(?:[.,][0-9]{1,4})?)\s*₺/);
    return {
      ticker: key,
      company: (cells[0] || '').replace(new RegExp(`\\s*${key}\\s*$`, 'i'), '').trim() || null,
      ipoPrice: priceMatch ? numTR(priceMatch[1]) : null,
      offerDates: cells[3] || null,
      detailUrl: hrefMatch ? new URL(hrefMatch[1], 'https://www.ahlatciyatirim.com.tr').href : null,
      source: 'Ahlatcı Yatırım',
    };
  }
  return null;
}

export function parseAhlatciDetail(html, base = {}) {
  const text = textFromHtml(html);
  const heading = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const company = heading ? textFromHtml(heading[1]) : base.company || null;
  let ipoPrice = base.ipoPrice ?? null;
  let firstTradeDate = null;
  let offerDates = base.offerDates || null;
  const priceMatch = text.match(/Halka Arz Fiyatı\s*([0-9.]+,[0-9]+)\s*₺/i)
    || text.match(/fiyat\s*([0-9.]+,[0-9]+)\s*₺\s*olarak/i);
  if (priceMatch) ipoPrice = numTR(priceMatch[1]);
  const tradeMatch = text.match(/İlk İşlem(?: Tarihi)?:?\s*(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2})/i);
  if (tradeMatch) firstTradeDate = isoFromTurkishDate(tradeMatch[1]);
  const offerMatch = text.match(/Talep Tarihleri\s*([^₺]{3,45}?20\d{2})/i);
  if (offerMatch) offerDates = offerMatch[1].trim();
  return { ...base, company, ipoPrice, firstTradeDate, offerDates, source: 'Ahlatcı Yatırım' };
}


export function parseFintablesSector(html, ticker) {
  const key = cleanTicker(ticker);
  const raw = String(html || '');
  const marker = raw.search(/Sektörler/i);
  const scope = marker >= 0 ? raw.slice(marker, marker + 6000) : raw;

  const linkedSectors = [...scope.matchAll(/<a\b[^>]*href=["'][^"']*\/sektorler\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => cleanSectorName(textFromHtml(match[1])))
    .filter(Boolean)
    .filter((value, index, rows) => rows.indexOf(value) === index);

  let sector = linkedSectors.at(-1) || null;
  if (!sector) {
    const text = textFromHtml(scope);
    const match = text.match(/Sektörler\s*[:|]?\s*([^|•]{2,160}?)(?=\s+(?:Temettü|Finansallar|Ortaklık\s+Yapısı|Şirket|Karne|Kaynak|Son\s+temettü|Brüt\s+Kar|$))/i)
      || text.match(/Sektörler\s*[:|]?\s*([A-Za-zÇĞİÖŞÜçğıöşü&.()\-\s]{2,80})(?:$|\s{2,})/i);
    sector = cleanSectorName(match?.[1]);
  }

  return { ticker:key, sector, source: sector ? 'Fintables' : null };
}
