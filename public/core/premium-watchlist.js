const STORAGE_KEY = 'premium_watchlist_v1';

function cleanTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalize(values) {
  const out = [];
  for (const item of Array.isArray(values) ? values : []) {
    const ticker = cleanTicker(item);
    if (ticker.length < 3 || out.includes(ticker)) continue;
    out.push(ticker);
  }
  return out;
}

export function createWatchlistStore(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('Premium takip listesi için saklama alanı gerekli.');
  }

  function all() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : []);
    } catch {
      return [];
    }
  }

  function write(values) {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalize(values)));
  }

  function has(value) {
    const ticker = cleanTicker(value);
    return ticker.length >= 3 && all().includes(ticker);
  }

  function add(value) {
    const ticker = cleanTicker(value);
    if (ticker.length < 3) return false;
    const values = all();
    if (values.includes(ticker)) return false;
    values.push(ticker);
    write(values);
    return true;
  }

  function remove(value) {
    const ticker = cleanTicker(value);
    const before = all();
    const after = before.filter(item => item !== ticker);
    if (after.length === before.length) return false;
    write(after);
    return true;
  }

  function toggle(value) {
    const ticker = cleanTicker(value);
    if (ticker.length < 3) return false;
    if (has(ticker)) {
      remove(ticker);
      return false;
    }
    add(ticker);
    return true;
  }

  return { all, has, add, remove, toggle, storageKey:STORAGE_KEY };
}
