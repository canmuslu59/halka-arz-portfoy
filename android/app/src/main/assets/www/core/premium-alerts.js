const STORAGE_KEY = 'premium_rules_v1';
const STOCK_TYPES = new Set(['price_above','price_below','stock_daily_pct','ceiling','floor']);
const VALUE_TYPES = new Set(['price_above','price_below','stock_daily_pct','portfolio_positive','portfolio_negative']);
const ALL_TYPES = new Set([...STOCK_TYPES, 'portfolio_positive', 'portfolio_negative']);

function cleanTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function validatePremiumRule(rule = {}) {
  const type = String(rule.type || '').trim();
  if (!ALL_TYPES.has(type)) throw new Error('Desteklenmeyen alarm türü.');
  const needsTicker = STOCK_TYPES.has(type);
  const ticker = needsTicker ? cleanTicker(rule.ticker) : null;
  if (needsTicker && ticker.length < 3) throw new Error('Geçerli bir hisse kodu gerekli.');

  let value = null;
  if (VALUE_TYPES.has(type)) {
    value = positiveNumber(rule.value);
    if (value == null) {
      if (type === 'price_above' || type === 'price_below') throw new Error('Hedef fiyat sıfırdan büyük olmalı.');
      throw new Error('Alarm yüzde değeri sıfırdan büyük olmalı.');
    }
  }

  return {
    id:rule.id ? String(rule.id) : null,
    type,
    ticker,
    value,
    enabled:rule.enabled !== false,
    createdAt:Number.isFinite(Number(rule.createdAt)) ? Number(rule.createdAt) : null,
  };
}

function readRules(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(rule => {
      try { return validatePremiumRule(rule); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function createPremiumRuleStore(storage, { now = () => Date.now() } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('Premium alarm saklama alanı gerekli.');
  }

  let sequence = 0;
  const write = rules => storage.setItem(STORAGE_KEY, JSON.stringify(rules));

  function list() {
    return readRules(storage);
  }

  function upsert(input) {
    const normalized = validatePremiumRule(input);
    const rules = list();
    const id = normalized.id || `pr_${now()}_${++sequence}`;
    const next = { ...normalized, id, createdAt:normalized.createdAt || now() };
    const index = rules.findIndex(rule => rule.id === id);
    if (index >= 0) rules[index] = next;
    else rules.push(next);
    write(rules);
    return next;
  }

  function setEnabled(id, enabled) {
    const rules = list();
    const index = rules.findIndex(rule => rule.id === String(id));
    if (index < 0) return false;
    rules[index] = { ...rules[index], enabled:Boolean(enabled) };
    write(rules);
    return true;
  }

  function remove(id) {
    const before = list();
    const after = before.filter(rule => rule.id !== String(id));
    if (after.length === before.length) return false;
    write(after);
    return true;
  }

  return { list, upsert, setEnabled, remove, storageKey:STORAGE_KEY };
}

function holdingByTicker(holdings, ticker) {
  return (Array.isArray(holdings) ? holdings : []).find(item => cleanTicker(item?.ticker) === ticker) || null;
}

export function evaluatePremiumRules(context = {}, rules = []) {
  const portfolioDailyPct = Number(context.portfolioDailyPct || 0);
  const events = [];

  for (const input of Array.isArray(rules) ? rules : []) {
    let rule;
    try { rule = validatePremiumRule(input); } catch { continue; }
    if (!rule.enabled || !rule.id) continue;
    const holding = rule.ticker ? holdingByTicker(context.holdings, rule.ticker) : null;
    let matched = false;
    let actual = null;

    if (rule.type === 'portfolio_positive') {
      actual = portfolioDailyPct;
      matched = portfolioDailyPct >= rule.value;
    } else if (rule.type === 'portfolio_negative') {
      actual = portfolioDailyPct;
      matched = portfolioDailyPct <= -rule.value;
    } else if (!holding) {
      matched = false;
    } else if (rule.type === 'price_above') {
      actual = Number(holding.currentPrice);
      matched = Number.isFinite(actual) && actual >= rule.value;
    } else if (rule.type === 'price_below') {
      actual = Number(holding.currentPrice);
      matched = Number.isFinite(actual) && actual <= rule.value;
    } else if (rule.type === 'stock_daily_pct') {
      actual = Number(holding.dailyPct);
      matched = Number.isFinite(actual) && Math.abs(actual) >= rule.value;
    } else if (rule.type === 'ceiling') {
      const price = Number(holding.currentPrice);
      const ceiling = Number(holding.ceiling);
      actual = price;
      matched = holding.referenceVerified === true && Number.isFinite(price) && Number.isFinite(ceiling) && price >= ceiling;
    } else if (rule.type === 'floor') {
      const price = Number(holding.currentPrice);
      const floor = Number(holding.floor);
      actual = price;
      matched = holding.referenceVerified === true && Number.isFinite(price) && Number.isFinite(floor) && price <= floor;
    }

    if (matched) events.push({ ruleId:rule.id, type:rule.type, ticker:rule.ticker, target:rule.value, actual });
  }
  return events;
}
