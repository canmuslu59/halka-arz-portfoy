import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchYahooQuote } from '../cloudflare/yahoo-quote.js';

test('Cloudflare Yahoo quote prefers exchange previousClose over chartPreviousClose', async () => {
  const epoch = Math.floor(new Date('2026-08-31T10:15:00Z').getTime() / 1000);
  const quote = await fetchYahooQuote('CITAS', {
    fetchImpl:async () => new Response(JSON.stringify({
      chart:{result:[{
        meta:{
          regularMarketPrice:128,
          previousClose:142.20,
          chartPreviousClose:129.30,
          regularMarketTime:epoch,
        },
        timestamp:[epoch],
      }]},
    }), {status:200,headers:{'content-type':'application/json'}}),
  });

  assert.equal(quote.current, 128);
  assert.equal(quote.previousClose, 142.20);
  assert.equal(quote.latestMarketDate, '2026-08-31');
});

test('Cloudflare Yahoo quote prefers a newer intraday candle over stale metadata', async () => {
  const staleEpoch = Math.floor(new Date('2026-09-13T10:00:00Z').getTime() / 1000);
  const freshEpoch = Math.floor(new Date('2026-09-14T10:15:00Z').getTime() / 1000);
  const quote = await fetchYahooQuote('AAA', {
    fetchImpl:async () => new Response(JSON.stringify({
      chart:{result:[{
        meta:{
          regularMarketPrice:100,
          previousClose:99,
          regularMarketTime:staleEpoch,
        },
        timestamp:[staleEpoch,freshEpoch],
        indicators:{quote:[{close:[100,105]}]},
      }]},
    }), {status:200,headers:{'content-type':'application/json'}}),
  });

  assert.equal(quote.current, 105);
  assert.equal(quote.previousClose, 99);
  assert.equal(quote.latestMarketDate, '2026-09-14');
});

test('Cloudflare Yahoo quote recovers previous close from the latest prior-session candle', async () => {
  const priorEpoch = Math.floor(new Date('2026-09-13T15:00:00Z').getTime() / 1000);
  const currentEpoch = Math.floor(new Date('2026-09-14T10:15:00Z').getTime() / 1000);
  const quote = await fetchYahooQuote('BBB', {
    fetchImpl:async () => new Response(JSON.stringify({
      chart:{result:[{
        meta:{ regularMarketPrice:101, regularMarketTime:currentEpoch },
        timestamp:[priorEpoch,currentEpoch],
        indicators:{quote:[{close:[99,101]}]},
      }]},
    }), {status:200,headers:{'content-type':'application/json'}}),
  });

  assert.equal(quote.current, 101);
  assert.equal(quote.previousClose, 99);
  assert.equal(quote.latestMarketDate, '2026-09-14');
});
