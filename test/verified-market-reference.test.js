import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseForeksReferenceText,
  parseOyakReferenceText,
  applyTrustedMarketReference,
} from '../public/core/market-reference.js';
import { evaluateDailyAlerts } from '../public/core/notification-rules.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Foreks reference parser extracts previous close, floor and ceiling', () => {
  const text = 'Hisse Detay Haftalık (%) 9,47 Tavan 3,17 Aylık (%) 5,86 Düşük 2,84 Yüksek 2,96 Taban 2,61 Önceki G. Kapanış 2,86';
  assert.deepEqual(parseForeksReferenceText(text, 'HEKTS'), {
    ticker:'HEKTS', previousClose:2.86, floorPrice:2.61, ceilingPrice:3.17, source:'foreks',
  });
});

test('OYAK reference parser extracts previous close, floor and ceiling', () => {
  const text = 'Son Fark Değişim Alış Satış Taban Tavan Saat 127,600 0,000 %0,00 127,600 127,800 114,900 140,300 18:09:54 Günlük Veriler Kapanış En Düşük En Yüksek Önceki Kapanış Ağırlıklı Ortalama Günlük 127,600 126,400 135,500 127,900 132,113';
  assert.deepEqual(parseOyakReferenceText(text, 'VEYAS'), {
    ticker:'VEYAS', previousClose:127.9, floorPrice:114.9, ceilingPrice:140.3, source:'oyak-foreks',
  });
});

test('trusted reference replaces Yahoo previousClose and carries exact exchange limits', () => {
  const merged = applyTrustedMarketReference(
    { ticker:'VEYAS', current:118.7, previousClose:132, latestMarketDate:'2026-09-15' },
    { ticker:'VEYAS', previousClose:119.8, floorPrice:107.9, ceilingPrice:131.7, source:'foreks' },
  );
  assert.equal(merged.previousClose, 119.8);
  assert.equal(merged.floorPrice, 107.9);
  assert.equal(merged.ceilingPrice, 131.7);
  assert.equal(merged.referenceSource, 'foreks');
  assert.equal(merged.referenceVerified, true);
});

test('limit alerts use trusted explicit floor and ceiling, not a synthetic ±10% calculation', () => {
  const result = evaluateDailyAlerts({
    day:'2026-09-15', threshold:1, enabled:true, portfolioPct:0,
    holdings:[{
      ticker:'VEYAS', currentPrice:118.7, previousClose:119.8, dailySessionActive:true,
      floorPrice:107.9, ceilingPrice:131.7, referenceVerified:true,
    }],
  });
  assert.deepEqual(result.events, []);
});

test('limit alerts fire when Yahoo current reaches a verified external limit', () => {
  const result = evaluateDailyAlerts({
    day:'2026-09-15', threshold:1, enabled:true, portfolioPct:0,
    holdings:[{
      ticker:'VEYAS', currentPrice:107.9, previousClose:119.8, dailySessionActive:true,
      floorPrice:107.9, ceilingPrice:131.7, referenceVerified:true,
    }],
  });
  assert.deepEqual(result.events.map(event => event.kind), ['floor']);
});

test('Android fallback requires trusted daily reference and allows Foreks/OYAK hosts', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  const policy = await read('android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java');
  assert.match(worker, /fetchTrustedMarketReference/);
  assert.match(worker, /reference\.previousClose/);
  assert.match(worker, /reference\.floorPrice/);
  assert.match(worker, /reference\.ceilingPrice/);
  assert.match(policy, /webservice\.foreks\.com/);
  assert.match(policy, /oyakyatirim\.com\.tr/);
});
