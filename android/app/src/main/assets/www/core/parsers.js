import { cleanTicker, cleanSectorName } from './domain.js';

export function numTR(value) {
  if (value == null) return null;
  let s = String(value).trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s.replace(/[^0-9.-]/g, ''))) s = s.replace(/\./g, '');
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

  const ticks = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const epoch = Number(timestamps[i]);
    const close = quote.close?.[i];
    if (!Number.isFinite(epoch) || !Number.isFinite(close)) continue;
    ticks.push({
      epoch,
      date: dateInZone(epoch) || new Date(epoch * 1000).toISOString().slice(0, 10),
      close,
      high: Number.isFinite(quote.high?.[i]) ? quote.high[i] : null,
      low: Number.isFinite(quote.low?.[i]) ? quote.low[i] : null,
      open: Number.isFinite(quote.open?.[i]) ? quote.open[i] : null,
    });
  }
  ticks.sort((a,b) => a.epoch - b.epoch);

  // Intraday endpoints contain many candles for the same session. Collapse them
  // to one daily OHLC row so recent quotes can safely backfill missing daily history.
  const byDate = new Map();
  for (const tick of ticks) {
    const existing = byDate.get(tick.date);
    if (!existing) {
      byDate.set(tick.date, { date:tick.date, close:tick.close, high:tick.high, low:tick.low, open:tick.open, lastEpoch:tick.epoch });
      continue;
    }
    existing.close = tick.close;
    existing.lastEpoch = tick.epoch;
    if (Number.isFinite(tick.high)) existing.high = Number.isFinite(existing.high) ? Math.max(existing.high, tick.high) : tick.high;
    if (Number.isFinite(tick.low)) existing.low = Number.isFinite(existing.low) ? Math.min(existing.low, tick.low) : tick.low;
    if (!Number.isFinite(existing.open) && Number.isFinite(tick.open)) existing.open = tick.open;
  }
  const rows = [...byDate.values()]
    .sort((a,b) => a.date.localeCompare(b.date))
    .map(({ lastEpoch, ...row }) => row);

  const latestTick = ticks.at(-1) || null;
  const metaEpoch = Number(meta.regularMarketTime);
  const marketEpoch = Math.max(Number.isFinite(metaEpoch) ? metaEpoch : 0, latestTick?.epoch || 0) || null;
  const latestMarketDate = marketEpoch ? dateInZone(marketEpoch) : rows.at(-1)?.date || null;
  const exactLatestIndex = latestMarketDate ? rows.findLastIndex(row => row.date === latestMarketDate) : rows.length - 1;
  const latestCompletedBeforeMarket = latestMarketDate ? rows.findLast(row => row.date < latestMarketDate) : null;
  const latestRow = exactLatestIndex >= 0 ? rows[exactLatestIndex] : rows.at(-1) || null;
  const sessionRow = exactLatestIndex >= 0 ? rows[exactLatestIndex] : null;
  const previousRow = exactLatestIndex > 0
    ? rows[exactLatestIndex - 1]
    : exactLatestIndex < 0
      ? latestCompletedBeforeMarket
      : null;
  const lastClose = latestRow?.close ?? rows.at(-1)?.close ?? null;

  // meta.previousClose is the exchange's previous-session close. It must win over
  // an older cached/daily row (e.g. Monday when Friday is missing from the series).
  const previousClose = Number.isFinite(meta.previousClose) ? meta.previousClose
    : previousRow?.close
      ?? (Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : lastClose);

  const freshestTickWins = latestTick && (!Number.isFinite(metaEpoch) || latestTick.epoch > metaEpoch);
  const current = freshestTickWins
    ? latestTick.close
    : Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : lastClose;

  return {
    ticker: key,
    symbol: `${key}.IS`,
    currency: meta.currency || 'TRY',
    current,
    previousClose,
    sessionHigh: Number.isFinite(sessionRow?.high) ? sessionRow.high : null,
    sessionLow: Number.isFinite(sessionRow?.low) ? sessionRow.low : null,
    latestMarketDate,
    marketTime: marketEpoch ? new Date(marketEpoch * 1000).toISOString() : null,
    exchangeName: meta.fullExchangeName || meta.exchangeName || 'BIST',
    exchangeTimezoneName: zone,
    history: rows,
  };
}


function splitConsortium(text = '') {
  return String(text)
    .split(/\s*,\s*|\s*;\s*/)
    .map(value => value.trim())
    .filter(Boolean);
}

function extractTickerFromCompanyCell(text = '') {
  const matches = String(text).match(/\b[A-Z0-9]{3,8}\b/g) || [];
  return cleanTicker(matches.at(-1) || '');
}

function sectionHtml(raw, heading) {
  const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(raw || '').match(new RegExp(`<h[1-6]\\b[^>]*>[^<]*${escaped}[^<]*<\\/h[1-6]>([\\s\\S]*?)(?=<h[1-6]\\b|$)`, 'i'));
  return match?.[1] || '';
}

export function parseAhlatciCalendar(html) {
  const raw = String(html || '');
  const out = [];

  // Active/upcoming IPOs are rendered as cards above the completed archive table.
  // Scan only that upper scope so a live offer is not missed just because it is not a <tr> yet.
  const completedHeading = raw.search(/<h[1-6]\b[^>]*>[\s\S]{0,180}Tamamlanm(?:ış|is)\s+Halka\s+Arzlar[\s\S]{0,80}<\/h[1-6]>/i);
  const firstTable = raw.search(/<table\b/i);
  const activeEnd = completedHeading >= 0 ? completedHeading : (firstTable >= 0 ? firstTable : raw.length);
  const activeScope = raw.slice(0, activeEnd);
  const detailLinks = [...activeScope.matchAll(/<a\b[^>]*href=["']([^"']*\/halka-arz\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const stopTickers = new Set(['AKTIF','YAKLASAN','YAKLAŞAN','HALKA','ARZ','FIYATI','FİYATI','TALEP','TARIHI','TARİHİ','BUYUKLUK','BÜYÜKLÜK','KONSORSIYUM','KONSORSİYUM','LIDERLERI','LİDERLERİ']);

  const cardLinks = [];
  for (const link of detailLinks) {
    const href = String(link[1] || '');
    const previous = cardLinks.at(-1);
    if (previous && previous.href === href) {
      previous.lastEnd = (link.index || 0) + link[0].length;
      continue;
    }
    cardLinks.push({ href, link, start:link.index || 0, lastEnd:(link.index || 0) + link[0].length });
  }

  for (let cardIndex = 0; cardIndex < cardLinks.length; cardIndex++) {
    const { link, start } = cardLinks[cardIndex];
    const provisionalEnd = cardLinks[cardIndex + 1]?.start ?? activeScope.length;
    const cardWindow = activeScope.slice(start, provisionalEnd);
    const articleClose = cardWindow.match(/<\/article\s*>/i);
    const sectionHeading = cardWindow.search(/<h2\b/i);
    const relativeEnd = articleClose?.index >= 0
      ? articleClose.index + articleClose[0].length
      : sectionHeading > link[0].length ? sectionHeading : cardWindow.length;
    const cardHtml = cardWindow.slice(0, relativeEnd);
    const cardText = textFromHtml(cardHtml);
    if (!/Talep\s+Tarih(?:leri|i)/i.test(cardText) || !/(?:Halka\s+Arz\s+Fiyatı|\bFiyat\b)/i.test(cardText)) continue;

    const anchorText = textFromHtml(link[2]);
    let company = /(?:katıl|incele|detay)/i.test(anchorText) ? null : anchorText.trim();
    if (!company || company.length < 5) {
      const headings = [...cardHtml.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)]
        .map(match => textFromHtml(match[1]))
        .filter(value => value && !/Halka\s+Arzlar/i.test(value));
      company = headings.find(value => /A\.?\s*Ş\.?/i.test(value)) || headings.at(-1) || null;
    }

    let ticker = '';
    if (company) {
      const pos = cardText.indexOf(company);
      const near = pos >= 0 ? cardText.slice(pos + company.length, pos + company.length + 120) : cardText;
      const candidates = near.match(/\b[A-ZÇĞİÖŞÜ0-9]{3,8}\b/g) || [];
      ticker = cleanTicker(candidates.find(value => !stopTickers.has(value)) || '');
    }
    if (!ticker) {
      const candidates = cardText.match(/\b[A-ZÇĞİÖŞÜ0-9]{3,8}\b/g) || [];
      ticker = cleanTicker(candidates.find(value => !stopTickers.has(value)) || '');
    }
    if (!ticker) continue;

    const priceMatch = cardText.match(/Halka\s+Arz\s+Fiyatı\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i)
      || cardText.match(/\bFiyat\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i);
    const dateMatch = cardText.match(/Talep\s+Tarih(?:leri|i)\s*((?:\d{1,2}\s*[-–—]\s*)?\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2})/i);
    const sizeMatch = cardText.match(/(?:Halka\s+Arz\s+)?Büyüklük\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i);
    const leaderMatch = cardText.match(/Konsorsiyum\s+Liderleri\s+(.+?)(?=\s+(?:Halka\s+Arza\s+Katıl|Halka\s+Arz\s+Fiyatı|Talep\s+Tarih|Büyüklük)|$)/i);
    if (!dateMatch) continue;

    out.push({
      ticker,
      company: company ? company.replace(new RegExp(`\\s*${ticker}\\s*$`, 'i'), '').trim() : null,
      sector: null,
      ipoPrice: priceMatch ? numTR(priceMatch[1]) : null,
      offerDates: dateMatch[1].replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').trim(),
      ipoSizeTRY: sizeMatch ? numTR(sizeMatch[1]) : null,
      consortiumLeaders: splitConsortium(leaderMatch?.[1] || ''),
      detailUrl: new URL(link[1], 'https://www.ahlatciyatirim.com.tr').href,
      source: 'Ahlatcı Yatırım',
    });
  }

  const rows = raw.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => textFromHtml(match[1]));
    if (cells.length < 4) continue;
    const ticker = extractTickerFromCompanyCell(cells[0]);
    if (!ticker) continue;
    const hrefMatch = row.match(/href=["']([^"']*\/halka-arz\/[^"']+)["']/i);
    const priceMatch = (cells[2] || '').match(/([0-9.]+(?:,[0-9]+)?)\s*₺/);
    const sizeMatch = (cells[4] || '').match(/([0-9.]+(?:,[0-9]+)?)\s*₺/);
    out.push({
      ticker,
      company: (cells[0] || '').replace(new RegExp(`\\s*${ticker}\\s*$`, 'i'), '').trim() || null,
      sector: cells[1] || null,
      ipoPrice: priceMatch ? numTR(priceMatch[1]) : null,
      offerDates: cells[3] || null,
      ipoSizeTRY: sizeMatch ? numTR(sizeMatch[1]) : null,
      consortiumLeaders: splitConsortium(cells[5] || ''),
      detailUrl: hrefMatch ? new URL(hrefMatch[1], 'https://www.ahlatciyatirim.com.tr').href : null,
      source: 'Ahlatcı Yatırım',
    });
  }
  const byTicker = new Map();
  for (const item of out) {
    const ticker = cleanTicker(item?.ticker);
    if (!ticker) continue;
    const existing = byTicker.get(ticker);
    if (!existing) {
      byTicker.set(ticker, { ...item, ticker });
      continue;
    }
    byTicker.set(ticker, {
      ...item,
      ...Object.fromEntries(Object.entries(existing).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length))),
      ticker,
      consortiumLeaders: existing.consortiumLeaders?.length ? existing.consortiumLeaders : (item.consortiumLeaders || []),
    });
  }
  return [...byTicker.values()];
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
  const raw = String(html || '');
  const text = textFromHtml(raw);
  const heading = raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const company = heading ? textFromHtml(heading[1]) : base.company || null;

  let ipoPrice = base.ipoPrice ?? null;
  let firstTradeDate = base.firstTradeDate || null;
  let offerDates = base.offerDates || null;
  const priceMatch = text.match(/Halka Arz Fiyatı\s*([0-9.]+,[0-9]+)\s*₺/i)
    || text.match(/fiyat\s*([0-9.]+,[0-9]+)\s*₺\s*olarak/i);
  if (priceMatch) ipoPrice = numTR(priceMatch[1]);
  const tradeMatch = text.match(/İlk İşlem(?: Tarihi)?:?\s*(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2})/i);
  if (tradeMatch) firstTradeDate = isoFromTurkishDate(tradeMatch[1]);
  const offerMatch = text.match(/Talep Tarihleri\s*(.+?20\d{2})(?=\s+İlk İşlem Tarihi|\s+Halka Arz Büyüklüğü|$)/i);
  if (offerMatch) offerDates = offerMatch[1].trim();

  const sector = text.match(/Sektör\s+(.+?)(?=\s+Halka Arz Fiyatı)/i)?.[1]?.trim() || base.sector || null;
  const ipoLots = numTR(text.match(/Halka Arz Büyüklüğü\s*\(Lot\)\s*([0-9.]+(?:,[0-9]+)?)\s*Lot/i)?.[1]) ?? base.ipoLots ?? null;
  const ipoSizeTRY = numTR(text.match(/Halka Arz Büyüklüğü\s*\(TL\)\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i)?.[1])
    ?? base.ipoSizeTRY ?? null;
  const discountPct = numTR(text.match(/İskonto Oranı\s*%\s*([0-9.,]+)/i)?.[1]) ?? base.discountPct ?? null;
  const freeFloatPct = numTR(text.match(/Halka Açıklık Oranı\s*%\s*([0-9.,]+)/i)?.[1]) ?? base.freeFloatPct ?? null;
  const distributionMethodMatch = text.match(/\b(Eşit|Oransal)\s+Dağıtım\b/i);
  const distributionMethod = distributionMethodMatch
    ? `${distributionMethodMatch[1][0].toLocaleUpperCase('tr-TR')}${distributionMethodMatch[1].slice(1).toLocaleLowerCase('tr-TR')} Dağıtım`
    : base.distributionMethod || null;
  const market = text.match(/\b(Yıldız Pazar|Ana Pazar|Alt Pazar|Yakın İzleme Pazarı|Piyasa Öncesi İşlem Platformu)\b/i)?.[1] || base.market || null;

  let participationIndex = base.participationIndex || null;
  if (/Katılım Endeksi[\s\S]{0,260}uygun değildir/i.test(text)) participationIndex = 'Uygun Değil';
  else if (/Katılım Endeksi[\s\S]{0,300}(?:uygun olarak değerlendirilmektedir|uygundur|uygun bulunmuştur)/i.test(text)) participationIndex = 'Uygun';

  const consortiumText = textFromHtml(sectionHtml(raw, 'Konsorsiyum Liderleri'));
  const consortiumLooksValid = consortiumText
    && consortiumText.length <= 180
    && !/(?:şirket detayları|Kamuyu Aydınlatma|ŞU AN AKTİF|Talep Toplayan Halka Arzlar)/i.test(consortiumText);
  const consortiumLeaders = consortiumLooksValid ? splitConsortium(consortiumText) : (base.consortiumLeaders || []);

  const fundText = textFromHtml(sectionHtml(raw, 'Fonun Kullanım Yerleri'));
  const fundUse = [];
  if (fundText) {
    const matches = [...fundText.matchAll(/%\s*([0-9.,]+)\s+(.+?)(?=\s+%\s*[0-9]|$)/g)];
    for (const match of matches) {
      const pct = numTR(match[1]);
      const purpose = match[2].trim();
      if (pct != null && purpose) fundUse.push({ pct, purpose });
    }
  }

  const resultsHtml = sectionHtml(raw, 'Halka Arz Sonuçları');
  const results = [];
  for (const row of resultsHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => textFromHtml(match[1]));
    if (cells.length < 4) continue;
    const group = cells[0]?.trim();
    if (!group) continue;
    results.push({
      group,
      people: numTR(cells[1]),
      lots: numTR(cells[2]),
      pct: numTR(cells[3]),
    });
  }
  const totalResult = results.find(row => /^Toplam$/i.test(row.group)) || null;
  const participantCount = totalResult?.people ?? numTR(text.match(/toplam\s+([0-9.]+)\s+yatırımcı\s+katıl/i)?.[1]) ?? base.participantCount ?? null;
  const distributedLots = totalResult?.lots ?? numTR(text.match(/([0-9.]+)\s+lot\s+dağıtıl/i)?.[1]) ?? base.distributedLots ?? ipoLots;
  const ceilingCountReported = numTR(text.match(/(?:ilk işlem günlerinde\s+hisse\s+)?(\d+)\s+kez\s+tavan\s+yap/i)?.[1]) ?? base.ceilingCountReported ?? null;

  const introMatch = raw.match(/<h1\b[^>]*>[\s\S]*?<\/h1>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
  const summary = introMatch ? textFromHtml(introMatch[1]) : base.summary || null;

  return {
    ...base,
    company,
    sector,
    ipoPrice,
    firstTradeDate,
    offerDates,
    ipoLots,
    ipoSizeTRY,
    discountPct,
    freeFloatPct,
    distributionMethod,
    market,
    participationIndex,
    consortiumLeaders,
    fundUse,
    results,
    participantCount,
    distributedLots,
    ceilingCountReported,
    summary,
    source:'Ahlatcı Yatırım',
  };
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
