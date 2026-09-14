const STATE_KEY = 'push-state-v1';
const REVISION_KEY = 'push-state-revision-v1';
const RUNTIME_KEY = 'push-runtime-v1';
const INTERNAL_ORIGIN = 'https://push-state.internal';

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

export class PushStateDurableObject {
  constructor(state, _env = {}) {
    this.state = state;
    this.storage = state.storage;
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
        revision:Number.isFinite(Number(rawRevision)) ? Number(rawRevision) : 0,
        state:initialState(stored),
      });
    }

    if (method === 'PUT' && url.pathname === '/state') {
      const body = await parseJson(request);
      if (!body || !Number.isFinite(Number(body.revision)) || !body.state || typeof body.state !== 'object') {
        return json(400, { error:'INVALID_STATE_WRITE' });
      }
      return this.state.blockConcurrencyWhile(async () => {
        const currentRaw = await this.storage.get(REVISION_KEY);
        const current = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : 0;
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
      revision:Number.isFinite(Number(body.revision)) ? Number(body.revision) : 0,
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

  return Object.freeze({ read, mutate, runtimeRead, runtimeWrite });
}
