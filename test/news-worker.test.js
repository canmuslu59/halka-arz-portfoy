import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNewsWorkerApp } from '../cloudflare/news-worker.js';
import { NewsStateModel } from '../cloudflare/news-store.js';
import { NEWS_SOURCE_URLS } from '../cloudflare/news-sources.js';

const latest = readFileSync(new URL('./fixtures/bloomberght-latest.html', import.meta.url), 'utf8');
const breaking = readFileSync(new URL('./fixtures/bloomberght-breaking.html', import.meta.url), 'utf8');
const tcmb = readFileSync(new URL('./fixtures/tcmb-press-rss.xml', import.meta.url), 'utf8');

function responseJson(status, body) {
  return new Response(JSON.stringify(body), { status, headers:{ 'content-type':'application/json' } });
}

function makeStateBinding() {
  let nowMs = Date.parse('2026-09-17T00:00:00Z');
  let model = new NewsStateModel({}, () => nowMs);
  const stub = {
    async fetch(request) {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      if (method === 'POST' && url.pathname === '/comment-counts') {
        const body = await request.json();
        return responseJson(200, { counts:model.commentCounts(body.ids || []) });
      }
      if (method === 'GET' && url.pathname === '/comments') {
        return responseJson(200, { comments:model.listComments(url.searchParams.get('newsId')) });
      }
      if (method === 'POST' && url.pathname === '/comments') {
        try {
          const comment = model.addComment(await request.json());
          return responseJson(201, { comment });
        } catch (error) {
          return responseJson(error.statusCode || 400, { error:error.message });
        }
      }
      if (method === 'POST' && url.pathname === '/installations') {
        try { return responseJson(200, model.registerInstallation(await request.json())); }
        catch (error) { return responseJson(error.statusCode || 400, { error:error.message }); }
      }
      if (method === 'GET' && url.pathname === '/health') {
        return responseJson(200, { ok:true, comments:0, installations:0, breakingSeen:0 });
      }
      return responseJson(404, { error:'NOT_FOUND' });
    },
  };
  return {
    binding:{ idFromName:() => 'global', get:() => stub },
    advance(ms) { nowMs += ms; model = new NewsStateModel(model.snapshot(), () => nowMs); },
  };
}

function makeFetch({ failTcmb = false } = {}) {
  return async url => {
    const target = String(url);
    if (target === NEWS_SOURCE_URLS.bloombergLatest) return new Response(latest, { status:200 });
    if (target === NEWS_SOURCE_URLS.bloombergBreaking) return new Response(breaking, { status:200 });
    if (target === NEWS_SOURCE_URLS.tcmbPress) return failTcmb ? new Response('down', { status:503 }) : new Response(tcmb, { status:200 });
    return new Response('not found', { status:404 });
  };
}

test('news feed is finance-only, supports category and breaking filters', async () => {
  const state = makeStateBinding();
  const app = createNewsWorkerApp({ fetchImpl:makeFetch(), now:() => new Date('2026-09-17T00:00:00Z') });
  const env = { NEWS_STATE:state.binding };

  const allResponse = await app.fetch(new Request('https://worker.test/v1/news?limit=100'), env);
  assert.equal(allResponse.status, 200);
  const all = await allResponse.json();
  assert.ok(all.items.length >= 6);
  assert.ok(all.items.every(item => ['borsa','sirketler','doviz','altin','ekonomi','halka-arz'].includes(item.category)));
  assert.ok(!all.items.some(item => /Teknoloji fuarı/.test(item.title)));

  const breakingResponse = await app.fetch(new Request('https://worker.test/v1/news?breaking=1'), env);
  const breakingOnly = await breakingResponse.json();
  assert.ok(breakingOnly.items.length >= 1);
  assert.ok(breakingOnly.items.every(item => item.breaking === true));

  const goldResponse = await app.fetch(new Request('https://worker.test/v1/news?category=altin'), env);
  const gold = await goldResponse.json();
  assert.ok(gold.items.length >= 1);
  assert.ok(gold.items.every(item => item.category === 'altin'));
});

test('one failed source yields a partial but usable feed', async () => {
  const state = makeStateBinding();
  const app = createNewsWorkerApp({ fetchImpl:makeFetch({ failTcmb:true }), now:() => new Date('2026-09-17T00:00:00Z') });
  const response = await app.fetch(new Request('https://worker.test/v1/news'), { NEWS_STATE:state.binding });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.partial, true);
  assert.ok(body.items.length >= 1);
});

test('comment routes share comments and do not expose installId', async () => {
  const state = makeStateBinding();
  const app = createNewsWorkerApp({ fetchImpl:makeFetch(), now:() => new Date('2026-09-17T00:00:00Z') });
  const env = { NEWS_STATE:state.binding };
  const feed = await (await app.fetch(new Request('https://worker.test/v1/news?limit=1'), env)).json();
  const id = feed.items[0].id;

  const post = await app.fetch(new Request(`https://worker.test/v1/news/${id}/comments`, {
    method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ installId:'install-1234', userName:'Can', text:'Takipteyim' }),
  }), env);
  assert.equal(post.status, 201);
  const created = (await post.json()).comment;
  assert.equal(created.userName, 'Can');
  assert.ok(!('installId' in created));

  const list = await (await app.fetch(new Request(`https://worker.test/v1/news/${id}/comments`), env)).json();
  assert.equal(list.comments.length, 1);
  assert.ok(!('installId' in list.comments[0]));
});

test('health and tokenless installation registration work for test apk', async () => {
  const state = makeStateBinding();
  const app = createNewsWorkerApp({ fetchImpl:makeFetch(), now:() => new Date('2026-09-17T00:00:00Z') });
  const env = { NEWS_STATE:state.binding };
  const health = await app.fetch(new Request('https://worker.test/api/health'), env);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'financial-news-test');

  const registered = await app.fetch(new Request('https://worker.test/v1/news/installations', {
    method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ installId:'install-1234' }),
  }), env);
  assert.equal(registered.status, 200);
  assert.equal((await registered.json()).pushReady, false);
});
