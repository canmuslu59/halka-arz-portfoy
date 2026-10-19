// legacy-webview source=core/domain.js blob=111a09dbc78e82cb5baa955c4a0872cbfa82a2c8 esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
import { normalizedPurchases, calculatePurchaseLedger } from "./purchase-ledger.js";
export function cleanTicker(value) {
  return String(value != null ? value : "").trim().toUpperCase().replace(/\.IS$/i, "").replace(/\.E$/i, "").replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
export function cleanSectorName(value) {
  const text = String(value != null ? value : "").replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 64) return null;
  if (/(?:analizler|trade ekranı|terminal araştırma|spl eğitim|giriş yap|ücretsiz kaydol|hisseler\s*\/|al\s*\/\s*sat|karşılaştır|özet rapor)/i.test(text)) return null;
  return text;
}
function specificSectorFromText(value, ticker = "") {
  const name = String(value != null ? value : "").replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
  const key = cleanTicker(ticker);
  if (!name && !key) return null;
  if (/GAYRİMENKUL\s+YATIRIM\s+ORTAK/.test(name) || /(?:GYO|GMYO)$/.test(key)) return "GYO";
  if (/(?:ENERJİ|ELEKTRİK|YENİLENEBİLİR|DOĞAL\s+GAZ|PETROL|AKARYAKIT|GÜNEŞ|RÜZGAR)/.test(name)) return "Enerji";
  if (/(?:GIDA|YİYECEK|İÇECEK|TARIM|SÜT|(?<![\p{L}])UN(?![\p{L}])|ŞEKER|(?<![\p{L}])ET(?![\p{L}])|TAVUK|PİLİÇ|MAKARNA|BAKLİYAT|(?<![\p{L}])YEM(?![\p{L}]))/u.test(name)) return "Gıda";
  if (/(?:BANKA|BANKASI|BANKACILIK)/.test(name)) return "Bankacılık";
  if (/(?:SİGORTA|EMEKLİLİK)/.test(name)) return "Sigorta / Emeklilik";
  if (/(?:FİNANS|FAKTORİNG|FİNANSAL\s+KİRALAMA|MENKUL\s+DEĞERLER|YATIRIM\s+MENKUL)/.test(name)) return "Finans";
  if (/(?:TEKNOLOJİ|YAZILIM|BİLİŞİM|SİBER|ELEKTRONİK|BİLGİSAYAR)/.test(name)) return "Teknoloji";
  if (/(?:SAĞLIK|İLAÇ|HASTANE|TIBBİ|MEDİKAL)/.test(name)) return "Sağlık";
  if (/(?:MADEN|MADENCİLİK)/.test(name)) return "Madencilik";
  if (/(?:İNŞAAT|ÇİMENTO|BETON|YAPI\s+MALZEM)/.test(name)) return "İnşaat / Yapı";
  if (/(?:DEMİR|ÇELİK|METAL|ALÜMİNYUM)/.test(name)) return "Metal";
  if (/(?:TEKSTİL|GİYİM|KONFEKSİYON|DERİ\b)/.test(name)) return "Tekstil";
  if (/(?:OTOMOTİV|MOTORLU\s+ARAÇ|OTOMOBİL)/.test(name)) return "Otomotiv";
  if (/(?:LOJİSTİK|TAŞIMACILIK|ULAŞIM|HAVAYOLLARI|HAVA\s+YOLLARI|KARGO)/.test(name)) return "Ulaştırma / Lojistik";
  if (/(?:TURİZM|OTEL|KONAKLAMA)/.test(name)) return "Turizm";
  if (/(?:TELEKOM|İLETİŞİM)/.test(name)) return "İletişim";
  if (/(?:KİMYA|PETROKİMYA)/.test(name)) return "Kimya";
  if (/(?:HOLDİNG|YATIRIM\s+HOLDİNG)/.test(name)) return "Holding";
  return null;
}
export function inferSectorFromCompany(company, ticker = "") {
  const text = String(company != null ? company : "").replace(/\s+/g, " ").trim();
  const specific = specificSectorFromText(text, ticker);
  if (specific) return specific;
  const name = text.toLocaleUpperCase("tr-TR");
  if (/(?:MAĞAZ|PERAKENDE|MARKET|TİCARET)/.test(name)) return "Perakende";
  return null;
}
export function canonicalSectorName(value) {
  const clean = cleanSectorName(value);
  if (!clean) return null;
  const specific = specificSectorFromText(clean);
  if (specific) return specific;
  const upper = clean.toLocaleUpperCase("tr-TR");
  if (/(?:PERAKENDE|TOPTAN\s+VE\s+PERAKENDE)/.test(upper)) return "Perakende";
  return clean;
}
export function isGenericSectorName(value) {
  const clean = cleanSectorName(value);
  if (!clean) return true;
  const upper = clean.toLocaleUpperCase("tr-TR");
  return /^(?:PERAKENDE|PERAKENDE TİCARET|TOPTAN VE PERAKENDE TİCARET|TİCARET|SANAYİ|HİZMET|HİZMETLER)$/.test(upper);
}
export function profitPct(profit, cost) {
  return Number(cost) > 0 ? Number(profit) / Number(cost) * 100 : 0;
}
export const WITHHOLDING_RATE = 0.175;
function nullableFiniteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function saleWithholding(lots, salePrice, costPrice) {
  const quantity = Number(lots || 0);
  const price = Number(salePrice || 0);
  const cost = Number(costPrice || 0);
  if (!(quantity > 0) || !(price > 0) || !(cost > 0)) return 0;
  return Math.max(0, quantity * (price - cost)) * WITHHOLDING_RATE;
}
export function calculateHolding(holding, { today = null } = {}) {
  var _a, _b, _c;
  const originalPriceValue = nullableFiniteNumber(holding.ipoPrice);
  const originalPrice = originalPriceValue != null && originalPriceValue > 0 ? originalPriceValue : null;
  const ledger = calculatePurchaseLedger({ ...holding, ipoPrice: originalPrice });
  const costBasisKnown = ledger.purchases.length > 0;
  const initialLots = costBasisKnown ? ledger.totalPurchasedLots : Number((_b = (_a = holding.initialLots) != null ? _a : holding.currentLots) != null ? _b : 0);
  const currentLots = costBasisKnown ? ledger.currentLots : Number((_c = holding.currentLots) != null ? _c : 0);
  const averagePurchasePrice = costBasisKnown ? ledger.averagePurchasePrice : originalPrice;
  const ipoPrice = averagePurchasePrice != null ? averagePurchasePrice : originalPrice;
  const positionCost = costBasisKnown ? ledger.positionCost : ipoPrice == null ? null : currentLots * ipoPrice;
  const currentPrice = nullableFiniteNumber(holding.currentPrice);
  const previousClose = nullableFiniteNumber(holding.previousClose);
  const purchases = costBasisKnown ? ledger.purchases : [];
  const sales = costBasisKnown ? ledger.sales : Array.isArray(holding.sales) ? holding.sales : [];
  const invested = costBasisKnown ? ledger.totalPurchaseCost : ipoPrice == null ? null : initialLots * ipoPrice;
  const activeValue = currentLots === 0 ? 0 : currentPrice == null ? null : currentLots * currentPrice;
  const grossSalesProceeds = costBasisKnown ? ledger.grossSalesProceeds : sales.reduce((sum, sale) => sum + Number(sale.lots || 0) * Number(sale.price || 0), 0);
  const grossRealizedProfit = costBasisKnown ? ledger.grossRealizedProfit : ipoPrice == null ? null : sales.reduce((sum, sale) => sum + Number(sale.lots || 0) * (Number(sale.price || 0) - ipoPrice), 0);
  const withholdingTax = costBasisKnown ? ledger.withholdingTax : ipoPrice == null ? 0 : sales.reduce((sum, sale) => {
    var _a2;
    return sum + saleWithholding(sale.lots, sale.price, (_a2 = sale.costPrice) != null ? _a2 : ipoPrice);
  }, 0);
  const salesProceeds = grossSalesProceeds - withholdingTax;
  const realizedProfit = grossRealizedProfit == null ? null : grossRealizedProfit - withholdingTax;
  const unrealizedProfit = currentLots === 0 ? 0 : currentPrice == null || positionCost == null ? null : activeValue - positionCost;
  const totalProfit = realizedProfit == null || unrealizedProfit == null ? null : realizedProfit + unrealizedProfit;
  const totalWealth = activeValue == null ? null : activeValue + salesProceeds;
  const latestMarketDate = holding.latestMarketDate || null;
  const sessionIsToday = !today || latestMarketDate === today;
  const todaySales = today ? sales.filter((sale) => sale.date === today) : [];
  const soldTodayLots = todaySales.reduce((sum, sale) => sum + Number(sale.lots || 0), 0);
  const dailyBaseLots = currentLots + soldTodayLots;
  const saleDayGain = previousClose == null ? null : todaySales.reduce((sum, sale) => sum + Number(sale.lots || 0) * (Number(sale.price || 0) - previousClose), 0);
  const todayWithholdingTax = todaySales.reduce((sum, sale) => {
    var _a2;
    const costPrice = (_a2 = nullableFiniteNumber(sale.costPrice)) != null ? _a2 : ipoPrice;
    return sum + (costPrice == null ? 0 : saleWithholding(sale.lots, sale.price, costPrice));
  }, 0);
  const hasDailyMarketPrices = previousClose != null && (currentLots === 0 || currentPrice != null);
  const dailyProfit = !hasDailyMarketPrices ? null : !sessionIsToday ? 0 : (currentLots === 0 ? 0 : currentLots * (currentPrice - previousClose)) + saleDayGain - todayWithholdingTax;
  const dailyBase = previousClose != null && dailyBaseLots > 0 ? previousClose * dailyBaseLots : 0;
  const dailyPct = dailyProfit == null || !(dailyBase > 0) ? null : !sessionIsToday ? 0 : dailyProfit / dailyBase * 100;
  return {
    ...holding,
    ticker: cleanTicker(holding.ticker),
    initialLots,
    currentLots,
    ipoPrice,
    averagePurchasePrice,
    positionCost,
    purchases,
    currentPrice,
    previousClose,
    latestMarketDate,
    sales,
    invested,
    activeValue,
    grossSalesProceeds,
    withholdingTax,
    salesProceeds,
    totalWealth,
    grossRealizedProfit,
    realizedProfit,
    unrealizedProfit,
    totalProfit,
    totalProfitPct: invested != null && totalProfit != null ? profitPct(totalProfit, invested) : null,
    dailyBaseLots,
    dailyProfit,
    dailyPct,
    dailySessionActive: sessionIsToday
  };
}
export function calculateTotals(holdings) {
  var _a, _b;
  const keys = ["invested", "activeValue", "grossSalesProceeds", "withholdingTax", "salesProceeds", "totalWealth", "totalProfit", "grossRealizedProfit", "realizedProfit", "unrealizedProfit", "dailyProfit"];
  const totals = Object.fromEntries(keys.map((key) => [key, 0]));
  let activePositionCount = 0;
  let missingActiveValueCount = 0;
  let missingDailyValueCount = 0;
  const hasCurrentSession = holdings.some((holding) => {
    var _a2, _b2;
    return Number((_b2 = (_a2 = holding.dailyBaseLots) != null ? _a2 : holding.currentLots) != null ? _b2 : 0) > 0 && holding.dailySessionActive !== false;
  });
  for (const holding of holdings) {
    const active = Number(holding.currentLots || 0) > 0;
    if (hasCurrentSession && Number((_b = (_a = holding.dailyBaseLots) != null ? _a : holding.currentLots) != null ? _b : 0) > 0 && holding.dailySessionActive === false) missingDailyValueCount += 1;
    if (Number(holding.dailyBaseLots || 0) > 0 && holding.dailySessionActive !== false && !Number.isFinite(holding.dailyProfit)) missingDailyValueCount += 1;
    if (active) {
      activePositionCount += 1;
      if (!Number.isFinite(holding.activeValue) || !Number.isFinite(holding.totalWealth) || !Number.isFinite(holding.totalProfit)) {
        missingActiveValueCount += 1;
      }
      if (holding.dailySessionActive !== false && (!Number.isFinite(holding.previousClose) || !Number.isFinite(holding.dailyProfit))) {
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
  totals.totalProfitPct = totals.complete && totals.invested > 0 ? totals.totalProfit / totals.invested * 100 : null;
  const dailyBase = holdings.reduce((sum, holding) => {
    var _a2, _b2, _c, _d;
    if (holding.dailySessionActive === false || !(Number((_b2 = (_a2 = holding.dailyBaseLots) != null ? _a2 : holding.currentLots) != null ? _b2 : 0) > 0)) return sum;
    return sum + (Number.isFinite(holding.previousClose) ? holding.previousClose * Number((_d = (_c = holding.dailyBaseLots) != null ? _c : holding.currentLots) != null ? _d : 0) : 0);
  }, 0);
  totals.dailyPct = totals.dailyComplete && dailyBase > 0 ? totals.dailyProfit / dailyBase * 100 : null;
  if (!totals.complete) {
    totals.activeValue = null;
    totals.totalWealth = null;
    totals.totalProfit = null;
    totals.unrealizedProfit = null;
  }
  if (!totals.dailyComplete) totals.dailyProfit = null;
  return totals;
}
function historyStateOnDate(holding, date) {
  var _a, _b, _c;
  const fullLedger = calculatePurchaseLedger(holding);
  const purchases = fullLedger.purchases;
  const start = ((_a = purchases[0]) == null ? void 0 : _a.date) || holding.firstTradeDate || ((_c = (_b = holding.history) == null ? void 0 : _b[0]) == null ? void 0 : _c.date) || null;
  if (!start || date < start || !purchases.length) return null;
  const rows = Array.isArray(holding.history) ? holding.history : [];
  let close = null;
  for (const row of rows) {
    if (!(row == null ? void 0 : row.date) || row.date > date) break;
    const rowClose = nullableFiniteNumber(row.close);
    if (row.date >= start && rowClose != null) close = rowClose;
  }
  const ledger = calculatePurchaseLedger(holding, { throughDate: date });
  if (close == null && ledger.currentLots > 0) {
    const sameDayPurchase = ledger.purchases.filter((purchase) => purchase.date === date).slice(-1)[0];
    if (sameDayPurchase) close = sameDayPurchase.price;
  }
  if (close == null && ledger.currentLots > 0) return null;
  const capitalAdded = ledger.purchases.filter((purchase) => purchase.date === date).reduce((sum, purchase) => sum + Number(purchase.lots) * Number(purchase.price), 0);
  return {
    value: ledger.currentLots * (close != null ? close : 0) + ledger.salesProceeds,
    cost: ledger.totalPurchaseCost,
    capitalAdded
  };
}
export function makePortfolioHistory(holdings) {
  var _a, _b, _c;
  const dates = /* @__PURE__ */ new Set();
  for (const holding of holdings) {
    const ledger = calculatePurchaseLedger(holding);
    const purchases = ledger.purchases;
    const start = ((_a = purchases[0]) == null ? void 0 : _a.date) || holding.firstTradeDate || ((_c = (_b = holding.history) == null ? void 0 : _b[0]) == null ? void 0 : _c.date);
    if (!start || !purchases.length) continue;
    for (const purchase of purchases) dates.add(purchase.date);
    for (const row of Array.isArray(holding.history) ? holding.history : []) {
      if ((row == null ? void 0 : row.date) && row.date >= start) dates.add(row.date);
    }
    for (const sale of ledger.sales) {
      if (sale.date >= start) dates.add(sale.date);
    }
  }
  const rows = [...dates].sort().map((date) => {
    var _a2, _b2, _c2;
    let value = 0;
    let cost = 0;
    let capitalAdded = 0;
    let complete = true;
    for (const holding of holdings) {
      const state = historyStateOnDate(holding, date);
      if (!state) {
        const purchases = normalizedPurchases(holding);
        const start = ((_a2 = purchases[0]) == null ? void 0 : _a2.date) || holding.firstTradeDate || ((_c2 = (_b2 = holding.history) == null ? void 0 : _b2[0]) == null ? void 0 : _c2.date);
        if (!start || date >= start) complete = false;
        continue;
      }
      value += state.value;
      cost += state.cost;
      capitalAdded += state.capitalAdded;
    }
    const profit = value - cost;
    return { date, value: complete ? value : null, cost, profit: complete ? profit : null, profitPct: complete ? profitPct(profit, cost) : null, capitalAdded, complete };
  }).filter((row) => row.cost > 0);
  let previousValue = 0;
  let previousProfit = 0;
  return rows.map((row, index) => {
    const dailyProfit = row.profit == null || index && previousProfit == null ? null : row.profit - (index ? previousProfit : 0);
    const dailyBase = previousValue + row.capitalAdded;
    const dailyPct = dailyProfit == null || index && previousValue == null ? null : dailyBase > 0 ? dailyProfit / dailyBase * 100 : 0;
    previousValue = row.value;
    previousProfit = row.profit;
    return { ...row, dailyProfit, dailyPct };
  });
}
export function validateSale(holding, lots, price) {
  const saleLots = Number(lots);
  const salePrice = Number(price);
  if (!Number.isInteger(saleLots) || saleLots <= 0 || !Number.isFinite(salePrice) || salePrice <= 0) {
    throw new Error("Satış lotu ve fiyatı geçerli olmalı.");
  }
  if (saleLots > Number(holding.currentLots || 0)) {
    throw new Error("Satış lotu mevcut lottan fazla olamaz.");
  }
  return { lots: saleLots, price: salePrice };
}
