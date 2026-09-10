import { evaluateRegistrationAlerts, notificationForAlert } from './alert-engine.js';

function cleanTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function clampThreshold(value) {
  const n = Number(value);
  const finite = Number.isFinite(n) ? n : 3;
  return Math.round(Math.min(10, Math.max(1, finite)) * 2) / 2;
}

function cleanHoldings(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value) {
    const ticker = cleanTicker(item?.ticker);
    const lots = Number(item?.lots);
    if (!ticker || !Number.isFinite(lots) || lots <= 0 || seen.has(ticker)) continue;
    seen.add(ticker);
    result.push({ ticker, lots });
  }
  return result;
}

function dateInIstanbul(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function freshAlertState(day) {
  return { day, stocks: {}, portfolio: [], limits: {} };
}

function deliveredStateAfter(previousState, day, event) {
  const state = previousState?.day === day
    ? structuredClone(previousState)
    : freshAlertState(day);
  state.stocks ||= {};
  state.portfolio = Array.isArray(state.portfolio) ? state.portfolio : [];
  state.limits ||= {};

  if (event.kind === 'portfolio') {
    if (!state.portfolio.some(level => String(level) === String(event.level))) {
      state.portfolio.push(event.level);
    }
    return state;
  }

  if (event.kind === 'ceiling' || event.kind === 'floor') {
    const ticker = cleanTicker(event.ticker);
    if (!ticker) return state;
    state.limits[ticker] = { ...(state.limits[ticker] || {}), [event.kind]: true };
  }
  return state;
}

function offeringIdentity(item = {}) {
  const ticker = cleanTicker(item.ticker || item.symbol || item.code);
  if (!ticker) return '';
  const period = String(
    item.offeringPeriod
      || item.demandPeriod
      || item.subscriptionPeriod
      || item.dates
      || item.dateRange
      || item.requestDates
      || '',
  ).trim();
  return period ? `${ticker}|${period}` : ticker;
}

function ipoMessage(item = {}) {
  const ticker = cleanTicker(item.ticker || item.symbol || item.code);
  const company = String(item.company || item.name || ticker).trim();
  return {
    title: 'Yeni halka arz',
    body: `${company}${ticker && !company.includes(ticker) ? ` (${ticker})` : ''} takvime eklendi.`,
    data: { kind: 'ipo', ticker },
  };
}

export function createPushService({ store, sender, dataSources = {}, now = () => new Date() } = {}) {
  if (!store || typeof store.read !== 'function' || typeof store.mutate !== 'function') {
    throw new TypeError('Push service requires a readable and mutable store.');
  }
  if (!sender || typeof sender.send !== 'function') {
    throw new TypeError('Push service requires a sender.');
  }

  async function register(payload = {}) {
    const installId = String(payload.installId || '').trim();
    const fcmToken = String(payload.fcmToken || '').trim();
    if (!installId || !fcmToken) throw new Error('installId and fcmToken are required.');

    const config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    const stamp = now().toISOString();
    return store.mutate(state => {
      state.installations ||= {};
      const previous = state.installations[installId] || {};
      const next = {
        ...previous,
        installId,
        fcmToken,
        enabled: config.enabled !== false,
        threshold: clampThreshold(config.threshold),
        ipoEnabled: config.ipoEnabled !== false,
        holdings: cleanHoldings(config.holdings),
        alertState: previous.alertState ?? null,
        ipoState: previous.ipoState ?? null,
        createdAt: previous.createdAt || stamp,
        updatedAt: stamp,
      };
      state.installations[installId] = next;
      return structuredClone(next);
    });
  }

  async function marketCheck() {
    const snapshot = await store.read();
    const registrations = Object.values(snapshot?.installations || {})
      .filter(item => item && item.enabled !== false && Array.isArray(item.holdings) && item.holdings.length > 0);

    const tickers = new Set();
    for (const registration of registrations) {
      for (const holding of registration.holdings) {
        const ticker = cleanTicker(holding?.ticker);
        if (ticker) tickers.add(ticker);
      }
    }

    const quotes = new Map();
    if (typeof dataSources.getQuote === 'function') {
      await Promise.all([...tickers].map(async ticker => {
        try {
          const quote = await dataSources.getQuote(ticker);
          if (quote) quotes.set(ticker, quote);
        } catch {
          // A single quote source failure must not prevent other registrations from being checked.
        }
      }));
    }

    const day = dateInIstanbul(now());
    let sent = 0;
    let failed = 0;

    for (const registration of registrations) {
      const evaluated = evaluateRegistrationAlerts({ registration, quotes, day });
      let delivered = registration.alertState ?? null;
      let changed = false;

      for (const event of evaluated.events) {
        try {
          await sender.send(registration.fcmToken, notificationForAlert(event));
          delivered = deliveredStateAfter(delivered, day, event);
          changed = true;
          sent += 1;
        } catch {
          failed += 1;
        }
      }

      if (changed) {
        await store.mutate(state => {
          const current = state.installations?.[registration.installId];
          if (current) {
            current.alertState = delivered;
            current.updatedAt = now().toISOString();
          }
        });
      }
    }

    return { sent, failed };
  }

  async function ipoCheck() {
    if (typeof dataSources.getIpoCalendar !== 'function') return { sent: 0, failed: 0 };

    let calendar;
    try {
      calendar = await dataSources.getIpoCalendar();
    } catch {
      return { sent: 0, failed: 1 };
    }
    const items = Array.isArray(calendar) ? calendar : [];
    const current = items
      .map(item => ({ item, key: offeringIdentity(item) }))
      .filter(entry => entry.key);

    const snapshot = await store.read();
    const registrations = Object.values(snapshot?.installations || {})
      .filter(item => item && item.ipoEnabled !== false);
    let sent = 0;
    let failed = 0;

    for (const registration of registrations) {
      const previous = registration.ipoState;
      if (!previous?.initialized) {
        await store.mutate(state => {
          const target = state.installations?.[registration.installId];
          if (target) {
            target.ipoState = { initialized: true, seen: current.map(entry => entry.key) };
            target.updatedAt = now().toISOString();
          }
        });
        continue;
      }

      const seen = new Set(Array.isArray(previous.seen) ? previous.seen.map(String) : []);
      let changed = false;
      for (const entry of current) {
        if (seen.has(entry.key)) continue;
        try {
          await sender.send(registration.fcmToken, ipoMessage(entry.item));
          seen.add(entry.key);
          sent += 1;
          changed = true;
        } catch {
          failed += 1;
        }
      }

      if (changed) {
        await store.mutate(state => {
          const target = state.installations?.[registration.installId];
          if (target) {
            target.ipoState = { initialized: true, seen: [...seen] };
            target.updatedAt = now().toISOString();
          }
        });
      }
    }

    return { sent, failed };
  }

  return { register, marketCheck, ipoCheck };
}