import { createPushService } from '../backend/service.js';
import { getBistMarketStatus } from '../public/core/market-calendar.js';
import { PushStateDurableObject, createDurableStore } from './durable-store.js';
import { createCloudflareFcmSender } from './fcm-sender.js';
import { fetchVerifiedMarketQuote } from './market-quote.js';
import { fetchCloudflareIpoCalendar } from './ipo-calendar.js';
import { createNewsNotificationEngine } from './news-notifications.js';

export { PushStateDurableObject };

const POLL_INTERVAL_MS = 120_000;
const ANDROID_FALLBACK_MINUTES = 15;
const MAX_UNIQUE_TICKERS = 30;
const MAX_NOTIFICATIONS = 15;
const MAX_BODY_BYTES = 128 * 1024;

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
    },
  });
}

function statusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function readJson(request) {
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) throw statusError('İstek çok büyük.', 413);
  if (body.byteLength === 0) return {};
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw statusError('Geçersiz JSON gövdesi.', 400);
  }
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function newsNotificationsEnabled(env = {}) {
  return String(env.NEWS_NOTIFICATIONS_ENABLED || '').toLowerCase() === 'true'
    && /^https:\/\//i.test(String(env.NEWS_FEED_URL || ''));
}

async function fetchNewsFeed(env = {}) {
  const response = await fetch(String(env.NEWS_FEED_URL || ''), {
    headers:{ accept:'application/json', 'user-agent':'HalkaArzPortfoyum-NewsPush/1.0' },
  });
  if (!response.ok) throw new Error(`News feed failed (${response.status}).`);
  const body = await response.json();
  return Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [];
}

async function runNewsNotifications({ env, store, sender, date }) {
  if (!newsNotificationsEnabled(env)) return { status:'disabled' };
  try {
    const engine = createNewsNotificationEngine({
      store,
      sender,
      fetchNews:() => fetchNewsFeed(env),
      now:() => date,
    });
    return { status:'checked', ...(await engine.check()) };
  } catch (error) {
    return { status:'error', error:String(error?.message || error) };
  }
}

export function createWorkerApp({
  createStore = env => createDurableStore(env.PUSH_STATE),
  createSender = env => createCloudflareFcmSender({ serviceAccountJson:env.FIREBASE_SERVICE_ACCOUNT_JSON }),
  fetchQuote = ticker => fetchVerifiedMarketQuote(ticker),
  fetchIpoCalendar = () => fetchCloudflareIpoCalendar(),
  marketStatus = getBistMarketStatus,
  now = () => Date.now(),
} = {}) {
  function serviceFor(env, date) {
    const store = createStore(env);
    const sender = createSender(env);
    const service = createPushService({
      store,
      sender,
      dataSources:{
        getQuote:ticker => fetchQuote(ticker),
        getIpoCalendar:() => fetchIpoCalendar(),
      },
      now:()=>date,
    });
    return { store, sender, service };
  }

  async function fetchHandler(request, env = {}, _ctx = {}) {
    try {
      const url = new URL(request.url);
      const method = String(request.method || 'GET').toUpperCase();
      const date = asDate(now());
      const { store, sender, service } = serviceFor(env, date);

      if (method === 'GET' && url.pathname === '/api/health') {
        const [snapshot, runtime] = await Promise.all([store.read(), store.runtimeRead()]);
        return json(200, {
          ok:true,
          now:date.toISOString(),
          push:{
            pollIntervalMs:POLL_INTERVAL_MS,
            androidFallbackMinutes:ANDROID_FALLBACK_MINUTES,
            fcmConfigured:Boolean(sender.configured),
            installationCount:Object.keys(snapshot?.installations || {}).length,
            newsNotificationsEnabled:newsNotificationsEnabled(env),
            runtime:runtime || { status:'not_run' },
          },
        });
      }

      if (method === 'POST' && url.pathname === '/v1/installations') {
        const registered = await service.register(await readJson(request));
        if (typeof store.ensureAlarm === 'function') {
          await store.ensureAlarm(date.getTime() + 1_000);
        }
        return json(200, {
          installId:registered.installId,
          enabled:registered.enabled,
          threshold:registered.threshold,
          ipoEnabled:registered.ipoEnabled,
          holdings:registered.holdings,
          updatedAt:registered.updatedAt,
        });
      }

      return json(404, { error:'NOT_FOUND' });
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      return json(status, { error:String(error?.message || 'İstek işlenemedi.') });
    }
  }

  async function scheduledHandler(controller = {}, env = {}, _ctx = {}) {
    const timestamp = Number.isFinite(Number(controller?.scheduledTime))
      ? Number(controller.scheduledTime)
      : Number(now());
    const date = asDate(timestamp);
    const { store, sender, service } = serviceFor(env, date);
    const startedAt = date.toISOString();

    try {
      const news = await runNewsNotifications({ env, store, sender, date });
      const ipo = await service.ipoCheck();
      if (!marketStatus(date).isOpen) {
        await store.runtimeWrite({
          status:'market_closed',
          startedAt,
          finishedAt:asDate(now()).toISOString(),
          result:{ ipo, news },
        });
        return;
      }

      const result = await service.marketCheck({
        maxUniqueTickers:MAX_UNIQUE_TICKERS,
        maxNotifications:MAX_NOTIFICATIONS,
      });
      await store.runtimeWrite({
        status:result.partial ? 'partial' : 'checked',
        startedAt,
        finishedAt:asDate(now()).toISOString(),
        result:{ ...result, ipo, news },
      });
    } catch (error) {
      await store.runtimeWrite({
        status:'error',
        startedAt,
        finishedAt:asDate(now()).toISOString(),
        result:{ error:String(error?.message || error) },
      });
      throw error;
    }
  }

  return Object.freeze({ fetch:fetchHandler, scheduled:scheduledHandler });
}

const app = createWorkerApp();

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};