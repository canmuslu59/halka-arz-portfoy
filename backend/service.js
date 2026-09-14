import { evaluateRegistrationAlerts, notificationForAlert } from './alert-engine.js';

function cleanTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function clampThreshold(value) {
  const n = Number(value);
  const finite = Number.isFinite(n) ? n : 3;
  return Math.round(Math.min(10, Math.max(1, finite)) * 2) / 2;
}

function cleanSales(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-32).map(sale => {
    const date = String(sale?.date || '').trim();
    const lots = Number(sale?.lots);
    const price = Number(sale?.price);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(lots > 0) || !(price > 0)) return null;
    return { date, lots, price };
  }).filter(Boolean);
}

function cleanHoldings(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value.slice(0, 100)) {
    const ticker = cleanTicker(item?.ticker);
    const lotsValue = Number(item?.lots);
    const lots = Number.isFinite(lotsValue) ? Math.max(0, lotsValue) : 0;
    const ipoValue = Number(item?.ipoPrice);
    const ipoPrice = Number.isFinite(ipoValue) && ipoValue > 0 ? ipoValue : 0;
    const sales = cleanSales(item?.sales);
    if (!ticker || (lots <= 0 && sales.length === 0) || seen.has(ticker)) continue;
    seen.add(ticker);
    const clean = { ticker, lots };
    if (ipoPrice > 0) clean.ipoPrice = ipoPrice;
    if (sales.length > 0) clean.sales = sales;
    result.push(clean);
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

function normalizedBudget(value) {
  if (value === Infinity) return Infinity;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : Infinity;
}

function rotatedSlice(values, limit, cursorValue) {
  if (!Number.isFinite(limit)) return { items:[...values], nextCursor:0 };
  if (!values.length || limit <= 0) return { items:[], nextCursor:0 };
  const count = Math.min(limit, values.length);
  const rawCursor = Number(cursorValue);
  const start = Number.isFinite(rawCursor) ? Math.max(0, Math.floor(rawCursor)) % values.length : 0;
  const items = Array.from({ length:count }, (_, index) => values[(start + index) % values.length]);
  return { items, nextCursor:(start + count) % values.length };
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
      || item.offerDates
      || item.dates
      || item.dateRange
      || item.requestDates
      || '',
  ).trim();
  return period ? `${ticker}|${period}` : ticker;
}

function permanentTokenFailure(error) {
  return error?.permanentToken === true || error?.code === 'FCM_TOKEN_INVALID';
}

function permanentTokenFailure(error) {
  return error?.permanentToken === true || error?.code === 'FCM_TOKEN_INVALID';
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

  async function marketCheck({ maxUniqueTickers = Infinity, maxNotifications = Infinity } = {}) {
    const quoteBudget = normalizedBudget(maxUniqueTickers);
    const notificationBudget = normalizedBudget(maxNotifications);
    const snapshot = await store.read();
    const registrations = Object.values(snapshot?.installations || {})
      .filter(item => item && item.enabled !== false && Array.isArray(item.holdings) && item.holdings.length > 0);

    const tickerSet = new Set();
    for (const registration of registrations) {
      for (const holding of registration.holdings) {
        const ticker = cleanTicker(holding?.ticker);
        if (ticker) tickerSet.add(ticker);
      }
    }

    const allTickers = [...tickerSet];
    const selection = rotatedSlice(allTickers, quoteBudget, snapshot?.marketTickerCursor);
    const checkedTickerList = selection.items;
    const tickerBudgetReached = checkedTickerList.length < allTickers.length;
    if (tickerBudgetReached && checkedTickerList.length > 0) {
      await store.mutate(state => {
        state.marketTickerCursor = selection.nextCursor;
      });
    }

    const quotes = new Map();
    if (typeof dataSources.getQuote === 'function') {
      await Promise.all(checkedTickerList.map(async ticker => {
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
    let notificationAttempts = 0;
    let notificationBudgetReached = false;

    for (const registration of registrations) {
      const evaluated = evaluateRegistrationAlerts({ registration, quotes, day });
      let delivered = registration.alertState ?? null;
      let changed = false;
      let invalidRegistration = false;

      for (const event of evaluated.events) {
        if (notificationAttempts >= notificationBudget) {
          notificationBudgetReached = true;
          break;
        }
        notificationAttempts += 1;
        try {
          await sender.send(registration.fcmToken, notificationForAlert(event));
          delivered = deliveredStateAfter(delivered, day, event);
          changed = true;
          sent += 1;
        } catch (error) {
          failed += 1;
          if (permanentTokenFailure(error)) {
            notificationAttempts = Math.max(0, notificationAttempts - 1);
            invalidRegistration = true;
            await store.mutate(state => {
              if (state.installations) delete state.installations[registration.installId];
            });
            break;
          }
        }
      }

      if (invalidRegistration) {
        notificationBudgetReached = false;
        continue;
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

      if (notificationBudgetReached) break;
    }

    const partial = tickerBudgetReached || notificationBudgetReached;
    const reason = notificationBudgetReached
      ? 'notification_budget'
      : tickerBudgetReached
        ? 'ticker_budget'
        : null;
    return {
      sent,
      failed,
      partial,
      reason,
      totalTickers:allTickers.length,
      checkedTickers:checkedTickerList.length,
      notificationAttempts,
    };
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
