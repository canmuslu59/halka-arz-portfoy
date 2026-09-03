import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDailyChange, normalizeAlertThreshold, transitionAlertState } from '../public/core/alert-policy.js';

test('threshold accepts decimal percentages and rejects unsafe values', () => {
  assert.equal(normalizeAlertThreshold('3'), 3);
  assert.equal(normalizeAlertThreshold('2,5'), 2.5);
  assert.equal(normalizeAlertThreshold('0.1'), 0.1);
  assert.equal(normalizeAlertThreshold('0'), null);
  assert.equal(normalizeAlertThreshold('101'), null);
  assert.equal(normalizeAlertThreshold('abc'), null);
});

test('daily change enters upper and lower alert zones exactly at the configured threshold', () => {
  assert.equal(classifyDailyChange(2.99, 3), 'neutral');
  assert.equal(classifyDailyChange(3, 3), 'up');
  assert.equal(classifyDailyChange(-2.99, 3), 'neutral');
  assert.equal(classifyDailyChange(-3, 3), 'down');
});

test('same stock notifies only when it enters an alert zone and can notify again after returning to neutral', () => {
  const first = transitionAlertState(null, { tradingDate:'2026-09-03', dailyPct:3.2, threshold:3 });
  assert.deepEqual(first, { tradingDate:'2026-09-03', zone:'up', shouldNotify:true });

  const repeated = transitionAlertState(first, { tradingDate:'2026-09-03', dailyPct:4.1, threshold:3 });
  assert.deepEqual(repeated, { tradingDate:'2026-09-03', zone:'up', shouldNotify:false });

  const reset = transitionAlertState(repeated, { tradingDate:'2026-09-03', dailyPct:1.4, threshold:3 });
  assert.deepEqual(reset, { tradingDate:'2026-09-03', zone:'neutral', shouldNotify:false });

  const crossedAgain = transitionAlertState(reset, { tradingDate:'2026-09-03', dailyPct:3.05, threshold:3 });
  assert.deepEqual(crossedAgain, { tradingDate:'2026-09-03', zone:'up', shouldNotify:true });
});

test('a new trading day resets the previous alert zone', () => {
  const previous = { tradingDate:'2026-09-02', zone:'up', shouldNotify:false };
  const next = transitionAlertState(previous, { tradingDate:'2026-09-03', dailyPct:3.4, threshold:3 });
  assert.deepEqual(next, { tradingDate:'2026-09-03', zone:'up', shouldNotify:true });
});
