export function cleanTicker(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\.IS$/i, '')
    .replace(/\.E$/i, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}



export function cleanSectorName(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > 64) return null;
  if (/(?:analizler|trade ekranı|terminal araştırma|spl eğitim|giriş yap|ücretsiz kaydol|hisseler\s*\/|al\s*\/\s*sat|karşılaştır|özet rapor)/i.test(text)) return null;
  return text;
}

function specificSectorFromText(value, ticker = '') {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR');
  const key = cleanTicker(ticker);
  if (!name && !key) return null;

  // Specific economic activity always wins over generic business-model words such as
  // mağazacılık, ticaret and perakende. This makes the allocation useful to investors.
  if (/GAYRİMENKUL\s+YATIRIM\s+ORTAK/.test(name) || /(?:GYO|GMYO)$/.test(key)) return 'GYO';
  if (/(?:ENERJİ|ELEKTRİK|YENİLENEBİLİR|DOĞAL\s+GAZ|PETROL|AKARYAKIT|GÜNEŞ|RÜZGAR)/.test(name)) return 'Enerji';
  if (/(?:GIDA|YİYECEK|İÇECEK|TARIM|SÜT|UN\b|ŞEKER|ET\b|TAVUK|PİLİÇ|MAKARNA|BAKLİYAT|YEM\b)/.test(name)) return 'Gıda';
  if (/(?:BANKA|BANKASI|BANKACILIK)/.test(name)) return 'Bankacılık';
  if (/(?:SİGORTA|EMEKLİLİK)/.test(name)) return 'Sigorta / Emeklilik';
  if (/(?:FİNANS|FAKTORİNG|FİNANSAL\s+KİRALAMA|MENKUL\s+DEĞERLER|YATIRIM\s+MENKUL)/.test(name)) return 'Finans';
  if (/(?:TEKNOLOJİ|YAZILIM|BİLİŞİM|SİBER|ELEKTRONİK|BİLGİSAYAR)/.test(name)) return 'Teknoloji';
  if (/(?:SAĞLIK|İLAÇ|HASTANE|TIBBİ|MEDİKAL)/.test(name)) return 'Sağlık';
  if (/(?:MADEN|MADENCİLİK)/.test(name)) return 'Madencilik';
  if (/(?:İNŞAAT|ÇİMENTO|BETON|YAPI\s+MALZEM)/.test(name)) return 'İnşaat / Yapı';
  if (/(?:DEMİR|ÇELİK|METAL|ALÜMİNYUM)/.test(name)) return 'Metal';
  if (/(?:TEKSTİL|GİYİM|KONFEKSİYON|DERİ\b)/.test(name)) return 'Tekstil';
  if (/(?:OTOMOTİV|MOTORLU\s+ARAÇ|OTOMOBİL)/.test(name)) return 'Otomotiv';
  if (/(?:LOJİSTİK|TAŞIMACILIK|ULAŞIM|HAVAYOLLARI|HAVA\s+YOLLARI|KARGO)/.test(name)) return 'Ulaştırma / Lojistik';
  if (/(?:TURİZM|OTEL|KONAKLAMA)/.test(name)) return 'Turizm';
  if (/(?:TELEKOM|İLETİŞİM)/.test(name)) return 'İletişim';
  if (/(?:KİMYA|PETROKİMYA)/.test(name)) return 'Kimya';
  if (/(?:HOLDİNG|YATIRIM\s+HOLDİNG)/.test(name)) return 'Holding';
  return null;
}

export function inferSectorFromCompany(company, ticker = '') {
  const text = String(company ?? '').replace(/\s+/g, ' ').trim();
  const specific = specificSectorFromText(text, ticker);
  if (specific) return specific;
  const name = text.toLocaleUpperCase('tr-TR');
  if (/(?:MAĞAZ|PERAKENDE|MARKET|TİCARET)/.test(name)) return 'Perakende';
  return null;
}

export function canonicalSectorName(value) {
  const clean = cleanSectorName(value);
  if (!clean) return null;
  const specific = specificSectorFromText(clean);
  if (specific) return specific;
  const upper = clean.toLocaleUpperCase('tr-TR');
  if (/(?:PERAKENDE|TOPTAN\s+VE\s+PERAKENDE)/.test(upper)) return 'Perakende';
  return clean;
}

export function isGenericSectorName(value) {
  const clean = cleanSectorName(value);
  if (!clean) return true;
  const upper = clean.toLocaleUpperCase('tr-TR');
  return /^(?:PERAKENDE|PERAKENDE TİCARET|TOPTAN VE PERAKENDE TİCARET|TİCARET|SANAYİ|HİZMET|HİZMETLER)$/.test(upper);
}

export function profitPct(profit, cost) {
  return Number(cost) > 0 ? (Number(profit) / Number(cost)) * 100 : 0;
}

function nullableFiniteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculateHolding(holding, { today = null } = {}) {
  const initialLots = Number(holding.initialLots ?? holding.currentLots ?? 0);
  const currentLots = Number(holding.currentLots ?? 0);
  const ipoPriceValue = nullableFiniteNumber(holding.ipoPrice);
  const ipoPrice = ipoPriceValue != null && ipoPriceValue > 0 ? ipoPriceValue : null;
  const currentPrice = nullableFiniteNumber(holding.currentPrice);
  const previousClose = nullableFiniteNumber(holding.previousClose);
  const sales = Array.isArray(holding.sales) ? holding.sales : [];

  const invested = ipoPrice == null ? null : initialLots * ipoPrice;
  const activeValue = currentPrice == null ? null : currentLots * currentPrice;
  const salesProceeds = sales.reduce((sum, sale) => sum + Number(sale.lots || 0) * Number(sale.price || 0), 0);
  const realizedProfit = ipoPrice == null
    ? null
    : sales.reduce((sum, sale) => sum + Number(sale.lots || 0) * (Number(sale.price || 0) - ipoPrice), 0);
  const unrealizedProfit = currentPrice == null || ipoPrice == null ? null : currentLots * (currentPrice - ipoPrice);
  const totalProfit = realizedProfit == null || unrealizedProfit == null ? null : realizedProfit + unrealizedProfit;
  const totalWealth = activeValue == null ? null : activeValue + salesProceeds;
  const latestMarketDate = holding.latestMarketDate || null;
  const sessionIsToday = !today || !latestMarketDate || latestMarketDate === today;
  const dailyProfit = !sessionIsToday
    ? 0
    : currentPrice == null || previousClose == null
      ? null
      : currentLots * (currentPrice - previousClose);
  const dailyPct = !sessionIsToday
    ? 0
    : currentPrice == null || !(previousClose > 0)
      ? null
      : ((currentPrice - previousClose) / previousClose) * 100;

  return {
    ...holding,
    ticker: cleanTicker(holding.ticker),
    initialLots,
    currentLots,
    ipoPrice,
    currentPrice,
    previousClose,
    latestMarketDate,
    sales,
    invested,
    activeValue,
    salesProceeds,
    totalWealth,
    realizedProfit,
    unrealizedProfit,
    totalProfit,
    totalProfitPct: invested != null && totalProfit != null ? profitPct(totalProfit, invested) : null,
    dailyProfit,
    dailyPct,
    dailySessionActive: sessionIsToday,
  };
}

export function calculateTotals(holdings) {
  const keys = ['invested', 'activeValue', 'salesProceeds', 'totalWealth', 'totalProfit', 'realizedProfit', 'unrealizedProfit', 'dailyProfit'];
  const totals = Object.fromEntries(keys.map(key => [key, 0]));
  let activePositionCount = 0;
  let missingActiveValueCount = 0;
  let missingDailyValueCount = 0;

  for (const holding of holdings) {
    const active = Number(holding.currentLots || 0) > 0;
    if (active) {
      activePositionCount += 1;
      if (!Number.isFinite(holding.activeValue) || !Number.isFinite(holding.totalWealth) || !Number.isFinite(holding.totalProfit)) {
        missingActiveValueCount += 1;
      }
      if (holding.dailySessionActive !== false
          && (!Number.isFinite(holding.previousClose) || !Number.isFinite(holding.dailyProfit))) {
        missingDailyValueCount += 1;
      }
    }
    for (const key of keys) {
      if (Number.isFinite(holding[key])) totals[key] += holding[key];
    }
  }

  totals.activePositionCount = activePositionCount;
  totals.missingActiveValueCount = missingActiveValueCount;
  totals.missingDailyValueCount = missingDailyValueCount;
  totals.complete = missingActiveValueCount === 0;
  totals.dailyComplete = missingDailyValueCount === 0;
  totals.totalProfitPct = totals.complete && totals.invested > 0 ? (totals.totalProfit / totals.invested) * 100 : null;

  const dailyBase = holdings.reduce((sum, holding) => {
    if (holding.dailySessionActive === false || !(Number(holding.currentLots || 0) > 0)) return sum;
    return sum + (Number.isFinite(holding.previousClose) ? holding.previousClose * Number(holding.currentLots || 0) : 0);
  }, 0);
  totals.dailyPct = totals.dailyComplete && dailyBase > 0 ? (totals.dailyProfit / dailyBase) * 100 : null;

  if (!totals.complete) {
    // Never let consumers accidentally present a partial active portfolio value/profit as complete.
    totals.activeValue = null;
    totals.totalWealth = null;
    totals.totalProfit = null;
    totals.unrealizedProfit = null;
  }
  if (!totals.dailyComplete) totals.dailyProfit = null;
  return totals;
}

function normalizedSales(holding) {
  return (Array.isArray(holding.sales) ? holding.sales : [])
    .filter(sale => sale && typeof sale.date === 'string')
    .map(sale => ({ date: sale.date, lots: Number(sale.lots || 0), price: Number(sale.price || 0) }))
    .filter(sale => sale.lots > 0 && sale.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function historyStateOnDate(holding, date) {
  const start = holding.firstTradeDate || holding.history?.[0]?.date || null;
  const ipoPrice = Number(holding.ipoPrice);
  const initialLots = Number(holding.initialLots || 0);
  if (!start || date < start || !(ipoPrice > 0) || !(initialLots > 0)) return null;

  const rows = Array.isArray(holding.history) ? holding.history : [];
  let close = null;
  for (const row of rows) {
    if (!row?.date || row.date > date) break;
    const rowClose = nullableFiniteNumber(row.close);
    if (row.date >= start && rowClose != null) close = rowClose;
  }
  if (close == null && date === start) close = ipoPrice;
  if (close == null) return null;

  let soldLots = 0;
  let proceeds = 0;
  for (const sale of normalizedSales(holding)) {
    if (sale.date > date) break;
    soldLots += sale.lots;
    proceeds += sale.lots * sale.price;
  }
  const activeLots = Math.max(0, initialLots - soldLots);
  const cost = initialLots * ipoPrice;
  return {
    value: activeLots * close + proceeds,
    cost,
    capitalAdded: date === start ? cost : 0,
  };
}

export function makePortfolioHistory(holdings) {
  const dates = new Set();
  for (const holding of holdings) {
    const start = holding.firstTradeDate || holding.history?.[0]?.date;
    if (!start || !holding.ipoPrice || !holding.initialLots) continue;
    dates.add(start);
    for (const row of Array.isArray(holding.history) ? holding.history : []) {
      if (row?.date && row.date >= start) dates.add(row.date);
    }
    for (const sale of normalizedSales(holding)) {
      if (sale.date >= start) dates.add(sale.date);
    }
  }

  const rows = [...dates].sort().map(date => {
    let value = 0;
    let cost = 0;
    let capitalAdded = 0;
    for (const holding of holdings) {
      const state = historyStateOnDate(holding, date);
      if (!state) continue;
      value += state.value;
      cost += state.cost;
      capitalAdded += state.capitalAdded;
    }
    const profit = value - cost;
    return { date, value, cost, profit, profitPct: profitPct(profit, cost), capitalAdded };
  }).filter(row => row.cost > 0);

  let previousValue = 0;
  let previousProfit = 0;
  return rows.map((row, index) => {
    const dailyProfit = row.profit - (index ? previousProfit : 0);
    const dailyBase = previousValue + row.capitalAdded;
    const dailyPct = dailyBase > 0 ? (dailyProfit / dailyBase) * 100 : 0;
    previousValue = row.value;
    previousProfit = row.profit;
    return { ...row, dailyProfit, dailyPct };
  });
}

export function validateSale(holding, lots, price) {
  const saleLots = Number(lots);
  const salePrice = Number(price);
  if (!Number.isInteger(saleLots) || saleLots <= 0 || !Number.isFinite(salePrice) || salePrice <= 0) {
    throw new Error('Satış lotu ve fiyatı geçerli olmalı.');
  }
  if (saleLots > Number(holding.currentLots || 0)) {
    throw new Error('Satış lotu mevcut lottan fazla olamaz.');
  }
  return { lots: saleLots, price: salePrice };
}
