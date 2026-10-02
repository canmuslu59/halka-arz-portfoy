// Portföy yedeği oluşturma ve doğrulama. Saf fonksiyonlar; depolamaya
// yazmadan önce yedeğin bütünüyle geçerli olduğu burada garanti edilir.

export const BACKUP_FORMAT = 'portfoy-yonetimi-yedek';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_HOLDINGS = 500;
export const BACKUP_SETTINGS_KEYS = Object.freeze([
  'alertEnabled',
  'alertThreshold',
  'themePreference',
  'holdingSort',
  'labs_privacy_mode_v1',
  'labs_news_sources_v1',
  'labs_news_filter_v1',
  'labs_news_saved_v1',
]);

const TICKER_PATTERN = /^[A-Z0-9]{2,8}$/;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createBackupPayload({ portfolio, settings = {}, appVersion = '', now = new Date() } = {}) {
  const safePortfolio = plainObject(portfolio) ? portfolio : { holdings:[] };
  const cleanSettings = {};
  for (const key of BACKUP_SETTINGS_KEYS) {
    if (typeof settings?.[key] === 'string') cleanSettings[key] = settings[key];
  }
  return {
    format:BACKUP_FORMAT,
    version:BACKUP_VERSION,
    exportedAt:(now instanceof Date ? now : new Date(now)).toISOString(),
    app:{ name:'Hisse Portföyüm', version:String(appVersion || '') },
    portfolio:{ ...safePortfolio, holdings:Array.isArray(safePortfolio.holdings) ? safePortfolio.holdings : [] },
    settings:cleanSettings,
  };
}

export function parseBackupText(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? '').replace(/^﻿/, ''));
  } catch {
    throw new Error('Seçilen dosya geçerli bir portföy yedeği değil.');
  }
  if (!plainObject(data)) throw new Error('Seçilen dosya geçerli bir portföy yedeği değil.');

  let portfolio;
  let settings = {};
  let exportedAt = null;
  if (data.format === BACKUP_FORMAT) {
    if (Number(data.version) > BACKUP_VERSION) throw new Error('Bu yedek daha yeni bir uygulama sürümüyle oluşturulmuş.');
    portfolio = data.portfolio;
    settings = plainObject(data.settings) ? data.settings : {};
    const stamp = Date.parse(String(data.exportedAt || ''));
    exportedAt = Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
  } else if (Array.isArray(data.holdings)) {
    // Uygulamanın ham portföy kaydı (ör. ileride Play sürümünden dışa aktarım).
    portfolio = data;
  } else {
    throw new Error('Dosyada portföy verisi bulunamadı.');
  }

  if (!plainObject(portfolio) || !Array.isArray(portfolio.holdings)) throw new Error('Yedekteki portföy verisi bozuk.');
  if (portfolio.holdings.length > MAX_BACKUP_HOLDINGS) throw new Error('Yedekte beklenenden fazla hisse kaydı var.');
  const tickers = [];
  for (const holding of portfolio.holdings) {
    const ticker = String(holding?.ticker ?? '').trim().toUpperCase();
    if (!plainObject(holding) || !TICKER_PATTERN.test(ticker)) throw new Error('Yedekte geçersiz hisse kaydı var; geri yükleme yapılmadı.');
    tickers.push(ticker);
  }

  const cleanSettings = {};
  for (const key of BACKUP_SETTINGS_KEYS) {
    const value = settings[key];
    if (typeof value === 'string' && value.length <= 200_000) cleanSettings[key] = value;
  }

  return { portfolio, settings:cleanSettings, exportedAt, tickers };
}
