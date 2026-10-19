// legacy-webview source=core/parsers.js blob=8bec3e46724a770d973237405bec6353328c128f esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
import { cleanTicker, cleanSectorName } from "./domain.js";
export function numTR(value) {
  if (value == null) return null;
  let s = String(value).trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s.replace(/[^0-9.-]/g, ""))) s = s.replace(/\./g, "");
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function decodeHtml(s = "") {
  return s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&uuml;/gi, "ü").replace(/&ouml;/gi, "ö").replace(/&ccedil;/gi, "ç").replace(/&Uuml;/g, "Ü").replace(/&Ouml;/g, "Ö").replace(/&Ccedil;/g, "Ç").replace(/&#8378;/g, "₺");
}
function textFromHtml(s = "") {
  return decodeHtml(
    s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
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
    aralik: 12
  };
  const match = String(text).toLocaleLowerCase("tr-TR").match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(20\d{2})/i);
  if (!match) return null;
  const month = months[match[2].toLocaleLowerCase("tr-TR")];
  return month ? `${match[3]}-${String(month).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}` : null;
}
export function parseYahooChart(json, ticker) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const key = cleanTicker(ticker);
  const result = (_b = (_a = json == null ? void 0 : json.chart) == null ? void 0 : _a.result) == null ? void 0 : _b[0];
  if (!result) throw new Error("Fiyat verisi bulunamadı.");
  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const quote = ((_d = (_c = result.indicators) == null ? void 0 : _c.quote) == null ? void 0 : _d[0]) || {};
  const zone = meta.exchangeTimezoneName || "Europe/Istanbul";
  const dateInZone = (epoch) => {
    if (!Number.isFinite(epoch)) return null;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(epoch * 1e3));
    const pick = (type) => {
      var _a2;
      return (_a2 = parts.find((p) => p.type === type)) == null ? void 0 : _a2.value;
    };
    const y = pick("year"), m = pick("month"), d = pick("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  };
  const ticks = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const epoch = Number(timestamps[i]);
    const close = (_e = quote.close) == null ? void 0 : _e[i];
    if (!Number.isFinite(epoch) || !Number.isFinite(close)) continue;
    ticks.push({
      epoch,
      date: dateInZone(epoch) || new Date(epoch * 1e3).toISOString().slice(0, 10),
      close,
      high: Number.isFinite((_f = quote.high) == null ? void 0 : _f[i]) ? quote.high[i] : null,
      low: Number.isFinite((_g = quote.low) == null ? void 0 : _g[i]) ? quote.low[i] : null,
      open: Number.isFinite((_h = quote.open) == null ? void 0 : _h[i]) ? quote.open[i] : null
    });
  }
  ticks.sort((a, b) => a.epoch - b.epoch);
  const byDate = /* @__PURE__ */ new Map();
  for (const tick of ticks) {
    const existing = byDate.get(tick.date);
    if (!existing) {
      byDate.set(tick.date, { date: tick.date, close: tick.close, high: tick.high, low: tick.low, open: tick.open, lastEpoch: tick.epoch });
      continue;
    }
    existing.close = tick.close;
    existing.lastEpoch = tick.epoch;
    if (Number.isFinite(tick.high)) existing.high = Number.isFinite(existing.high) ? Math.max(existing.high, tick.high) : tick.high;
    if (Number.isFinite(tick.low)) existing.low = Number.isFinite(existing.low) ? Math.min(existing.low, tick.low) : tick.low;
    if (!Number.isFinite(existing.open) && Number.isFinite(tick.open)) existing.open = tick.open;
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ lastEpoch, ...row }) => row);
  const latestTick = ticks.length ? ticks[ticks.length - 1] : null;
  const metaEpoch = Number(meta.regularMarketTime);
  const marketEpoch = Math.max(Number.isFinite(metaEpoch) ? metaEpoch : 0, (latestTick == null ? void 0 : latestTick.epoch) || 0) || null;
  const lastRow = rows.length ? rows[rows.length - 1] : null;
  const latestMarketDate = marketEpoch ? dateInZone(marketEpoch) : (lastRow == null ? void 0 : lastRow.date) || null;
  let exactLatestIndex = rows.length - 1;
  if (latestMarketDate) {
    exactLatestIndex = -1;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].date === latestMarketDate) {
        exactLatestIndex = i;
        break;
      }
    }
  }
  let latestCompletedBeforeMarket = null;
  if (latestMarketDate) {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].date < latestMarketDate) {
        latestCompletedBeforeMarket = rows[i];
        break;
      }
    }
  }
  const latestRow = exactLatestIndex >= 0 ? rows[exactLatestIndex] : lastRow;
  const previousRow = exactLatestIndex > 0 ? rows[exactLatestIndex - 1] : exactLatestIndex < 0 ? latestCompletedBeforeMarket : null;
  const lastClose = (_j = (_i = latestRow == null ? void 0 : latestRow.close) != null ? _i : lastRow == null ? void 0 : lastRow.close) != null ? _j : null;
  const previousClose = Number.isFinite(meta.previousClose) ? meta.previousClose : (_k = previousRow == null ? void 0 : previousRow.close) != null ? _k : Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : null;
  const freshestTickWins = latestTick && (!Number.isFinite(metaEpoch) || latestTick.epoch > metaEpoch);
  const current = freshestTickWins ? latestTick.close : Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : lastClose;
  const events = result.events || {};
  const dividendsByDate = /* @__PURE__ */ new Map();
  for (const event of Object.values(events.dividends || {})) {
    const date = dateInZone(Number(event == null ? void 0 : event.date));
    const amount = Number(event == null ? void 0 : event.amount);
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;
    dividendsByDate.set(date, { date, amount });
  }
  const dividends = [...dividendsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const splits = Object.values(events.splits || {}).map((event) => ({
    date: dateInZone(Number(event == null ? void 0 : event.date)),
    numerator: Number(event == null ? void 0 : event.numerator),
    denominator: Number(event == null ? void 0 : event.denominator)
  })).filter((split) => split.date && split.numerator > 0 && split.denominator > 0).sort((a, b) => a.date.localeCompare(b.date));
  return {
    ticker: key,
    symbol: `${key}.IS`,
    currency: meta.currency || "TRY",
    current,
    previousClose,
    latestMarketDate,
    marketTime: marketEpoch ? new Date(marketEpoch * 1e3).toISOString() : null,
    exchangeName: meta.fullExchangeName || meta.exchangeName || "BIST",
    exchangeTimezoneName: zone,
    history: rows,
    dividends,
    splits
  };
}
function splitConsortium(text = "") {
  return String(text).split(/\s*,\s*|\s*;\s*/).map((value) => value.trim()).filter(Boolean);
}
function extractTickerFromCompanyCell(text = "") {
  const matches = String(text).match(/\b[A-Z0-9]{3,8}\b/g) || [];
  return cleanTicker((matches.length ? matches[matches.length - 1] : "") || "");
}
function sectionHtml(raw, heading) {
  const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(raw || "").match(new RegExp(`<h[1-6]\\b[^>]*>[^<]*${escaped}[^<]*<\\/h[1-6]>([\\s\\S]*?)(?=<h[1-6]\\b|$)`, "i"));
  return (match == null ? void 0 : match[1]) || "";
}
export function parseAhlatciCalendar(html) {
  var _a, _b, _c;
  const raw = String(html || "");
  const out = [];
  const completedHeading = raw.search(/<h[1-6]\b[^>]*>[\s\S]{0,180}Tamamlanm(?:ış|is)\s+Halka\s+Arzlar[\s\S]{0,80}<\/h[1-6]>/i);
  const firstTable = raw.search(/<table\b/i);
  const activeEnd = completedHeading >= 0 ? completedHeading : firstTable >= 0 ? firstTable : raw.length;
  const activeScope = raw.slice(0, activeEnd);
  const detailLinks = [...activeScope.matchAll(/<a\b[^>]*href=["']([^"']*\/halka-arz\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const stopTickers = /* @__PURE__ */ new Set(["AKTIF", "YAKLASAN", "YAKLAŞAN", "HALKA", "ARZ", "FIYATI", "FİYATI", "TALEP", "TARIHI", "TARİHİ", "BUYUKLUK", "BÜYÜKLÜK", "KONSORSIYUM", "KONSORSİYUM", "LIDERLERI", "LİDERLERİ"]);
  const cardLinks = [];
  for (const link of detailLinks) {
    const href = String(link[1] || "");
    const previous = cardLinks.length ? cardLinks[cardLinks.length - 1] : null;
    if (previous && previous.href === href) {
      previous.lastEnd = (link.index || 0) + link[0].length;
      continue;
    }
    cardLinks.push({ href, link, start: link.index || 0, lastEnd: (link.index || 0) + link[0].length });
  }
  for (let cardIndex = 0; cardIndex < cardLinks.length; cardIndex++) {
    const { link, start } = cardLinks[cardIndex];
    const provisionalEnd = (_b = (_a = cardLinks[cardIndex + 1]) == null ? void 0 : _a.start) != null ? _b : activeScope.length;
    const cardWindow = activeScope.slice(start, provisionalEnd);
    const articleClose = cardWindow.match(/<\/article\s*>/i);
    const sectionHeading = cardWindow.search(/<h2\b/i);
    const relativeEnd = (articleClose == null ? void 0 : articleClose.index) >= 0 ? articleClose.index + articleClose[0].length : sectionHeading > link[0].length ? sectionHeading : cardWindow.length;
    const cardHtml = cardWindow.slice(0, relativeEnd);
    const cardText = textFromHtml(cardHtml);
    if (!/Talep\s+Tarih(?:leri|i)/i.test(cardText) || !/(?:Halka\s+Arz\s+Fiyatı|\bFiyat\b)/i.test(cardText)) continue;
    const anchorText = textFromHtml(link[2]);
    let company = /(?:katıl|incele|detay)/i.test(anchorText) ? null : anchorText.trim();
    if (!company || company.length < 5) {
      const headings = [...cardHtml.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)].map((match) => textFromHtml(match[1])).filter((value) => value && !/Halka\s+Arzlar/i.test(value));
      company = headings.find((value) => /A\.?\s*Ş\.?/i.test(value)) || (headings.length ? headings[headings.length - 1] : null);
    }
    let ticker = "";
    if (company) {
      const pos = cardText.indexOf(company);
      const near = pos >= 0 ? cardText.slice(pos + company.length, pos + company.length + 120) : cardText;
      const candidates = near.match(/\b[A-ZÇĞİÖŞÜ0-9]{3,8}\b/g) || [];
      ticker = cleanTicker(candidates.find((value) => !stopTickers.has(value)) || "");
    }
    if (!ticker) {
      const candidates = cardText.match(/\b[A-ZÇĞİÖŞÜ0-9]{3,8}\b/g) || [];
      ticker = cleanTicker(candidates.find((value) => !stopTickers.has(value)) || "");
    }
    if (!ticker) continue;
    const priceMatch = cardText.match(/Halka\s+Arz\s+Fiyatı\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i) || cardText.match(/\bFiyat\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i);
    const dateMatch = cardText.match(/Talep\s+Tarih(?:leri|i)\s*((?:\d{1,2}\s*[-–—]\s*)?\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2})/i);
    const sizeMatch = cardText.match(/(?:Halka\s+Arz\s+)?Büyüklük\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i);
    const leaderMatch = cardText.match(/Konsorsiyum\s+Liderleri\s+(.+?)(?=\s+(?:Halka\s+Arza\s+Katıl|Halka\s+Arz\s+Fiyatı|Talep\s+Tarih|Büyüklük)|$)/i);
    if (!dateMatch) continue;
    out.push({
      ticker,
      company: company ? company.replace(new RegExp(`\\s*${ticker}\\s*$`, "i"), "").trim() : null,
      sector: null,
      ipoPrice: priceMatch ? numTR(priceMatch[1]) : null,
      offerDates: dateMatch[1].replace(/[–—]/g, "-").replace(/\s*-\s*/g, "-").trim(),
      ipoSizeTRY: sizeMatch ? numTR(sizeMatch[1]) : null,
      consortiumLeaders: splitConsortium((leaderMatch == null ? void 0 : leaderMatch[1]) || ""),
      detailUrl: new URL(link[1], "https://www.ahlatciyatirim.com.tr").href,
      source: "Ahlatcı Yatırım"
    });
  }
  const rows = raw.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => textFromHtml(match[1]));
    if (cells.length < 4) continue;
    const ticker = extractTickerFromCompanyCell(cells[0]);
    if (!ticker) continue;
    const hrefMatch = row.match(/href=["']([^"']*\/halka-arz\/[^"']+)["']/i);
    const priceMatch = (cells[2] || "").match(/([0-9.]+(?:,[0-9]+)?)\s*₺/);
    const sizeMatch = (cells[4] || "").match(/([0-9.]+(?:,[0-9]+)?)\s*₺/);
    out.push({
      ticker,
      company: (cells[0] || "").replace(new RegExp(`\\s*${ticker}\\s*$`, "i"), "").trim() || null,
      sector: cells[1] || null,
      ipoPrice: priceMatch ? numTR(priceMatch[1]) : null,
      offerDates: cells[3] || null,
      ipoSizeTRY: sizeMatch ? numTR(sizeMatch[1]) : null,
      consortiumLeaders: splitConsortium(cells[5] || ""),
      detailUrl: hrefMatch ? new URL(hrefMatch[1], "https://www.ahlatciyatirim.com.tr").href : null,
      source: "Ahlatcı Yatırım"
    });
  }
  const byTicker = /* @__PURE__ */ new Map();
  for (const item of out) {
    const ticker = cleanTicker(item == null ? void 0 : item.ticker);
    if (!ticker) continue;
    const existing = byTicker.get(ticker);
    if (!existing) {
      byTicker.set(ticker, { ...item, ticker });
      continue;
    }
    byTicker.set(ticker, {
      ...item,
      ...Object.fromEntries(Object.entries(existing).filter(([, value]) => value != null && value !== "" && (!Array.isArray(value) || value.length))),
      ticker,
      consortiumLeaders: ((_c = existing.consortiumLeaders) == null ? void 0 : _c.length) ? existing.consortiumLeaders : item.consortiumLeaders || []
    });
  }
  return [...byTicker.values()];
}
export function parseAhlatciList(html, ticker) {
  const key = cleanTicker(ticker);
  const rows = String(html || "").match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const text = textFromHtml(row);
    if (!new RegExp(`\\b${key}\\b`, "i").test(text)) continue;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => textFromHtml(match[1]));
    const hrefMatch = row.match(/href=["']([^"']+)["']/i);
    const priceCell = cells.find((value) => /[₺]/.test(value)) || text;
    const priceMatch = priceCell.match(/([0-9]{1,5}(?:[.,][0-9]{1,4})?)\s*₺/);
    return {
      ticker: key,
      company: (cells[0] || "").replace(new RegExp(`\\s*${key}\\s*$`, "i"), "").trim() || null,
      ipoPrice: priceMatch ? numTR(priceMatch[1]) : null,
      offerDates: cells[3] || null,
      detailUrl: hrefMatch ? new URL(hrefMatch[1], "https://www.ahlatciyatirim.com.tr").href : null,
      source: "Ahlatcı Yatırım"
    };
  }
  return null;
}
export function parseAhlatciDetail(html, base = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B;
  const raw = String(html || "");
  const text = textFromHtml(raw);
  const heading = raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const company = heading ? textFromHtml(heading[1]) : base.company || null;
  let ipoPrice = (_a = base.ipoPrice) != null ? _a : null;
  let firstTradeDate = base.firstTradeDate || null;
  let offerDates = base.offerDates || null;
  const priceMatch = text.match(/Halka Arz Fiyatı\s*([0-9.]+,[0-9]+)\s*₺/i) || text.match(/fiyat\s*([0-9.]+,[0-9]+)\s*₺\s*olarak/i);
  if (priceMatch) ipoPrice = numTR(priceMatch[1]);
  const tradeMatch = text.match(/İlk İşlem(?: Tarihi)?:?\s*(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2})/i);
  if (tradeMatch) firstTradeDate = isoFromTurkishDate(tradeMatch[1]);
  const offerMatch = text.match(/Talep Tarihleri\s*(.+?20\d{2})(?=\s+İlk İşlem Tarihi|\s+Halka Arz Büyüklüğü|$)/i);
  if (offerMatch) offerDates = offerMatch[1].trim();
  const sector = ((_c = (_b = text.match(/Sektör\s+(.+?)(?=\s+Halka Arz Fiyatı)/i)) == null ? void 0 : _b[1]) == null ? void 0 : _c.trim()) || base.sector || null;
  const ipoLots = (_f = (_e = numTR((_d = text.match(/Halka Arz Büyüklüğü\s*\(Lot\)\s*([0-9.]+(?:,[0-9]+)?)\s*Lot/i)) == null ? void 0 : _d[1])) != null ? _e : base.ipoLots) != null ? _f : null;
  const ipoSizeTRY = (_i = (_h = numTR((_g = text.match(/Halka Arz Büyüklüğü\s*\(TL\)\s*([0-9.]+(?:,[0-9]+)?)\s*₺/i)) == null ? void 0 : _g[1])) != null ? _h : base.ipoSizeTRY) != null ? _i : null;
  const discountPct = (_l = (_k = numTR((_j = text.match(/İskonto Oranı\s*%\s*([0-9.,]+)/i)) == null ? void 0 : _j[1])) != null ? _k : base.discountPct) != null ? _l : null;
  const freeFloatPct = (_o = (_n = numTR((_m = text.match(/Halka Açıklık Oranı\s*%\s*([0-9.,]+)/i)) == null ? void 0 : _m[1])) != null ? _n : base.freeFloatPct) != null ? _o : null;
  const distributionMethodMatch = text.match(/\b(Eşit|Oransal)\s+Dağıtım\b/i);
  const distributionMethod = distributionMethodMatch ? `${distributionMethodMatch[1][0].toLocaleUpperCase("tr-TR")}${distributionMethodMatch[1].slice(1).toLocaleLowerCase("tr-TR")} Dağıtım` : base.distributionMethod || null;
  const market = ((_p = text.match(/\b(Yıldız Pazar|Ana Pazar|Alt Pazar|Yakın İzleme Pazarı|Piyasa Öncesi İşlem Platformu)\b/i)) == null ? void 0 : _p[1]) || base.market || null;
  let participationIndex = base.participationIndex || null;
  if (/Katılım Endeksi[\s\S]{0,260}uygun değildir/i.test(text)) participationIndex = "Uygun Değil";
  else if (/Katılım Endeksi[\s\S]{0,300}(?:uygun olarak değerlendirilmektedir|uygundur|uygun bulunmuştur)/i.test(text)) participationIndex = "Uygun";
  const consortiumText = textFromHtml(sectionHtml(raw, "Konsorsiyum Liderleri"));
  const consortiumLooksValid = consortiumText && consortiumText.length <= 180 && !/(?:şirket detayları|Kamuyu Aydınlatma|ŞU AN AKTİF|Talep Toplayan Halka Arzlar)/i.test(consortiumText);
  const consortiumLeaders = consortiumLooksValid ? splitConsortium(consortiumText) : base.consortiumLeaders || [];
  const fundText = textFromHtml(sectionHtml(raw, "Fonun Kullanım Yerleri"));
  const fundUse = [];
  if (fundText) {
    const matches = [...fundText.matchAll(/%\s*([0-9.,]+)\s+(.+?)(?=\s+%\s*[0-9]|$)/g)];
    for (const match of matches) {
      const pct = numTR(match[1]);
      const purpose = match[2].trim();
      if (pct != null && purpose) fundUse.push({ pct, purpose });
    }
  }
  const resultsHtml = sectionHtml(raw, "Halka Arz Sonuçları");
  const results = [];
  for (const row of resultsHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => textFromHtml(match[1]));
    if (cells.length < 4) continue;
    const group = (_q = cells[0]) == null ? void 0 : _q.trim();
    if (!group) continue;
    results.push({
      group,
      people: numTR(cells[1]),
      lots: numTR(cells[2]),
      pct: numTR(cells[3])
    });
  }
  const totalResult = results.find((row) => /^Toplam$/i.test(row.group)) || null;
  const participantCount = (_u = (_t = (_s = totalResult == null ? void 0 : totalResult.people) != null ? _s : numTR((_r = text.match(/toplam\s+([0-9.]+)\s+yatırımcı\s+katıl/i)) == null ? void 0 : _r[1])) != null ? _t : base.participantCount) != null ? _u : null;
  const distributedLots = (_y = (_x = (_w = totalResult == null ? void 0 : totalResult.lots) != null ? _w : numTR((_v = text.match(/([0-9.]+)\s+lot\s+dağıtıl/i)) == null ? void 0 : _v[1])) != null ? _x : base.distributedLots) != null ? _y : ipoLots;
  const ceilingCountReported = (_B = (_A = numTR((_z = text.match(/(?:ilk işlem günlerinde\s+hisse\s+)?(\d+)\s+kez\s+tavan\s+yap/i)) == null ? void 0 : _z[1])) != null ? _A : base.ceilingCountReported) != null ? _B : null;
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
    source: "Ahlatcı Yatırım"
  };
}
export function parseFintablesSector(html, ticker) {
  const key = cleanTicker(ticker);
  const raw = String(html || "");
  const marker = raw.search(/Sektörler/i);
  const scope = marker >= 0 ? raw.slice(marker, marker + 6e3) : raw;
  const linkedSectors = [...scope.matchAll(/<a\b[^>]*href=["'][^"']*\/sektorler\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => cleanSectorName(textFromHtml(match[1]))).filter(Boolean).filter((value, index, rows) => rows.indexOf(value) === index);
  let sector = linkedSectors.length ? linkedSectors[linkedSectors.length - 1] : null;
  if (!sector) {
    const text = textFromHtml(scope);
    const match = text.match(/Sektörler\s*[:|]?\s*([^|•]{2,160}?)(?=\s+(?:Temettü|Finansallar|Ortaklık\s+Yapısı|Şirket|Karne|Kaynak|Son\s+temettü|Brüt\s+Kar|$))/i) || text.match(/Sektörler\s*[:|]?\s*([A-Za-zÇĞİÖŞÜçğıöşü&.()\-\s]{2,80})(?:$|\s{2,})/i);
    sector = cleanSectorName(match == null ? void 0 : match[1]);
  }
  return { ticker: key, sector, source: sector ? "Fintables" : null };
}
