import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRegistrationAlerts, notificationForAlert } from '../backend/alert-engine.js';

const registration = {
  installId:'550e8400-e29b-41d4-a716-446655440000',
  enabled:true,
  threshold:3,
  holdings:[{ticker:'AAA',lots:10},{ticker:'BBB',lots:5}],
  alertState:null,
};

test('emits stock limit events only and keeps threshold alerts at portfolio level', () => {
  const quotes = new Map([
    ['AAA',{ticker:'AAA',current:110,previousClose:100,latestMarketDate:'2026-09-04'}],
    ['BBB',{ticker:'BBB',current:200,previousClose:200,latestMarketDate:'2026-09-04'}],
  ]);
  const result = evaluateRegistrationAlerts({ registration, quotes, day:'2026-09-04' });
  assert.equal(result.events.some(event => event.kind === 'stock'), false);
  assert.deepEqual(result.events.map(event => [event.kind,event.ticker || '',event.level ?? null]), [
    ['ceiling','AAA',null],
    ['portfolio','',3],
  ]);
  // Previous value = 2000, current = 2100 => +5% total portfolio.
  assert.equal(result.portfolioPct, 5);
});

test('deduplicates delivered limit/portfolio alerts and resets on a new BIST day', () => {
  const quotes = new Map([
    ['AAA',{ticker:'AAA',current:110,previousClose:100,latestMarketDate:'2026-09-04'}],
    ['BBB',{ticker:'BBB',current:200,previousClose:200,latestMarketDate:'2026-09-04'}],
  ]);
  const first = evaluateRegistrationAlerts({ registration, quotes, day:'2026-09-04' });
  const sameDay = evaluateRegistrationAlerts({ registration:{...registration,alertState:first.state}, quotes, day:'2026-09-04' });
  assert.equal(sameDay.events.length, 0);

  const nextQuotes = new Map([...quotes].map(([ticker, quote]) => [ticker, {...quote, latestMarketDate:'2026-09-05'}]));
  const newDay = evaluateRegistrationAlerts({ registration:{...registration,alertState:first.state}, quotes:nextQuotes, day:'2026-09-05' });
  assert.equal(newDay.events.length, first.events.length);
});

test('formats FCM data for ceiling, floor and positive portfolio routes', () => {
  assert.deepEqual(notificationForAlert({kind:'ceiling',ticker:'THYAO'}), {
    title:'THYAO tavan yaptı',
    body:'THYAO bugün tavan fiyatına ulaştı.',
    data:{kind:'ceiling',ticker:'THYAO',level:'0',dailyPct:'0'},
  });
  assert.deepEqual(notificationForAlert({kind:'floor',ticker:'EREGL'}), {
    title:'EREGL taban yaptı',
    body:'EREGL bugün taban fiyatına ulaştı.',
    data:{kind:'floor',ticker:'EREGL',level:'0',dailyPct:'0'},
  });
  assert.deepEqual(notificationForAlert({kind:'portfolio',level:3,dailyPct:3.1}), {
    title:'Portföy yükselişi',
    body:'Toplam portföy bugün +%3 seviyesini geçti.',
    data:{kind:'portfolio',ticker:'',level:'3',dailyPct:'3.1'},
  });
});
