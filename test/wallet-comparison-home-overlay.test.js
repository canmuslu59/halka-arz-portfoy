import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overlay = readFileSync(new URL('../scripts/apply-test-share-ui.mjs', import.meta.url), 'utf8');

test('test home restores a compact wallet card instead of full-viewport hero', () => {
  assert.match(overlay, />Cüzdan</);
  assert.match(overlay, /wallet-home-card/);
  assert.doesNotMatch(overlay, /100dvh/);
});

test('test home adds a compact daily comparison card below wallet', () => {
  assert.match(overlay, /comparisonCard/);
  assert.match(overlay, /Günlük karşılaştırma/);
  assert.match(overlay, /Portföy/);
  assert.match(overlay, /Altın \(TL\)/);
  assert.match(overlay, /BIST 100/);
  assert.match(overlay, /Dolar/);
});

test('comparison data is display-only and uses Yahoo references without changing portfolio calculations', () => {
  assert.match(overlay, /GC=F/);
  assert.match(overlay, /XU100\.IS/);
  assert.match(overlay, /TRY=X/);
  assert.match(overlay, /loadHomeComparison/);
  assert.doesNotMatch(overlay, /calculateTotals\s*=|evaluateDailyAlerts\s*=|notificationPayloadForEvent\s*=/);
});

test('existing image share bridge remains preserved', () => {
  assert.match(overlay, /shareCardImage/);
  assert.match(overlay, /portfolio-card\.png/);
  assert.match(overlay, /FileProvider/);
});
