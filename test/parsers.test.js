import test from 'node:test';
import assert from 'node:assert/strict';
import {
  numTR,
  isoFromTurkishDate,
  parseYahooChart,
  parseAhlatciList,
  parseAhlatciDetail,
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
