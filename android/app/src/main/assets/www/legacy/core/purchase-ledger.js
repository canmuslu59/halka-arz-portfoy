// legacy-webview source=core/purchase-ledger.js blob=67bf8395f5757cd531166da7164e1347f12104d4 esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function isoDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
function compareEvents(a, b) {
  const dateOrder = String(a.date).localeCompare(String(b.date));
  if (dateOrder) return dateOrder;
  const stampOrder = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  if (stampOrder) return stampOrder;
  if (a.kind === b.kind) return Number(a.order || 0) - Number(b.order || 0);
  return a.kind === "buy" ? -1 : 1;
}
export function normalizedPurchases(holding = {}) {
  var _a, _b, _c;
  const explicit = (Array.isArray(holding.purchases) ? holding.purchases : []).map((purchase, order) => ({
    ...purchase,
    lots: Number((purchase == null ? void 0 : purchase.lots) || 0),
    price: positiveNumber(purchase == null ? void 0 : purchase.price),
    date: isoDate(purchase == null ? void 0 : purchase.date),
    createdAt: (purchase == null ? void 0 : purchase.createdAt) || null,
    order
  })).filter((purchase) => Number.isInteger(purchase.lots) && purchase.lots > 0 && purchase.price != null && purchase.date).sort(compareEvents);
  if (explicit.length) return explicit;
  const lots = Number((_b = (_a = holding.initialLots) != null ? _a : holding.currentLots) != null ? _b : 0);
  const price = positiveNumber(holding.ipoPrice);
  const date = isoDate(holding.firstTradeDate) || isoDate(Array.isArray(holding.history) ? (_c = holding.history[0]) == null ? void 0 : _c.date : null) || isoDate(holding.addedAt);
  if (!Number.isInteger(lots) || lots <= 0 || price == null || !date) return [];
  return [{
    id: "legacy-" + String(holding.id || holding.ticker || "holding"),
    lots,
    price,
    date,
    createdAt: holding.addedAt || date + "T00:00:00.000Z",
    legacy: true,
    order: 0
  }];
}
function normalizedSales(holding = {}) {
  return (Array.isArray(holding.sales) ? holding.sales : []).map((sale, order) => ({
    ...sale,
    lots: Number((sale == null ? void 0 : sale.lots) || 0),
    price: positiveNumber(sale == null ? void 0 : sale.price),
    costPrice: positiveNumber(sale == null ? void 0 : sale.costPrice),
    date: isoDate(sale == null ? void 0 : sale.date),
    createdAt: (sale == null ? void 0 : sale.createdAt) || null,
    order
  })).filter((sale) => Number.isInteger(sale.lots) && sale.lots > 0 && sale.price != null && sale.date).sort(compareEvents);
}
export function calculatePurchaseLedger(holding = {}, { throughDate = null } = {}) {
  var _a;
  const limit = isoDate(throughDate);
  const purchases = normalizedPurchases(holding);
  const sales = normalizedSales(holding);
  const events = [
    ...purchases.map((purchase, order) => ({ ...purchase, kind: "buy", order })),
    ...sales.map((sale, order) => ({ ...sale, kind: "sell", order }))
  ].filter((event) => !limit || event.date <= limit).sort(compareEvents);
  let activeLots = 0;
  let activeCost = 0;
  let totalPurchasedLots = 0;
  let totalPurchaseCost = 0;
  let grossSalesProceeds = 0;
  let grossRealizedProfit = 0;
  let withholdingTax = 0;
  let lastAveragePurchasePrice = null;
  const enrichedSales = [];
  for (const event of events) {
    if (event.kind === "buy") {
      const cost = event.lots * event.price;
      activeLots += event.lots;
      activeCost += cost;
      totalPurchasedLots += event.lots;
      totalPurchaseCost += cost;
      lastAveragePurchasePrice = activeLots > 0 ? activeCost / activeLots : lastAveragePurchasePrice;
      continue;
    }
    const availableAverage = activeLots > 0 ? activeCost / activeLots : lastAveragePurchasePrice;
    const costPrice = (_a = event.costPrice) != null ? _a : availableAverage;
    const removableLots = Math.min(event.lots, Math.max(0, activeLots));
    const removedCost = costPrice == null ? 0 : removableLots * costPrice;
    activeLots = Math.max(0, activeLots - removableLots);
    activeCost = Math.max(0, activeCost - removedCost);
    if (activeLots === 0 && activeCost < 1e-7) activeCost = 0;
    if (activeLots > 0) lastAveragePurchasePrice = activeCost / activeLots;
    else if (costPrice != null) lastAveragePurchasePrice = costPrice;
    const proceeds = event.lots * event.price;
    const realized = costPrice == null ? 0 : event.lots * (event.price - costPrice);
    const tax = costPrice == null ? 0 : Math.max(0, realized) * 0.175;
    grossSalesProceeds += proceeds;
    grossRealizedProfit += realized;
    withholdingTax += tax;
    enrichedSales.push({ ...event, costPrice });
  }
  const averagePurchasePrice = activeLots > 0 ? activeCost / activeLots : lastAveragePurchasePrice;
  return {
    purchases: purchases.filter((purchase) => !limit || purchase.date <= limit),
    sales: enrichedSales,
    currentLots: activeLots,
    positionCost: activeCost,
    averagePurchasePrice,
    totalPurchasedLots,
    totalPurchaseCost,
    grossSalesProceeds,
    grossRealizedProfit,
    withholdingTax,
    salesProceeds: grossSalesProceeds - withholdingTax,
    realizedProfit: grossRealizedProfit - withholdingTax
  };
}
