import { createPushService } from '../backend/service.js';
import { getBistMarketStatus } from '../public/core/market-calendar.js';
import { createD1Store } from './d1-store.js';
import { createCloudflareFcmSender } from './fcm-sender.js';
import { fetchYahooQuote } from './yahoo-quote.js';

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

export function createWorkerApp({
  createStore = env => createD1Store(env.DB),
  createSender = env => createCloudflareFcmSender({ serviceAccountJson:env.FIREBASE_SERVICE_ACCOUNT_JSON }),
  fetchQuote = ticker => fetchYahooQuote(ticker),
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
        getIpoCalendar:async()=>[],
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
            runtime:runtime || { status:'not_run' },
          },
        });
      }

      if (method === 'POST' && url.pathname === '/v1/installations') {
        const registered = await service.register(await readJson(request));
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
    const { store, service } = serviceFor(env, date);
    const startedAt = date.toISOString();

    if (!marketStatus(date).isOpen) {
      await store.runtimeWrite({
        status:'market_closed',
        startedAt,
        finishedAt:asDate(now()).toISOString(),
        result:null,
      });
      return;
    }

    try {
      const result = await service.marketCheck({
        maxUniqueTickers:MAX_UNIQUE_TICKERS,
        maxNotifications:MAX_NOTIFICATIONS,
      });
      await store.runtimeWrite({
        status:result.partial ? 'partial' : 'checked',
        startedAt,
        finishedAt:asDate(now()).toISOString(),
        result,
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
