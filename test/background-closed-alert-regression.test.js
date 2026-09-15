import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateRegistrationAlerts } from '../backend/alert-engine.js';

const durableStore = fs.readFileSync(new URL('../cloudflare/durable-store.js', import.meta.url), 'utf8');

test('closed-app Durable Object uses the same verified market reference path as foreground alerts', () => {
  assert.match(durableStore, /import \{ fetchVerifiedMarketQuote \} from ['"]\.\/market-quote\.js['"]/);
  assert.doesNotMatch(durableStore, /import \{ fetchYahooQuote \} from ['"]\.\/yahoo-quote\.js['"]/);
  assert.match(durableStore, /getQuote:ticker => fetchVerifiedMarketQuote\(ticker, \{/);
  assert.match(durableStore, /fetchImpl:globalThis\.fetch/);
  assert.match(durableStore, /now:\(\)=>startedMs/);
});

test('closed-app portfolio alert ignores an unverified reference but crosses -1% and -2% with a verified -2% quote', () => {
  const registration = {
    enabled:true,
    threshold:1,
    holdings:[{ ticker:'TEST', lots:10, ipoPrice:100 }],
    alertState:null,
  };
  const day = '2026-09-15';
  const unverified = evaluateRegistrationAlerts({
    registration,
    day,
    quotes:new Map([['TEST', {
      ticker:'TEST', current:98, previousClose:100, latestMarketDate:day, referenceVerified:false,
    }]]),
  });
  assert.equal(unverified.events.length, 0);

  const verified = evaluateRegistrationAlerts({
    registration,
    day,
    quotes:new Map([['TEST', {
      ticker:'TEST', current:98, previousClose:100, latestMarketDate:day, referenceVerified:true,
    }]]),
  });
  assert.equal(verified.portfolioPct, -2);
  assert.deepEqual(verified.events.map(event => [event.kind, event.level]), [
    ['portfolio', -1],
    ['portfolio', -2],
  ]);
});
