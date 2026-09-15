export const PREMIUM_BACKUP_SCHEMA_VERSION = 1;

function cleanTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeWatchlist(value) {
  const out = [];
  for (const item of Array.isArray(value) ? value : []) {
    const ticker = cleanTicker(item);
    if (ticker.length < 3 || out.includes(ticker)) continue;
    out.push(ticker);
  }
  return out;
}

function portableSettings(settings) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const out = {};
  if (source.themePreference === 'dark' || source.themePreference === 'light') out.themePreference = source.themePreference;
  if (typeof source.holdingSort === 'string' && source.holdingSort) out.holdingSort = source.holdingSort;
  return out;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBackupPayload(data = {}, { now = () => Date.now() } = {}) {
  const portfolio = data.portfolio && typeof data.portfolio === 'object' && !Array.isArray(data.portfolio)
    ? cloneJson(data.portfolio)
    : { holdings:[] };
  if (!Array.isArray(portfolio.holdings)) portfolio.holdings = [];

  return {
    schemaVersion:PREMIUM_BACKUP_SCHEMA_VERSION,
    exportedAt:new Date(now()).toISOString(),
    portfolio,
    settings:portableSettings(data.settings),
    premiumRules:Array.isArray(data.premiumRules) ? cloneJson(data.premiumRules) : [],
    watchlist:normalizeWatchlist(data.watchlist),
  };
}

export function serializeBackupPayload(data = {}, options = {}) {
  return JSON.stringify(createBackupPayload(data, options), null, 2);
}

function validateParsedPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Geçersiz veya bozuk yedek dosyası.');
  if (payload.schemaVersion !== PREMIUM_BACKUP_SCHEMA_VERSION) throw new Error('Desteklenmeyen yedek sürümü.');
  if (typeof payload.exportedAt !== 'string' || Number.isNaN(new Date(payload.exportedAt).getTime())) throw new Error('Geçersiz yedek tarihi.');
  if (!payload.portfolio || typeof payload.portfolio !== 'object' || Array.isArray(payload.portfolio) || !Array.isArray(payload.portfolio.holdings)) throw new Error('Yedek portföy verisi geçersiz.');
  if (!payload.settings || typeof payload.settings !== 'object' || Array.isArray(payload.settings)) throw new Error('Yedek ayar verisi geçersiz.');
  if (!Array.isArray(payload.premiumRules)) throw new Error('Yedek alarm verisi geçersiz.');
  if (!Array.isArray(payload.watchlist)) throw new Error('Yedek takip listesi geçersiz.');

  return {
    schemaVersion:PREMIUM_BACKUP_SCHEMA_VERSION,
    exportedAt:payload.exportedAt,
    portfolio:cloneJson(payload.portfolio),
    settings:portableSettings(payload.settings),
    premiumRules:cloneJson(payload.premiumRules),
    watchlist:normalizeWatchlist(payload.watchlist),
  };
}

export function parseBackupPayload(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    throw new Error('Geçersiz veya bozuk yedek dosyası.');
  }
  return validateParsedPayload(parsed);
}
