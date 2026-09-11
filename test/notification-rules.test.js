import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAlertSettings,
  crossedThresholdLevels,
  evaluateDailyAlerts,
} from '../public/core/notification-rules.js';

test('alert settings default to enabled and 3 percent and snap to half points', () => {
  assert.deepEqual(normalizeAlertSettings(), { enabled:true, threshold:3 });
  assert.deepEqual(normalizeAlertSettings({ enabled:false, threshold:4.26 }), { enabled:false, threshold:4.5 });
  assert.deepEqual(normalizeAlertSettings({ enabled:true, threshold:99 }), { enabled:true, threshold:10 });
  assert.deepEqual(normalizeAlertSettings({ enabled:true, threshold:0 }), { enabled:true, threshold:1 });
});

test('crossedThresholdLevels returns each positive and negative multiple reached', () => {
  assert.deepEqual(crossedThresholdLevels(9.2, 3), [3, 6, 9]);
  assert.deepEqual(crossedThresholdLevels(-9.2, 3), [-3, -6, -9]);
  assert.deepEqual(crossedThresholdLevels(2.99, 3), []);
});

test('ordinary per-stock percentage moves never emit alerts', () => {
  const result = evaluateDailyAlerts({
    day:'2026-09-05', threshold:1, enabled:true,
    holdings:[{ ticker:'THYAO', dailyPct:9.8, currentPrice:109.8, previousClose:100, dailySessionActive:true }],
    portfolioPct:0,
  });
  assert.equal(result.events.some(event => event.kind === 'stock'), false);
  assert.equal(result.events.length, 0);
});

test('ceiling and floor alerts are delivered once per ticker per day', () => {
  const first = evaluateDailyAlerts({
    day:'2026-09-05', threshold:3, enabled:true,
    holdings:[
      { ticker:'THYAO', currentPrice:110, previousClose:100, dailySessionActive:true },
      { ticker:'EREGL', currentPrice:90, previousClose:100, dailySessionActive:true },
    ],
    portfolioPct:0,
  });
  assert.deepEqual(first.events.map(event => [event.kind,event.ticker]), [['ceiling','THYAO'],['floor','EREGL']]);

  const duplicate = evaluateDailyAlerts({
    day:'2026-09-05', threshold:3, enabled:true,
    holdings:[
      { ticker:'THYAO', currentPrice:110, previousClose:100, dailySessionActive:true },
      { ticker:'EREGL', currentPrice:90, previousClose:100, dailySessionActive:true },
    ],
    portfolioPct:0,
    previousState:first.state,
  });
  assert.deepEqual(duplicate.events, []);
});

test('intraday candle high and low preserve limit-touch alerts after price moves away', () => {
  const result = evaluateDailyAlerts({
    day:'2026-09-05', threshold:3, enabled:true,
    holdings:[
      { ticker:'THYAO', currentPrice:108, previousClose:100, sessionHigh:110, sessionLow:101, dailySessionActive:true },
      { ticker:'EREGL', currentPrice:92, previousClose:100, sessionHigh:99, sessionLow:90, dailySessionActive:true },
    ],
    portfolioPct:0,
  });
  assert.deepEqual(result.events.map(event => [event.kind,event.ticker]), [['ceiling','THYAO'],['floor','EREGL']]);
});

test('limit rules prefer explicit BIST reference price over previous close', () => {
  const result = evaluateDailyAlerts({
    day:'2026-09-11', threshold:3, enabled:true,
    holdings:[{
      ticker:'AAA',
      currentPrice:100,
      previousClose:90,
      referencePrice:95,
      dailySessionActive:true,
    }],
    portfolioPct:0,
  });
  assert.equal(result.events.some(event => event.kind === 'ceiling'), false);
});

test('portfolio positive levels are emitted and a new trading day resets delivery state', () => {
  const first = evaluateDailyAlerts({
    day:'2026-09-05', threshold:3, enabled:true,
    holdings:[], portfolioPct:6.1,
  });
  assert.deepEqual(first.events.map(event => [event.kind,event.level]), [['portfolio',3],['portfolio',6]]);

  const decline = evaluateDailyAlerts({
    day:'2026-09-05', threshold:3, enabled:true,
    holdings:[], portfolioPct:-9.1,
    previousState:first.state,
  });
  assert.deepEqual(decline.events, []);

  const reset = evaluateDailyAlerts({
    day:'2026-09-06', threshold:3, enabled:true,
    holdings:[], portfolioPct:3.1,
    previousState:first.state,
  });
  assert.deepEqual(reset.events.map(event => [event.kind,event.level]), [['portfolio',3]]);
  assert.equal(reset.state.day, '2026-09-06');
});

test('disabled alert tracking emits nothing and clears daily delivery state', () => {
  const result = evaluateDailyAlerts({
    day:'2026-09-05', threshold:3, enabled:false,
    holdings:[{ ticker:'THYAO', currentPrice:110, previousClose:100, dailySessionActive:true }], portfolioPct:8,
  });
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, { day:'2026-09-05', stocks:{}, portfolio:[], limits:{} });
});
