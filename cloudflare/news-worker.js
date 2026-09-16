import { NewsStateDurableObject } from './news-store.js';
import {
  NEWS_SOURCE_URLS,
  normalizeNewsItems,
  parseBloombergBreaking,
  parseBloombergLatest,
  parseTcmbRss,
} from './news-sources.js';

export { NewsStateDurableObject };

const INTERNAL_ORIGIN = 'https://news-state.internal';
const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const ALLOWED_CATEGORIES = new Set(['borsa','sirketler','doviz','altin','ekonomi','halka-arz']);

function corsHeaders(extra = {}) {
  return {
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type',
    'cache-control':'no-store',
    ...extra,
  };
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers:corsHeaders({ 'content-type':'application/json; charset=utf-8' }),
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
  try { return JSON.parse(new TextDecoder().decode(body)); }
  catch { throw statusError('Geçersiz JSON gövdesi.', 400); }
}

function requireStateStub(env) {
  const binding = env?.NEWS_STATE;
  if (!binding || typeof binding.idFromName !== 'function' || typeof binding.get !== 'function') {
    throw statusError('NEWS_STATE binding missing.', 503);
  }
  return binding.get(binding.idFromName('global'));
}

async function stateRequest(stub, path, init = {}) {
  const response = await stub.fetch(new Request(`${INTERNAL_ORIGIN}${path}`, init));
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = statusError(body?.error || `News state request failed (${response.status}).`, response.status);
    error.body = body;
    throw error;
  }
  return body || {};
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers:{
      accept:'text/html,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
      'user-agent':'InnativePortfolioNewsTest/1.0',
    },
  });
  if (!response?.ok) throw new Error(`Source failed (${response?.status || 0}): ${url}`);
  return response.text();
}

function parseLimit(value) {
  const n = Number.parseInt(String(value || DEFAULT_LIMIT), 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, n));
}

function newsIdFromCommentsPath(pathname) {
  const match = String(pathname).match(/^\/v1\/news\/(news_[a-z0-9]{4,80})\/comments$/i);
  return match ? match[1] : '';
}

export function createNewsWorkerApp({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  async function loadNews(stub) {
    const date = now() instanceof Date ? now() : new Date(now());
    const jobs = [
      ['bloombergLatest', NEWS_SOURCE_URLS.bloombergLatest, text => parseBloombergLatest(text, date)],
      ['bloombergBreaking', NEWS_SOURCE_URLS.bloombergBreaking, text => parseBloombergBreaking(text, date)],
      ['tcmbPress', NEWS_SOURCE_URLS.tcmbPress, text => parseTcmbRss(text, date)],
    ];
    const settled = await Promise.allSettled(jobs.map(async ([name, url, parser]) => ({
      name,
      items:parser(await fetchText(fetchImpl, url)),
    })));
    const groups = [];
    const sourceStatus = {};
    for (let i = 0; i < settled.length; i += 1) {
      const name = jobs[i][0];
      const result = settled[i];
      if (result.status === 'fulfilled') {
        groups.push(result.value.items);
        sourceStatus[name] = { ok:true, count:result.value.items.length };
      } else {
        sourceStatus[name] = { ok:false, error:String(result.reason?.message || result.reason) };
      }
    }
    const items = normalizeNewsItems(groups);
    if (!items.length && !Object.values(sourceStatus).some(entry => entry.ok)) {
      throw statusError('Haber kaynaklarına şu anda ulaşılamıyor.', 503);
    }
    const countsBody = await stateRequest(stub, '/comment-counts', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ ids:items.map(item => item.id) }),
    });
    const counts = countsBody.counts || {};
    return {
      items:items.map(item => ({ ...item, commentCount:Number(counts[item.id] || 0) })),
      sourceStatus,
      fetchedAt:(date instanceof Date ? date : new Date(date)).toISOString(),
    };
  }

  async function fetchHandler(request, env = {}) {
    try {
      const url = new URL(request.url);
      const method = String(request.method || 'GET').toUpperCase();
      if (method === 'OPTIONS') return new Response(null, { status:204, headers:corsHeaders() });
      const stub = requireStateStub(env);

      if (method === 'GET' && url.pathname === '/api/health') {
        const state = await stateRequest(stub, '/health');
        return json(200, {
          ok:true,
          service:'financial-news-test',
          sources:Object.keys(NEWS_SOURCE_URLS),
          state,
          now:(now() instanceof Date ? now() : new Date(now())).toISOString(),
        });
      }

      if (method === 'GET' && url.pathname === '/v1/news') {
        const feed = await loadNews(stub);
        const category = String(url.searchParams.get('category') || '').trim();
        const breakingOnly = url.searchParams.get('breaking') === '1';
        const limit = parseLimit(url.searchParams.get('limit'));
        let items = feed.items;
        if (category && ALLOWED_CATEGORIES.has(category)) items = items.filter(item => item.category === category);
        if (breakingOnly) items = items.filter(item => item.breaking === true);
        return json(200, {
          items:items.slice(0, limit),
          fetchedAt:feed.fetchedAt,
          partial:Object.values(feed.sourceStatus).some(entry => !entry.ok),
        });
      }

      const commentNewsId = newsIdFromCommentsPath(url.pathname);
      if (commentNewsId && method === 'GET') {
        return json(200, await stateRequest(stub, `/comments?newsId=${encodeURIComponent(commentNewsId)}`));
      }
      if (commentNewsId && method === 'POST') {
        const body = await readJson(request);
        const result = await stateRequest(stub, '/comments', {
          method:'POST',
          headers:{ 'content-type':'application/json' },
          body:JSON.stringify({ ...body, newsId:commentNewsId }),
        });
        return json(201, result);
      }

      if (method === 'POST' && url.pathname === '/v1/news/installations') {
        const body = await readJson(request);
        return json(200, await stateRequest(stub, '/installations', {
          method:'POST',
          headers:{ 'content-type':'application/json' },
          body:JSON.stringify(body),
        }));
      }

      return json(404, { error:'NOT_FOUND' });
    } catch (error) {
      return json(Number(error?.statusCode) || 500, { error:String(error?.message || 'İstek işlenemedi.') });
    }
  }

  return Object.freeze({ fetch:fetchHandler });
}

const app = createNewsWorkerApp();

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
};
