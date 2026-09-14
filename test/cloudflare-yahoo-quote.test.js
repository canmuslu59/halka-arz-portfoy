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
