import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const WORKER = 'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java';
const readWorker = () => fs.readFile(WORKER, 'utf8');

test('background quote parser prefers a newer intraday candle over stale Yahoo metadata', async () => {
  const worker = await readWorker();
  assert.match(worker, /long\s+latestTickEpoch\s*=\s*0L/);
  assert.match(worker, /double\s+latestTickClose\s*=\s*Double\.NaN/);
  assert.match(worker, /long\s+effectiveMarketEpoch\s*=\s*Math\.max\(metaMarketEpoch,\s*latestTickEpoch\)/);
  assert.match(worker, /if\s*\(latestTickEpoch\s*>\s*metaMarketEpoch\)\s*current\s*=\s*latestTickClose;/);
});

test('background quote parser recovers previous close from the latest prior-session candle', async () => {
  const worker = await readWorker();
  assert.match(worker, /double\s+previousSessionClose\s*=\s*Double\.NaN/);
  assert.match(worker, /if\s*\(tickDate\.isBefore\(effectiveMarketDate\)\)\s*\{/);
  assert.match(worker, /previousSessionClose\s*=\s*close;/);
  assert.match(worker, /if\s*\(!Double\.isFinite\(previousClose\)\)\s*previousClose\s*=\s*previousSessionClose;/);
});

test('background quote parser carries candle high and low into tavan/taban evaluation', async () => {
  const worker = await readWorker();
  assert.match(worker, /JSONArray\s+highs\s*=\s*quote\s*==\s*null\s*\?\s*null\s*:\s*quote\.optJSONArray\("high"\)/);
  assert.match(worker, /JSONArray\s+lows\s*=\s*quote\s*==\s*null\s*\?\s*null\s*:\s*quote\.optJSONArray\("low"\)/);
  assert.match(worker, /final\s+double\s+sessionHigh/);
  assert.match(worker, /final\s+double\s+sessionLow/);
  assert.match(worker, /quote\.sessionHigh\s*>=\s*ceiling\s*-\s*ceilingTolerance/);
  assert.match(worker, /quote\.sessionLow\s*<=\s*floor\s*\+\s*floorTolerance/);
});
