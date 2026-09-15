import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const durableStore = fs.readFileSync(new URL('../cloudflare/durable-store.js', import.meta.url), 'utf8');

test('closed-app Durable Object uses the same verified market reference path as foreground alerts', () => {
  assert.match(durableStore, /import \{ fetchVerifiedMarketQuote \} from ['"]\.\/market-quote\.js['"]/);
  assert.doesNotMatch(durableStore, /import \{ fetchYahooQuote \} from ['"]\.\/yahoo-quote\.js['"]/);
  assert.match(durableStore, /getQuote:ticker => fetchVerifiedMarketQuote\(ticker, \{/);
  assert.match(durableStore, /todayMarketDate:dateInIstanbul\(started\)/);
});

test('closed-app Durable Object passes Foreks and OYAK reference overrides when configured', () => {
  assert.match(durableStore, /foreksBase:this\.env\.FOREKS_REFERENCE_BASE/);
  assert.match(durableStore, /oyakBase:this\.env\.OYAK_REFERENCE_BASE/);
});
