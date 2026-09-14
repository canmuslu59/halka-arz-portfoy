import test from 'node:test';
import assert from 'node:assert/strict';
import { getBistMarketStatus } from '../public/core/market-calendar.js';

test('BIST is open during normal weekday continuous session', () => {
  const status = getBistMarketStatus(new Date('2026-08-28T11:00:00Z')); // 14:00 Istanbul
  assert.equal(status.isOpen, true);
  assert.equal(status.label, 'AÇIK');
  assert.equal(status.closesAt, '2026-08-28T18:10:00+03:00');
});

test('BIST remains open through the normal closing phase and closes at 18:10 Istanbul', () => {
  const beforeClose = getBistMarketStatus(new Date('2026-08-28T15:09:59Z')); // 18:09:59 Istanbul
  const atClose = getBistMarketStatus(new Date('2026-08-28T15:10:00Z')); // 18:10 Istanbul
  assert.equal(beforeClose.isOpen, true);
  assert.equal(beforeClose.closesAt, '2026-08-28T18:10:00+03:00');
  assert.equal(atClose.isOpen, false);
  assert.equal(atClose.nextOpenAt, '2026-08-31T10:00:00+03:00');
});

test('BIST is closed on official 2026 full holiday', () => {
  const status = getBistMarketStatus(new Date('2026-07-15T08:00:00Z')); // 11:00 Istanbul
  assert.equal(status.isOpen, false);
  assert.match(status.reason, /tatil/i);
  assert.equal(status.nextOpenAt, '2026-07-16T10:00:00+03:00');
});

test('BIST half-day session closes at 12:40 on 28 October 2026', () => {
  const beforeClose = getBistMarketStatus(new Date('2026-10-28T09:39:59Z')); // 12:39:59
  const atClose = getBistMarketStatus(new Date('2026-10-28T09:40:00Z')); // 12:40
  assert.equal(beforeClose.isOpen, true);
  assert.equal(beforeClose.closesAt, '2026-10-28T12:40:00+03:00');
  assert.equal(atClose.isOpen, false);
  assert.equal(atClose.nextOpenAt, '2026-10-30T10:00:00+03:00');
});
