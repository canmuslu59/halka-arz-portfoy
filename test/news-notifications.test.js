import test from 'node:test';
import assert from 'node:assert/strict';

let news = null;
try {
  news = await import('../cloudflare/news-notifications.js');
} catch {}

const item = (title, publishedAt, extra = {}) => ({
  title,
  publishedAt,
  url: extra.url || `https://example.com/${encodeURIComponent(title)}`,
  source: extra.source || 'Test Kaynak',
  category: extra.category || 'ekonomi',
  ...extra,
});

test('news notification module exists as an isolated cloud layer', () => {
  assert.ok(news, 'cloudflare/news-notifications.js must exist');
});

test('only genuinely critical finance events reach importance 5 of 5', () => {
  assert.equal(news?.scoreNewsImportance?.(item('TCMB politika faizini 500 baz puan artırdı', '2026-09-17T11:00:00+03:00')), 5);
  assert.equal(news?.scoreNewsImportance?.(item('Borsa İstanbul işlemleri geçici olarak durdurdu', '2026-09-17T11:00:00+03:00', { category:'borsa' })), 5);
  assert.ok((news?.scoreNewsImportance?.(item('XYZ hissesinde işlemler geçici olarak durduruldu', '2026-09-17T11:00:00+03:00', { category:'borsa' })) ?? 99) < 5);
  assert.ok((news?.scoreNewsImportance?.(item('Dolar güne yatay başladı', '2026-09-17T11:00:00+03:00', { category:'doviz' })) ?? 99) < 5);
  assert.ok((news?.scoreNewsImportance?.(item('Şirket temettü tarihini açıkladı', '2026-09-17T11:00:00+03:00', { category:'sirketler' })) ?? 99) < 5);
});

test('morning digest covers previous 19:00 through current 10:00 Istanbul', () => {
  const now = new Date('2026-09-17T10:03:00+03:00');
  const entries = [
    item('Gece önemli ekonomi kararı açıklandı', '2026-09-16T20:15:00+03:00', { importance:4 }),
    item('Sabah önemli piyasa gelişmesi', '2026-09-17T08:20:00+03:00', { importance:4 }),
    item('Önceki pencereye ait haber', '2026-09-16T18:59:00+03:00', { importance:5 }),
    item('Saat ondan sonra gelen haber', '2026-09-17T10:01:00+03:00', { importance:5 }),
  ];
  const selected = news?.selectDigestItems?.(entries, { slot:'morning', now }) || [];
  assert.deepEqual(selected.map(x => x.title), [
    'Sabah önemli piyasa gelişmesi',
    'Gece önemli ekonomi kararı açıklandı',
  ]);
});

test('evening digest covers 10:00 through 19:00 Istanbul and prioritizes important items', () => {
  const now = new Date('2026-09-17T19:04:00+03:00');
  const entries = [
    item('Birinci önemli gelişme', '2026-09-17T10:05:00+03:00', { importance:4 }),
    item('İkinci önemli gelişme', '2026-09-17T12:00:00+03:00', { importance:3 }),
    item('Üçüncü önemli gelişme', '2026-09-17T14:00:00+03:00', { importance:4 }),
    item('Dördüncü önemli gelişme', '2026-09-17T16:00:00+03:00', { importance:3 }),
    item('Beşinci önemli gelişme', '2026-09-17T17:00:00+03:00', { importance:4 }),
    item('Rutin haber', '2026-09-17T18:00:00+03:00', { importance:2 }),
  ];
  const selected = news?.selectDigestItems?.(entries, { slot:'evening', now }) || [];
  assert.equal(selected.length, 4);
  assert.ok(selected.every(x => Number(x.importance) >= 3));
  assert.deepEqual(selected.map(x => x.title), [
    'Beşinci önemli gelişme',
    'Üçüncü önemli gelişme',
    'Birinci önemli gelişme',
    'Dördüncü önemli gelişme',
  ]);
});

test('digest falls back to routine finance headlines when important items are scarce', () => {
  const now = new Date('2026-09-17T10:03:00+03:00');
  const entries = [
    item('Önemli enflasyon verisi açıklandı', '2026-09-17T08:30:00+03:00', { importance:3 }),
    item('Altın güne yükselişle başladı', '2026-09-17T08:45:00+03:00', { importance:2 }),
    item('Dolar sabah saatlerinde yatay seyretti', '2026-09-17T09:00:00+03:00', { importance:2 }),
  ];
  const selected = news?.selectDigestItems?.(entries, { slot:'morning', now }) || [];
  assert.deepEqual(selected.map(x => x.title), [
    'Önemli enflasyon verisi açıklandı',
    'Dolar sabah saatlerinde yatay seyretti',
    'Altın güne yükselişle başladı',
  ]);
});

test('digest message still has a useful body when the feed window is empty', () => {
  const message = news?.digestMessage?.('morning', []);
  assert.equal(message?.title, '📰 Dünden Kalan Önemliler');
  assert.match(String(message?.body || ''), /öne çıkan yeni finans haberi bulunamadı/i);
});

test('digest slot remains due after the old 15 minute window until delivered that day', () => {
  assert.equal(news?.currentDigestSlot?.(new Date('2026-09-17T13:30:00+03:00')), 'morning');
  assert.equal(news?.currentDigestSlot?.(new Date('2026-09-17T23:15:00+03:00')), 'evening');
  assert.equal(news?.currentDigestSlot?.(new Date('2026-09-17T09:59:00+03:00')), null);
});

test('digest body uses short bullet headlines and does not exceed four items', () => {
  const selected = [
    item('TCMB faiz kararını açıkladı ve piyasalarda yeni fiyatlama başladı', '2026-09-17T10:00:00+03:00', { importance:5 }),
    item('Borsa İstanbul tarafında önemli düzenleme duyuruldu', '2026-09-17T11:00:00+03:00', { importance:4 }),
    item('Altın piyasasında günün önemli gelişmesi', '2026-09-17T12:00:00+03:00', { importance:3 }),
    item('Dördüncü önemli haber', '2026-09-17T13:00:00+03:00', { importance:3 }),
    item('Beşinci haber gösterilmemeli', '2026-09-17T14:00:00+03:00', { importance:3 }),
  ];
  const message = news?.digestMessage?.('evening', selected);
  assert.equal(message?.title, '📰 Akşama Düşenler');
  const bullets = String(message?.body || '').split('\n').filter(line => line.startsWith('• '));
  assert.equal(bullets.length, 4);
  assert.ok(bullets.every(line => line.length <= 76));
});

test('5 of 5 item is delivered immediately only once per installation but may remain eligible for a later digest', async () => {
  const critical = item('TCMB olağanüstü toplantı sonrası faiz kararını açıkladı', '2026-09-17T13:00:00+03:00', { importance:5, id:'critical-1' });
  const state = {
    installations:{
      phone1:{ installId:'phone1', fcmToken:'token-1', newsEnabled:true, newsState:{ morningDigestDay:'2026-09-17' } },
    },
  };
  const store = {
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
  const sent = [];
  const sender = { async send(token, message) { sent.push({ token, message }); } };
  const engine = news?.createNewsNotificationEngine?.({
    store,
    sender,
    fetchNews:async () => [critical],
    now:() => new Date('2026-09-17T13:01:00+03:00'),
  });
  assert.ok(engine, 'news notification engine must be constructible');
  await engine.check();
  await engine.check();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.data.kind, 'news_breaking');
  assert.match(sent[0].message.title, /Son Dakika/);
  assert.ok(Array.isArray(state.installations.phone1.newsState?.breakingSeen));
});

test('digest slots are sent once per Istanbul day even when the feed has fewer than two important headlines', async () => {
  const entries = [
    item('Önemli ekonomi gelişmesi', '2026-09-16T21:00:00+03:00', { importance:4, id:'n1' }),
    item('Önemli piyasa gelişmesi', '2026-09-17T08:00:00+03:00', { importance:3, id:'n2' }),
  ];
  const state = { installations:{ phone1:{ installId:'phone1', fcmToken:'token-1', newsEnabled:true } } };
  const store = {
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
  const sent = [];
  const sender = { async send(token, message) { sent.push({ token, message }); } };
  const engine = news?.createNewsNotificationEngine?.({
    store,
    sender,
    fetchNews:async () => entries,
    now:() => new Date('2026-09-17T10:04:00+03:00'),
  });
  assert.ok(engine, 'news notification engine must be constructible');
  await engine.check();
  await engine.check();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.data.kind, 'news_digest');
  assert.equal(sent[0].message.title, '📰 Dünden Kalan Önemliler');
  assert.equal(state.installations.phone1.newsState?.morningDigestDay, '2026-09-17');
});

test('empty digest window still sends exactly one morning notification', async () => {
  const state = { installations:{ phone1:{ installId:'phone1', fcmToken:'token-1', newsEnabled:true } } };
  const store = {
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
  const sent = [];
  const sender = { async send(token, message) { sent.push({ token, message }); } };
  const engine = news?.createNewsNotificationEngine?.({
    store,
    sender,
    fetchNews:async () => [],
    now:() => new Date('2026-09-17T10:30:00+03:00'),
  });
  await engine.check();
  await engine.check();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.data.kind, 'news_digest');
  assert.equal(sent[0].message.data.news_count, '0');
  assert.equal(state.installations.phone1.newsState?.morningDigestDay, '2026-09-17');
});

test('one invalid FCM token does not block news delivery to other installations', async () => {
  const state = {
    installations:{
      broken:{ installId:'broken', fcmToken:'bad-token', newsEnabled:true },
      healthy:{ installId:'healthy', fcmToken:'good-token', newsEnabled:true },
    },
  };
  const store = {
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
  const sent = [];
  const sender = {
    async send(token, message) {
      if (token === 'bad-token') {
        const error = new Error('unregistered');
        error.code = 'FCM_TOKEN_INVALID';
        error.permanentToken = true;
        throw error;
      }
      sent.push({ token, message });
    },
  };
  const engine = news?.createNewsNotificationEngine?.({
    store,
    sender,
    fetchNews:async () => [],
    now:() => new Date('2026-09-17T10:05:00+03:00'),
  });
  const result = await engine.check();
  assert.equal(state.installations.broken, undefined);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].token, 'good-token');
  assert.equal(sent[0].message.data.kind, 'news_digest');
  assert.equal(result?.invalidRemoved, 1);
  assert.equal(result?.digestSent, 1);
});
