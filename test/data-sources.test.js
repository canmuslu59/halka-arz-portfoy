import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataSources } from '../public/core/data-sources.js';

test('market source requests Yahoo BIST symbol and parses response', async () => {
  let seen = '';
  const sources = createDataSources({
    getJson: async url => {
      seen = url;
      return { chart:{ result:[{ meta:{ regularMarketPrice:15, chartPreviousClose:14 }, timestamp:[1760000000], indicators:{ quote:[{ close:[15], high:[15], low:[14], open:[14] }] } }] } };
    },
    getText: async () => '',
  });
  const out = await sources.getQuote('TEST');
  assert.match(seen, /TEST\.IS/);
  assert.equal(out.current, 15);
});

test('IPO source finds ticker on Ahlatcı and follows detail link', async () => {
  const urls = [];
  const sources = createDataSources({
    getJson: async () => ({}),
    getText: async url => {
      urls.push(url);
      if (url.includes('/halka-arz/test')) return '<h1>Test AŞ</h1><p>Halka Arz Fiyatı 94,00 ₺ İlk İşlem Tarihi: 21 Ağustos 2026</p>';
      if (url.includes('sayfa=1')) return '<table><tr><td>Test AŞ TEST</td><td>x</td><td>94,00 ₺</td><td>18-19 Ağustos 2026</td><td><a href="/halka-arz/test">Detay</a></td></tr></table>';
      return '<table></table>';
    },
  });
  const out = await sources.getIpo('TEST');
  assert.equal(out.ipoPrice, 94);
  assert.equal(out.firstTradeDate, '2026-08-21');
  assert.ok(urls.some(url => url.includes('/halka-arz/test')));
});


test('history source requests daily Yahoo rows beginning near IPO date', async () => {
  let seen = '';
  const sources = createDataSources({
    getJson: async url => {
      seen = url;
      return { chart:{ result:[{ meta:{ regularMarketPrice:15 }, timestamp:[1760000000], indicators:{ quote:[{ close:[15], high:[15], low:[14], open:[14] }] } }] } };
    },
    getText: async () => '',
  });
  await sources.getHistory('TEST', '2026-08-20');
  assert.match(seen, /interval=1d/);
  assert.match(seen, /period1=/);
  assert.doesNotMatch(seen, /range=1y/);
});

test('quote source uses lightweight five-day range', async () => {
  let seen = '';
  const sources = createDataSources({
    getJson: async url => {
      seen = url;
      return { chart:{ result:[{ meta:{ regularMarketPrice:15 }, timestamp:[1760000000], indicators:{ quote:[{ close:[15], high:[15], low:[14], open:[14] }] } }] } };
    },
    getText: async () => '',
  });
  await sources.getQuote('TEST');
  assert.match(seen, /range=5d/);
});

test('sector source fetches company page once and parses sector', async () => {
  let seen = '';
  const sources = createDataSources({
    getJson: async () => ({}),
    getText: async url => {
      seen = url;
      return '<div>Şirket Detayları</div><div>Sektörler</div><div>Gayrimenkul Yatırım Ortaklıkları</div>';
    },
  });
  const out = await sources.getSector('TRGYO');
  assert.match(seen, /fintables\.com\/sirketler\/TRGYO/);
  assert.equal(out.sector, 'Gayrimenkul Yatırım Ortaklıkları');
});

test('lightweight quote requests intraday 5 minute data so recent trading sessions can backfill daily closes', async () => {
  let requested = null;
  const sources = createDataSources({
    getJson: async url => {
      requested = url;
      const t = Math.floor(new Date('2026-08-31T10:15:00Z').getTime()/1000);
      return { chart:{ result:[{ meta:{ regularMarketPrice:128, previousClose:142.2, regularMarketTime:t, exchangeTimezoneName:'Europe/Istanbul' }, timestamp:[t], indicators:{quote:[{close:[128],high:[128],low:[128],open:[128]}]} }] } };
    },
    getText: async () => '',
  });
  await sources.getQuote('CITAS');
  assert.match(requested, /range=5d/);
  assert.match(requested, /interval=5m/);
});
