import test from 'node:test';
import assert from 'node:assert/strict';
import {
  numTR,
  isoFromTurkishDate,
  parseYahooChart,
  parseAhlatciList,
  parseAhlatciDetail,
  parseFintablesSector,
} from '../public/core/parsers.js';

test('numTR handles Turkish decimal and thousands separators', () => {
  assert.equal(numTR('1.234,50 ₺'), 1234.5);
  assert.equal(numTR('94,00'), 94);
});

test('isoFromTurkishDate parses Turkish month names', () => {
  assert.equal(isoFromTurkishDate('21 Ağustos 2026'), '2026-08-21');
  assert.equal(isoFromTurkishDate('5 Subat 2026'), '2026-02-05');
});

test('parseYahooChart returns current, previous close and history', () => {
  const json = { chart: { result: [{
    meta: { regularMarketPrice: 15, chartPreviousClose: 14, currency: 'TRY', regularMarketTime: 1760000000 },
    timestamp: [1759900000, 1760000000],
    indicators: { quote: [{ close: [14, 15], high: [15,16], low: [13,14], open: [13.5,14.5] }] }
  }] } };
  const out = parseYahooChart(json, 'TEST');
  assert.equal(out.ticker, 'TEST');
  assert.equal(out.symbol, 'TEST.IS');
  assert.equal(out.current, 15);
  assert.equal(out.previousClose, 14);
  assert.equal(out.history.length, 2);
});

test('parseYahooChart rejects missing chart result', () => {
  assert.throws(() => parseYahooChart({ chart: { result: [] } }, 'TEST'), /Fiyat verisi bulunamadı/);
});

test('Ahlatcı parsers extract IPO price and first trade date', () => {
  const list = `<table><tr><td>Test AŞ TEST</td><td>x</td><td>94,00 ₺</td><td>18-19 Ağustos 2026</td><td><a href="/halka-arz/test">Detay</a></td></tr></table>`;
  const base = parseAhlatciList(list, 'TEST');
  assert.equal(base.ipoPrice, 94);
  assert.equal(base.company, 'Test AŞ');
  assert.equal(base.detailUrl, 'https://www.ahlatciyatirim.com.tr/halka-arz/test');
  const detail = parseAhlatciDetail(`<h1>Test AŞ</h1><div>Halka Arz Fiyatı 94,00 ₺ İlk İşlem Tarihi: 21 Ağustos 2026</div>`, base);
  assert.equal(detail.ipoPrice, 94);
  assert.equal(detail.firstTradeDate, '2026-08-21');
  assert.equal(detail.source, 'Ahlatcı Yatırım');
});

test('parseAhlatciList returns null when ticker is not in table', () => {
  assert.equal(parseAhlatciList('<table><tr><td>Other OTHR</td></tr></table>', 'TEST'), null);
});


test('parseYahooChart derives previous close from the trading day before latest market date', () => {
  const aug27 = Math.floor(new Date('2026-08-27T12:00:00Z').getTime()/1000);
  const aug28 = Math.floor(new Date('2026-08-28T12:00:00Z').getTime()/1000);
  const json = { chart: { result: [{
    meta: { regularMarketPrice:15, chartPreviousClose:9, regularMarketTime:aug28, exchangeTimezoneName:'Europe/Istanbul' },
    timestamp:[aug27, aug28],
    indicators:{ quote:[{ close:[14,15], high:[14,15], low:[14,15], open:[14,15] }] },
  }] } };
  const out = parseYahooChart(json, 'TEST');
  assert.equal(out.latestMarketDate, '2026-08-28');
  assert.equal(out.previousClose, 14);
});

test('parseFintablesSector extracts company sector label', () => {
  const html = '<html><body><div>Şirket Detayları</div><div>Sektörler</div><div>Enerji</div></body></html>';
  assert.equal(parseFintablesSector(html, 'TEST').sector, 'Enerji');
});

test('parseYahooChart uses latest completed row as previous close when today candle is not present yet', () => {
  const aug27 = Math.floor(new Date('2026-08-27T12:00:00Z').getTime()/1000);
  const aug28 = Math.floor(new Date('2026-08-28T12:00:00Z').getTime()/1000);
  const json = { chart: { result: [{
    meta: { regularMarketPrice:15, chartPreviousClose:9, regularMarketTime:aug28, exchangeTimezoneName:'Europe/Istanbul' },
    timestamp:[aug27],
    indicators:{ quote:[{ close:[14], high:[14], low:[14], open:[14] }] },
  }] } };
  const out = parseYahooChart(json, 'TEST');
  assert.equal(out.latestMarketDate, '2026-08-28');
  assert.equal(out.previousClose, 14);
});

test('parseFintablesSector prefers actual sector links and ignores page navigation spam', () => {
  const html = `
    <html><body>
      <div>Şirket Detayları</div>
      <div>Sektörler</div>
      <a href="/sektorler/gida-ve-icecek">Gıda ve İçecek</a>
      <a href="/sektorler/gida-perakendeciligi">Gıda Perakendeciliği</a>
      <div>Analizler Yeni Trade Ekranı Terminal Araştırma SPL Eğitimleri Giriş yap Ücretsiz kaydol Hisseler / CITAS Al / Sat CITAS Karşılaştır Çitlekçi Mağazacılık Gıda A.Ş. Özet Rapor</div>
    </body></html>`;
  assert.equal(parseFintablesSector(html, 'CITAS').sector, 'Gıda Perakendeciliği');
});

test('parseYahooChart prefers exchange previousClose when daily series skips the prior trading day', () => {
  const aug27 = Math.floor(new Date('2026-08-27T15:00:00Z').getTime()/1000);
  const aug31 = Math.floor(new Date('2026-08-31T10:15:00Z').getTime()/1000);
  const json = { chart: { result: [{
    meta: {
      regularMarketPrice:128,
      previousClose:142.20,
      chartPreviousClose:129.30,
      regularMarketTime:aug31,
      exchangeTimezoneName:'Europe/Istanbul',
    },
    timestamp:[aug27, aug31],
    indicators:{ quote:[{ close:[129.30,128], high:[129.30,145], low:[118.50,128], open:[124,145] }] },
  }] } };
  const out = parseYahooChart(json, 'CITAS');
  assert.equal(out.previousClose, 142.20);
});

test('parseYahooChart collapses intraday candles into one row per Istanbul trading date and uses freshest tick', () => {
  const aug28a = Math.floor(new Date('2026-08-28T07:05:00Z').getTime()/1000);
  const aug28b = Math.floor(new Date('2026-08-28T14:59:00Z').getTime()/1000);
  const aug31a = Math.floor(new Date('2026-08-31T07:05:00Z').getTime()/1000);
  const aug31b = Math.floor(new Date('2026-08-31T10:15:00Z').getTime()/1000);
  const json = { chart: { result: [{
    meta: { regularMarketPrice:128, previousClose:142.20, regularMarketTime:aug31b, exchangeTimezoneName:'Europe/Istanbul' },
    timestamp:[aug28a, aug28b, aug31a, aug31b],
    indicators:{ quote:[{
      close:[133,142.20,145,128], high:[134,142.20,145,145], low:[132.70,132.70,140,128], open:[134.70,133,145,140],
    }] },
  }] } };
  const out = parseYahooChart(json, 'CITAS');
  assert.deepEqual(out.history.map(row => row.date), ['2026-08-28','2026-08-31']);
  assert.equal(out.history[0].close, 142.20);
  assert.equal(out.current, 128);
  assert.equal(out.marketTime, new Date(aug31b * 1000).toISOString());
});

test('parseYahooChart never fabricates previous close from the current-session latest tick', () => {
  const aug31 = Math.floor(new Date('2026-08-31T10:15:00Z').getTime()/1000);
  const json = { chart: { result: [{
    meta: { regularMarketPrice:128, regularMarketTime:aug31, exchangeTimezoneName:'Europe/Istanbul' },
    timestamp:[aug31],
    indicators:{ quote:[{ close:[128], high:[128], low:[128], open:[128] }] },
  }] } };
  const out = parseYahooChart(json, 'CITAS');
  assert.equal(out.current, 128);
  assert.equal(out.previousClose, null);
});
