import test from 'node:test';
import assert from 'node:assert/strict';

let metadata = null;
try {
  metadata = await import('../cloudflare/news-source-metadata.js');
} catch {}

function makeStore() {
  const state = { installations:{} };
  return {
    state,
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
}

test('cloud source metadata module exists', () => {
  assert.ok(metadata, 'cloudflare/news-source-metadata.js must exist');
});

test('Bloomberg HT article metadata prefers original title and article:published_time', () => {
  const html = `
    <html><head>
      <meta property="og:title" content="TCMB faiz kararını açıkladı | Bloomberg HT">
      <meta property="article:published_time" content="2026-09-17T11:42:00+03:00">
    </head><body><h1>Fallback title</h1></body></html>`;
  const parsed = metadata?.parseNewsArticleMetadata?.(html, { now:new Date('2026-09-17T12:00:00+03:00') });
  assert.equal(parsed?.title, 'TCMB faiz kararını açıkladı');
  assert.equal(parsed?.publishedAt, '2026-09-17T08:42:00.000Z');
});

test('JSON-LD datePublished is accepted when article meta time is absent', () => {
  const html = `<html><head>
    <meta property="og:title" content="Ekonomide önemli yeni karar açıklandı">
    <script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-09-17T09:25:00+03:00"}</script>
  </head></html>`;
  const parsed = metadata?.parseNewsArticleMetadata?.(html, { now:new Date('2026-09-17T10:00:00+03:00') });
  assert.equal(parsed?.publishedAt, '2026-09-17T06:25:00.000Z');
});

test('raw worker timestamp is replaced by source verified Bloomberg time before notification eligibility', async () => {
  const store = makeStore();
  let fetchCount = 0;
  const result = await metadata?.verifyNewsNotificationMetadata?.([
    {
      title:'TCMB politika faizini artırdı',
      url:'https://www.bloomberght.com/ornek-haber-3789001',
      source:'Bloomberg HT',
      category:'ekonomi',
      publishedAt:'2026-09-17T12:59:00+03:00',
      importance:5,
    },
  ], {
    store,
    now:() => new Date('2026-09-17T13:00:00+03:00'),
    fetchImpl:async () => {
      fetchCount += 1;
      return new Response(`<html><head>
        <meta property="og:title" content="TCMB politika faizini artırdı | Bloomberg HT">
        <meta property="article:published_time" content="2026-09-17T11:00:00+03:00">
      </head></html>`, { status:200, headers:{ 'content-type':'text/html' } });
    },
  });
  assert.equal(fetchCount, 1);
  assert.equal(result?.[0]?.publishedAt, '2026-09-17T08:00:00.000Z');
  assert.equal(result?.[0]?.publicationTimeVerified, true);
});

test('unverified timestamps from unsupported sources are cleared rather than treated as source time', async () => {
  const store = makeStore();
  const result = await metadata?.verifyNewsNotificationMetadata?.([
    {
      title:'Önemli ekonomi kararı açıklandı',
      url:'https://example.com/news/1',
      source:'Bilinmeyen Kaynak',
      category:'ekonomi',
      publishedAt:'2026-09-17T12:59:00+03:00',
      importance:4,
    },
  ], { store, now:() => new Date('2026-09-17T13:00:00+03:00'), fetchImpl:async () => { throw new Error('must not fetch unsupported host'); } });
  assert.equal(result?.[0]?.publishedAt, null);
  assert.equal(result?.[0]?.publicationTimeVerified, false);
});

test('verified article metadata is cached so repeated two-minute checks do not refetch the same page', async () => {
  const store = makeStore();
  let fetchCount = 0;
  const item = {
    title:'TCMB politika faizini artırdı',
    url:'https://www.bloomberght.com/ornek-haber-cache-3789002',
    source:'Bloomberg HT',
    category:'ekonomi',
    importance:5,
  };
  const options = {
    store,
    now:() => new Date('2026-09-17T13:00:00+03:00'),
    fetchImpl:async () => {
      fetchCount += 1;
      return new Response(`<html><head>
        <meta property="og:title" content="TCMB politika faizini artırdı">
        <time datetime="2026-09-17T12:55:00+03:00"></time>
      </head></html>`, { status:200 });
    },
  };
  const first = await metadata?.verifyNewsNotificationMetadata?.([item], options);
  const second = await metadata?.verifyNewsNotificationMetadata?.([item], options);
  assert.equal(fetchCount, 1);
  assert.equal(first?.[0]?.publishedAt, second?.[0]?.publishedAt);
  assert.ok(store.state.newsMetadataCache?.[item.url]);
});


test('Bloomberg landing and quote pages are rejected before notification metadata verification', async () => {
  const store = makeStore();
  let fetchCount = 0;
  const result = await metadata?.verifyNewsNotificationMetadata?.([
    {
      title:'Altın Fiyatları',
      url:'https://www.bloomberght.com/altin',
      source:'Bloomberg HT',
      category:'altin',
      publishedAt:'2026-09-17T12:59:00+03:00',
      importance:4,
    },
  ], {
    store,
    now:() => new Date('2026-09-17T13:00:00+03:00'),
    fetchImpl:async () => { fetchCount += 1; throw new Error('landing page must not be fetched'); },
  });
  assert.equal(fetchCount, 0);
  assert.equal(result?.[0]?.publishedAt, null);
  assert.equal(result?.[0]?.publicationTimeVerified, false);
});

test('generic or prefixed Bloomberg feed title is repaired from the original article og:title', async () => {
  const store = makeStore();
  const result = await metadata?.verifyNewsNotificationMetadata?.([
    {
      title:'HABERLER Altın piyasasında yeni hareket Ayrıntılı özet metni',
      url:'https://www.bloomberght.com/altin-piyasasinda-yeni-hareket-3789999',
      source:'Bloomberg HT',
      category:'altin',
      publishedAt:'2026-09-17T12:59:00+03:00',
      publicationTimeVerified:true,
      importance:2,
    },
  ], {
    store,
    now:() => new Date('2026-09-17T13:00:00+03:00'),
    fetchImpl:async () => new Response(`<html><head>
      <meta property="og:title" content="Altın, Fed beklentileriyle geriledi | Bloomberg HT">
      <meta property="article:published_time" content="2026-09-17T12:45:00+03:00">
    </head></html>`, { status:200 }),
  });
  assert.equal(result?.[0]?.title, 'Altın, Fed beklentileriyle geriledi');
  assert.equal(result?.[0]?.publishedAt, '2026-09-17T09:45:00.000Z');
  assert.equal(result?.[0]?.publicationTimeVerified, true);
});
