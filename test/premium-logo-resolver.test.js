import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStockLogo, stockMonogram } from '../public/core/logo-resolver.js';

test('known BIST tickers resolve to official company domains over https', () => {
  const asels = resolveStockLogo('asels');
  assert.equal(asels.ticker, 'ASELS');
  assert.ok(asels.url.startsWith('https://'));
  assert.match(asels.url, /aselsan/i);

  const thyao = resolveStockLogo('THYAO');
  assert.match(thyao.url, /turkishairlines/i);
});

test('unknown stock logos fall back to deterministic ticker monograms', () => {
  const unknown = resolveStockLogo('xyzab');
  assert.equal(unknown.url, null);
  assert.equal(unknown.monogram, 'XYZ');
  assert.equal(stockMonogram(' kchol '), 'KCH');
});
