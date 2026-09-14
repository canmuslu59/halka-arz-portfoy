import { createPushService } from '../backend/service.js';
import { getBistMarketStatus } from '../public/core/market-calendar.js';
import { createCloudflareFcmSender } from './fcm-sender.js';
import { fetchYahooQuote } from './yahoo-quote.js';
import { fetchCloudflareIpoCalendar } from './ipo-calendar.js';
import { fetchCloudflareIpoCalendar } from './ipo-calendar.js';

const STATE_KEY = 'push-state-v1';
const REVISION_KEY = 'push-state-revision-v1';
const RUNTIME_KEY = 'push-runtime-v1';
const INTERNAL_ORIGIN = 'https://push-state.internal';
const ALARM_INTERVAL_MS = 120_000;
const MAX_UNIQUE_TICKERS = 30;
const MAX_NOTIFICATIONS = 15;

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
  });
}

function initialState(value) {
  if (!value || typeof value !== 'object') return { installations:{} };
  return { ...value, installations:{ ...(value.installations || {}) } };
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function finiteRevision(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function nextAlarmAt(nowMs, status) {
  if (status?.isOpen) return nowMs + ALARM_INTERVAL_MS;
  const nextOpen = Date.parse(String(status?.nextOpenAt || ''));
  if (Number.isFinite(nextOpen) && nextOpen > nowMs) return nextOpen;
  return nowMs + ALARM_INTERVAL_MS;
}

export class PushStateDurableObject {
  constructor(state, env = {}) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
  }

  async readStoredState() {
    return initialState(await this.storage.get(STATE_KEY));
  }

  localStore() {
    return Object.freeze({
      read:async () => structuredClone(await this.readStoredState()),
      mutate:async fn => {
        if (typeof fn !== 'function') throw new TypeError('Durable store mutate callback is required.');
        return this.state.blockConcurrencyWhile(async () => {
          const draft = structuredClone(await this.readStoredState());
          const result = await fn(draft);
          const revision = finiteRevision(await this.storage.get(REVISION_KEY)) + 1;
          await this.storage.put({
            [STATE_KEY]:initialState(draft),
            [REVISION_KEY]:revision,
          });
          return result;
        });
      },
      runtimeRead:async () => structuredClone((await this.storage.get(RUNTIME_KEY)) ?? null),
      runtimeWrite:async runtime => {
        await this.storage.put(RUNTIME_KEY, runtime ?? null);
        return runtime;
      },
    });
  }

  async ensureAlarm(atMs) {
    const requested = Number(atMs);
    if (!Number.isFinite(requested) || requested <= 0) throw new TypeError('A valid alarm timestamp is required.');
    const current = await this.storage.getAlarm();
    if (current == null || requested < Number(current)) {
      await this.storage.setAlarm(requested);
      return requested;
    }
    return Number(current);
  }

  async alarm() {
    const started = new Date();
    const startedMs = started.getTime();
    const status = getBistMarketStatus(started);
    const store = this.localStore();

    try {
      const sender = createCloudflareFcmSender({
        serviceAccountJson:this.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      });
      const service = createPushService({
        store,
        sender,
        dataSources:{
          getQuote:ticker => fetchYahooQuote(ticker),
          getIpoCalendar:() => fetchCloudflareIpoCalendar(),
        },
        now:()=>started,
      });
      const ipo = await service.ipoCheck();
      if (!status.isOpen) {
        await store.runtimeWrite({
          status:'market_closed',
          startedAt:started.toISOString(),
          finishedAt:new Date().toISOString(),
          result:{ ipo },
        });
        return;
      }

      const result = await service.marketCheck({
        maxUniqueTickers:MAX_UNIQUE_TICKERS,
        maxNotifications:MAX_NOTIFICATIONS,
      });
      await store.runtimeWrite({
        status:result.partial ? 'partial' : 'checked',
        startedAt:started.toISOString(),
        finishedAt:new Date().toISOString(),
        result:{ ...result, ipo },
      });
    } catch (error) {
      await store.runtimeWrite({
        status:'error',
        startedAt:started.toISOString(),
        finishedAt:new Date().toISOString(),
        result:{ error:String(error?.message || error) },
      });
    } finally {
      await this.storage.setAlarm(nextAlarmAt(startedMs, status));
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = String(request.method || 'GET').toUpperCase();

    if (method === 'GET' && url.pathname === '/state') {
      const [stored, rawRevision] = await Promise.all([
        this.storage.get(STATE_KEY),
        this.storage.get(REVISION_KEY),
      ]);
      return json(200, {
        revision:finiteRevision(rawRevision),
        state:initialState(stored),
      });
    }

    if (method === 'PUT' && url.pathname === '/state') {
      const body = await parseJson(request);
      if (!body || !Number.isFinite(Number(body.revision)) || !body.state || typeof body.state !== 'object') {
        return json(400, { error:'INVALID_STATE_WRITE' });
      }
      return this.state.blockConcurrencyWhile(async () => {
        const current = finiteRevision(await this.storage.get(REVISION_KEY));
        if (current !== Number(body.revision)) {
          return json(409, { error:'REVISION_CONFLICT', revision:current });
        }
        const next = current + 1;
        await this.storage.put({
          [STATE_KEY]:initialState(body.state),
          [REVISION_KEY]:next,
        });
        return json(200, { revision:next });
      });
    }

    if (method === 'GET' && url.pathname === '/runtime') {
      return json(200, { runtime:(await this.storage.get(RUNTIME_KEY)) ?? null });
    }

    if (method === 'PUT' && url.pathname === '/runtime') {
      const body = await parseJson(request);
      if (!body || !Object.prototype.hasOwnProperty.call(body, 'runtime')) {
        return json(400, { error:'INVALID_RUNTIME_WRITE' });
      }
      await this.storage.put(RUNTIME_KEY, body.runtime ?? null);
      return json(200, { ok:true });
    }

    if (method === 'PUT' && url.pathname === '/alarm/ensure') {
      const body = await parseJson(request);
      const at = Number(body?.at);
      if (!Number.isFinite(at) || at <= 0) return json(400, { error:'INVALID_ALARM' });
      return json(200, { alarmAt:await this.ensureAlarm(at) });
    }

    return json(404, { error:'NOT_FOUND' });
  }
}

function requireBinding(binding) {
  if (!binding || typeof binding.idFromName !== 'function' || typeof binding.get !== 'function') {
    throw new TypeError('Durable Object PUSH_STATE binding is required.');
  }
  return binding.get(binding.idFromName('global'));
}

async function responseJson(response, label) {
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(`${label} failed (${response.status}).`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body || {};
}

export function createDurableStore(binding) {
  const stub = requireBinding(binding);

  async function snapshot() {
    const response = await stub.fetch(new Request(`${INTERNAL_ORIGIN}/state`));
    const body = await responseJson(response, 'Durable state read');
    return {
      revision:finiteRevision(body.revision),
      state:initialState(body.state),
    };
  }

  async function read() {
    return structuredClone((await snapshot()).state);
  }

  async function mutate(fn) {
    if (typeof fn !== 'function') throw new TypeError('Durable store mutate callback is required.');
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await snapshot();
      const draft = structuredClone(current.state);
      const result = await fn(draft);
      const response = await stub.fetch(new Request(`${INTERNAL_ORIGIN}/state`, {
        method:'PUT',
        headers:{ 'content-type':'application/json; charset=utf-8' },
        body:JSON.stringify({ revision:current.revision, state:draft }),
      }));
      if (response.status === 409) continue;
      await responseJson(response, 'Durable state write');
      return result;
    }
    throw new Error('Durable state write exceeded revision retry budget.');
  }

  async function runtimeRead() {
    const response = await stub.fetch(new Request(`${INTERNAL_ORIGIN}/runtime`));
    return structuredClone((await responseJson(response, 'Durable runtime read')).runtime ?? null);
  }

  async function runtimeWrite(runtime) {
    const response = await stub.fetch(new Request(`${INTERNAL_ORIGIN}/runtime`, {
      method:'PUT',
      headers:{ 'content-type':'application/json; charset=utf-8' },
      body:JSON.stringify({ runtime }),
    }));
    await responseJson(response, 'Durable runtime write');
    return runtime;
  }

  async function ensureAlarm(at) {
    const response = await stub.fetch(new Request(`${INTERNAL_ORIGIN}/alarm/ensure`, {
      method:'PUT',
      headers:{ 'content-type':'application/json; charset=utf-8' },
      body:JSON.stringify({ at }),
    }));
    const body = await responseJson(response, 'Durable alarm scheduling');
    return Number(body.alarmAt);
  }

  return Object.freeze({ read, mutate, runtimeRead, runtimeWrite, ensureAlarm });
}
