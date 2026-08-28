import test from 'node:test';
import assert from 'node:assert/strict';
import { getBistMarketStatus } from '../public/core/market-calendar.js';

test('BIST is open during normal weekday continuous session', () => {
  const status = getBistMarketStatus(new Date('2026-08-28T11:00:00Z')); // 14:00 Istanbul
  assert.equal(status.isOpen, true);
  assert.equal(status.label, 'AÇIK');
  assert.equal(status.closesAt, '2026-08-28T18:00:00+03:00');
});

test('BIST closes after 18:00 and points to next weekday opening', () => {
  const status = getBistMarketStatus(new Date('2026-08-28T19:23:00Z')); // 22:23 Istanbul, Friday
  assert.equal(status.isOpen, false);
  assert.equal(status.nextOpenAt, '2026-08-31T10:00:00+03:00');
});

test('BIST is closed on official 2026 full holiday', () => {
  const status = getBistMarketStatus(new Date('2026-07-15T08:00:00Z')); // 11:00 Istanbul
  assert.equal(status.isOpen, false);
  assert.match(status.reason, /tatil/i);
  assert.equal(status.nextOpenAt, '2026-07-16T10:00:00+03:00');
});

test('BIST half-day closes at 13:00 on 28 October 2026', () => {
  const morning = getBistMarketStatus(new Date('2026-10-28T08:00:00Z')); // 11:00
  const afternoon = getBistMarketStatus(new Date('2026-10-28T11:00:00Z')); // 14:00
  assert.equal(morning.isOpen, true);
  assert.equal(morning.closesAt, '2026-10-28T13:00:00+03:00');
  assert.equal(afternoon.isOpen, false);
  assert.equal(afternoon.nextOpenAt, '2026-10-30T10:00:00+03:00');
});
