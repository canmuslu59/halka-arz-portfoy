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

test('financial enforcement is breaking but unrelated police news is not', () => {
  assert.equal(
    news?.scoreNewsImportance?.(item('Fon soruşturması genişliyor: 14 kişi gözaltına alındı', '2026-09-22T09:59:00+03:00', { category:'borsa' })),
    5
  );
  assert.equal(
    news?.scoreNewsImportance?.(item('Banka yöneticilerine yönelik operasyonda 8 kişi gözaltına alındı', '2026-09-22T10:23:00+03:00', { category:'ekonomi' })),
    5
  );
  assert.ok(
    (news?.scoreNewsImportance?.(item('Uyuşturucu soruşturmasında 14 kişi gözaltına alındı', '2026-09-22T10:23:00+03:00', { category:'ekonomi' })) ?? 99) < 5
  );
});

test('a frozen financial investigation amount is breaking even with a low feed score', async () => {
  const headline = 'Fon soruşturması kapsamında 750 milyon TL’lik tutar donduruldu';
  const critical = item(headline, '2026-09-24T11:51:00+03:00', { importance:1, id:'frozen-funds' });
  assert.equal(news.scoreNewsImportance(critical), 5);
  assert.ok(news.scoreNewsImportance(item('Gıda soruşturmasında ürünler donduruldu', critical.publishedAt)) < 5);
  const state = { installations:{ phone1:{ fcmToken:'token-1', newsEnabled:true } } };
  const store = {
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
  const sent = [];
  const engine = news.createNewsNotificationEngine({
    store, sender:{ async send(_token, message) { sent.push(message); } },
    fetchNews:async () => [critical], now:() => new Date('2026-09-24T11:58:00+03:00'),
  });
  await engine.check();
  await engine.check();
  assert.equal(sent.filter(message => message.data.kind === 'news_breaking').length, 1);
  assert.equal(sent[0].body, headline);
});

test('10:00 and 19:00 digests keep their routine titles regardless of article topics', () => {
  const rate = item('TCMB politika faizini artırdı', '2026-09-24T09:30:00+03:00');
  assert.equal(news.digestMessage('morning', [rate]).title, '☀️ Sabah Finans Özeti');
  assert.equal(news.digestMessage('evening', [rate]).title, '🌙 Akşam Finans Özeti');
  assert.equal(news.digestMessage('routine-12', [rate]).title, '🏦 Faiz ve Piyasa Gündemi');
});

test('scheduled summaries recover with a recent real article when the interval is empty', async () => {
  const previous = item('Dün akşam ekonomi gündemi', '2026-09-23T18:00:00+03:00', { importance:3 });
  const state = { installations:{ phone1:{ fcmToken:'token-1', newsEnabled:true } } };
  const store = { async read() { return structuredClone(state); }, async mutate(fn) { return fn(state); } };
  const sent = [];
  const engine = news.createNewsNotificationEngine({
    store, sender:{ async send(_token, message) { sent.push(message); } },
    fetchNews:async () => [previous], now:() => new Date('2026-09-24T10:03:00+03:00'),
  });
  await engine.check();
  await engine.check();
  assert.equal(sent.filter(message => message.data.digest_slot === 'morning').length, 1);
  assert.equal(sent[0].title, '☀️ Sabah Finans Özeti');
  assert.match(sent[0].body, /Dün akşam ekonomi gündemi/);
});

test('a late morning check never uses news published after 10:00', async () => {
  const later = item('Saat 10 sonrasında açıklanan haber', '2026-09-24T10:02:00+03:00', { importance:5 });
  const earlier = item('Gece yayınlanan piyasa haberi', '2026-09-24T09:00:00+03:00', { importance:3 });
  assert.deepEqual(news.selectDigestItems([earlier, later], {
    slot:'morning', now:new Date('2026-09-24T10:05:00+03:00'),
  }).map(x=>x.title), [earlier.title]);
  assert.equal(news.selectRoutineNewsItem([later], { now:new Date('2026-09-24T10:00:00+03:00') }), null);
  assert.equal(news.selectRoutineNewsItem([item('Eski haber', '2026-09-20T10:00:00+03:00')], {
    now:new Date('2026-09-24T10:00:00+03:00'),
  }), null);
});

test('the 19:00 summary excludes navigation pages even if the feed marks them important', () => {
  const now = new Date('2026-09-24T19:00:00+03:00');
  const entries = ['Borsa Kapanış', 'Çeyrek Altın', 'Cumhuriyet Altını'].map((title,index) =>
    item(title, `2026-09-24T1${index + 5}:00:00+03:00`, { importance:5 }));
  entries.push(item('TCMB rezervlerinde düşüş sürüyor', '2026-09-24T17:00:00+03:00', { importance:3 }));
  const selected = news.selectDigestItems(entries, { slot:'evening', now });
  assert.deepEqual(selected.map(x=>x.title), ['TCMB rezervlerinde düşüş sürüyor']);
});

test('minister statements and major global central-bank rate decisions are 5 of 5', () => {
  assert.equal(news?.scoreNewsImportance?.(item('Bakan Şimşek enflasyon programına ilişkin açıklama yaptı', '2026-09-22T11:00:00+03:00')), 5);
  assert.equal(news?.scoreNewsImportance?.(item('Ticaret Bakanlığından piyasalara ilişkin açıklama', '2026-09-22T11:00:00+03:00')), 5);
  assert.equal(news?.scoreNewsImportance?.(item('Fed faiz oranını sabit tuttu', '2026-09-22T21:00:00+03:00')), 5);
  assert.equal(news?.scoreNewsImportance?.(item('Avrupa Merkez Bankası faiz kararını açıkladı', '2026-09-22T15:15:00+03:00')), 5);
  assert.equal(news?.scoreNewsImportance?.(item('Japonya Merkez Bankası faizi artırdı', '2026-09-22T06:10:00+03:00')), 5);
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

test('evening digest covers 10:00 through 19:00 Istanbul and keeps only 2 to 4 important items', () => {
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

test('digest body uses short bullet headlines and does not exceed four items', () => {
  const selected = [
    item('TCMB faiz kararını açıkladı ve piyasalarda yeni fiyatlama başladı', '2026-09-17T10:00:00+03:00', { importance:5 }),
    item('Borsa İstanbul tarafında önemli düzenleme duyuruldu', '2026-09-17T11:00:00+03:00', { importance:4 }),
    item('Altın piyasasında günün önemli gelişmesi', '2026-09-17T12:00:00+03:00', { importance:3 }),
    item('Dördüncü önemli haber', '2026-09-17T13:00:00+03:00', { importance:3 }),
    item('Beşinci haber gösterilmemeli', '2026-09-17T14:00:00+03:00', { importance:3 }),
  ];
  const message = news?.digestMessage?.('evening', selected);
  assert.equal(message?.title, '🌙 Akşam Finans Özeti');
  assert.match(String(message?.body || ''), /\n\n/);
  const bullets = String(message?.body || '').split('\n\n').filter(line => line.startsWith('• '));
  assert.equal(bullets.length, 4);
  assert.ok(bullets.every(line => line.length <= 76));
});

test('5 of 5 item is delivered immediately only once per installation but may remain eligible for a later digest', async () => {
  const critical = item('TCMB olağanüstü toplantı sonrası faiz kararını açıkladı', '2026-09-17T13:00:00+03:00', { importance:5, id:'critical-1' });
  const state = {
    installations:{
      phone1:{ installId:'phone1', fcmToken:'token-1', newsEnabled:true, newsState:null },
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

test('digest slots are sent once per Istanbul day and can send the single best headline', async () => {
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
  assert.equal(sent[0].message.title, '☀️ Sabah Finans Özeti');
  assert.equal(state.installations.phone1.newsState?.morningDigestDay, '2026-09-17');
});


test('digest delivery remains due after the old 15-minute window instead of being missed for the day', () => {
  assert.equal(news?.currentDigestSlot?.(new Date('2026-09-17T10:47:00+03:00')), 'morning');
  assert.equal(news?.currentDigestSlot?.(new Date('2026-09-17T18:59:00+03:00')), 'morning');
  assert.equal(news?.currentDigestSlot?.(new Date('2026-09-17T20:15:00+03:00')), 'evening');
});

test('generic Bloomberg quote/category pages are never notification news items', () => {
  const generic = [
    item('Hisse Senetleri', '2026-09-17T12:00:00+03:00', { category:'borsa', url:'https://www.bloomberght.com/borsa/hisseler' }),
    item('Borsa Haberleri', '2026-09-17T12:00:00+03:00', { category:'borsa', url:'https://www.bloomberght.com/piyasalar' }),
    item('Altın Fiyatları', '2026-09-17T12:00:00+03:00', { category:'altin', url:'https://www.bloomberght.com/altin' }),
  ];
  assert.ok(generic.every(entry => news?.isNotificationNewsItem?.(entry) === false));
  const selected = news?.selectDigestItems?.(generic, { slot:'evening', now:new Date('2026-09-17T19:30:00+03:00') }) || [];
  assert.equal(selected.length, 0);
});

test('when no 3 of 5 item exists, digest still selects the single best real headline', () => {
  const entries = [
    item('Altın güne sınırlı yükselişle başladı', '2026-09-17T12:00:00+03:00', { importance:2, category:'altin' }),
    item('Dolar yatay seyretti', '2026-09-17T13:00:00+03:00', { importance:2, category:'doviz' }),
  ];
  const selected = news?.selectDigestItems?.(entries, { slot:'evening', now:new Date('2026-09-17T19:20:00+03:00') }) || [];
  assert.equal(selected.length, 1);
  assert.equal(selected[0].title, 'Dolar yatay seyretti');
});

test('six-hour silence guard sends one best real headline and resets after delivery', async () => {
  const entries = [
    item('Altın piyasasında yeni fiyatlama öne çıktı', '2026-09-22T02:20:00+03:00', { importance:2, category:'altin', id:'routine-1' }),
    item('BIST şirketlerinden yeni yatırım açıklaması', '2026-09-22T02:10:00+03:00', { importance:3, category:'sirketler', id:'routine-2' }),
  ];
  const state = { installations:{ phone1:{ installId:'phone1', fcmToken:'token-1', newsEnabled:true } } };
  const store = {
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
  const sent = [];
  let clock = new Date('2026-09-22T03:00:00+03:00');
  const engine = news?.createNewsNotificationEngine?.({
    store,
    sender:{ async send(token, message) { sent.push({ token, message }); } },
    fetchNews:async () => entries,
    now:() => clock,
  });
  await engine.check();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.data.kind, 'news_digest');
  assert.equal(sent[0].message.data.routine_interval_hours, '6');

  clock = new Date('2026-09-22T08:59:00+03:00');
  await engine.check();
  assert.equal(sent.length, 1);

  clock = new Date('2026-09-22T09:01:00+03:00');
  await engine.check();
  assert.equal(sent.length, 2);
});

test('feed importance cannot downgrade a locally critical global rate decision', async () => {
  const critical = item('Fed faiz oranını sabit tuttu', '2026-09-22T08:55:00+03:00', { importance:2, id:'fed-rate' });
  const state = { installations:{ phone1:{ installId:'phone1', fcmToken:'token-1', newsEnabled:true } } };
  const store = {
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
  const sent = [];
  const engine = news?.createNewsNotificationEngine?.({
    store,
    sender:{ async send(token, message) { sent.push({ token, message }); } },
    fetchNews:async () => [critical],
    now:() => new Date('2026-09-22T09:00:00+03:00'),
  });
  await engine.check();
  assert.ok(sent.some(entry => entry.message.data.kind === 'news_breaking'));
});

test('breaking 5 of 5 news remains eligible for ninety minutes', async () => {
  const critical = item('TCMB politika faizini 300 baz puan artırdı', '2026-09-17T12:00:00+03:00', { importance:5, id:'critical-90m' });
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
    fetchNews:async () => [critical],
    now:() => new Date('2026-09-17T13:20:00+03:00'),
  });
  await engine.check();
  assert.equal(sent.filter(entry => entry.message.data.kind === 'news_breaking').length, 1);
});
