const TYPES = new Set(['BUY', 'SELL', 'DIVIDEND', 'SPLIT', 'FEE']);
const TICKER = /^[A-Z0-9]{2,8}$/;

const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
function moneyNumber(value, label, { zero = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || (zero ? number < 0 : number <= 0) || number > 1e12) {
    throw new Error(label + ' geçerli bir pozitif sayı olmalı.');
  }
  return number;
}
function units(value, label) {
  const number = moneyNumber(value, label);
  if (!Number.isSafeInteger(number) || number > 100000000) throw new Error(label + ' tam lot sayısı olmalı.');
  return number;
}
export function validateJournalRow(row) {
  if (!row || typeof row !== 'object') throw new Error('İşlem kaydı geçersiz.');
  const ticker = String(row.ticker || '').trim().toUpperCase();
  const type = String(row.type || '').toUpperCase();
  const date = String(row.date || '');
  if (!TICKER.test(ticker)) throw new Error('Hisse kodu 2–8 karakter olmalı.');
  if (!TYPES.has(type)) throw new Error('Bilinmeyen işlem türü.');
  if (!validDate(date)) throw new Error('İşlem tarihi geçersiz.');
  const normalized = {
    id: String(row.id || '').slice(0, 80),
    ticker,
    type,
    date,
    note: String(row.note || '').slice(0, 200),
    lots: 0,
    price: 0,
    amount: 0,
    numerator: 0,
    denominator: 0,
    fee: 0,
  };
  if (type === 'BUY' || type === 'SELL') {
    normalized.lots = units(row.lots, 'Lot');
    normalized.price = moneyNumber(row.price, 'Fiyat');
    normalized.fee = moneyNumber(row.fee || 0, 'Komisyon', { zero:true });
  }
  if (type === 'DIVIDEND' || type === 'FEE') normalized.amount = moneyNumber(row.amount, 'Tutar');
  if (type === 'SPLIT') {
    normalized.numerator = units(row.numerator, 'Yeni pay');
    normalized.denominator = units(row.denominator, 'Eski pay');
  }
  return normalized;
}
export function normalizeJournal(value) {
  if (!Array.isArray(value) || value.length > 5000) throw new Error('İşlem defteri sınırı aşıldı.');
  const ids = new Set();
  return value.map(row => {
    const item = validateJournalRow(row);
    if (!item.id || ids.has(item.id)) throw new Error('Tekrarlı veya boş işlem kimliği var.');
    ids.add(item.id);
    return item;
  });
}

/**
 * Average-cost bookkeeping simulator. No taxes are inferred, no transactions
 * are sent to a broker, and results never mutate the legacy IPO portfolio.
 */
export function calculateJournal(value) {
  const rows = normalizeJournal(value).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const stocks = new Map();
  for (const tx of rows) {
    const pos = stocks.get(tx.ticker) || {
      ticker:tx.ticker, lots:0, bookCost:0, grossProceeds:0,
      cashFlow:0, realized:0, dividends:0, fees:0, trades:0,
    };
    if (tx.type === 'BUY') {
      const total = tx.lots * tx.price + tx.fee;
      pos.lots += tx.lots;
      pos.bookCost += total;
      pos.cashFlow -= total;
      pos.fees += tx.fee;
      pos.trades++;
    } else if (tx.type === 'SELL') {
      if (tx.lots > pos.lots) throw new Error(tx.ticker + ' için eldeki lottan fazla satış var (' + tx.date + ').');
      const unitCost = pos.lots > 0 ? pos.bookCost / pos.lots : 0;
      const soldBasis = unitCost * tx.lots;
      const proceeds = tx.lots * tx.price - tx.fee;
      pos.bookCost = Math.max(0, pos.bookCost - soldBasis);
      pos.lots -= tx.lots;
      if (pos.lots === 0) pos.bookCost = 0;
      pos.realized += proceeds - soldBasis;
      pos.cashFlow += proceeds;
      pos.grossProceeds += tx.lots * tx.price;
      pos.fees += tx.fee;
      pos.trades++;
    } else if (tx.type === 'DIVIDEND') {
      pos.dividends += tx.amount;
      pos.realized += tx.amount;
      pos.cashFlow += tx.amount;
    } else if (tx.type === 'FEE') {
      pos.fees += tx.amount;
      pos.realized -= tx.amount;
      pos.cashFlow -= tx.amount;
    } else if (tx.type === 'SPLIT') {
      if (pos.lots <= 0) throw new Error(tx.ticker + ' bölünmesi için açık pozisyon yok.');
      const newLots = pos.lots * tx.numerator / tx.denominator;
      if (!Number.isSafeInteger(newLots) || newLots <= 0) {
        throw new Error(tx.ticker + ' bölünmesi küsuratlı pay oluşturuyor; işlem manuel düzeltilmeli.');
      }
      pos.lots = newLots;
    }
    stocks.set(tx.ticker, pos);
  }
  const positions = [...stocks.values()].map(pos => ({
    ...pos, averageCost:pos.lots > 0 ? pos.bookCost / pos.lots : 0,
  })).sort((a,b)=>a.ticker.localeCompare(b.ticker));
  const totals = positions.reduce((acc,p) => {
    for (const key of ['bookCost','cashFlow','realized','dividends','fees']) acc[key] += p[key];
    return acc;
  }, {bookCost:0,cashFlow:0,realized:0,dividends:0,fees:0});
  return { positions, totals, count:rows.length };
}
export const LAB_LEDGER_STORAGE_KEY = 'portfolio_management_lab_ledger_v1';
