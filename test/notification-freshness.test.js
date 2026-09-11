import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { evaluateRegistrationAlerts } from '../backend/alert-engine.js';

const oneHolding = {
  enabled:true,
  threshold:3,
  holdings:[{ticker:'AAA',lots:10}],
  alertState:null,
};

test('same-day quote that is materially stale cannot emit market notifications', () => {
  const quotes = new Map([
    ['AAA',{
      ticker:'AAA',
      current:110,
      previousClose:100,
      sessionHigh:110,
      sessionLow:100,
      latestMarketDate:'2026-09-11',
      marketTime:'2026-09-11T07:00:00.000Z',
    }],
  ]);
  const result = evaluateRegistrationAlerts({
    registration:oneHolding,
    quotes,
    day:'2026-09-11',
    now:new Date('2026-09-11T07:30:01.000Z'),
  });
  assert.equal(result.portfolioPct, null);
  assert.deepEqual(result.events, []);
});

test('fresh same-day quote remains eligible for tavan and portfolio notifications', () => {
  const quotes = new Map([
    ['AAA',{
      ticker:'AAA',
      current:110,
      previousClose:100,
      sessionHigh:110,
      sessionLow:100,
      latestMarketDate:'2026-09-11',
      marketTime:'2026-09-11T07:25:00.000Z',
    }],
  ]);
  const result = evaluateRegistrationAlerts({
    registration:oneHolding,
    quotes,
    day:'2026-09-11',
    now:new Date('2026-09-11T07:30:00.000Z'),
  });
  assert.equal(result.portfolioPct, 10);
  assert.equal(result.events.some(event => event.kind === 'ceiling' && event.ticker === 'AAA'), true);
  assert.equal(result.events.some(event => event.kind === 'portfolio' && event.level === 3), true);
});

test('backend service supplies its injectable clock to freshness evaluation', async () => {
  const service = await fs.readFile('backend/service.js', 'utf8');
  assert.match(service, /evaluateRegistrationAlerts\s*\(\s*\{[\s\S]*registration\s*:\s*entry[\s\S]*quotes[\s\S]*day[\s\S]*now\s*:\s*now\(\)[\s\S]*\}\s*\)/,
    'production market checks must evaluate freshness against the same injectable service clock');
});

test('native worker rejects a same-day quote whose effective market timestamp is too old', async () => {
  const worker = await fs.readFile('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java', 'utf8');
  assert.match(worker, /MAX_QUOTE_AGE_SECONDS\s*=\s*15\s*\*\s*60/,
    'native polling needs an explicit bounded quote-age window');
  assert.match(worker, /final\s+long\s+marketEpoch/,
    'the parsed effective Yahoo market timestamp must survive in the native Quote model');
  assert.match(worker, /isFreshMarketQuote\s*\(/,
    'native alert eligibility must classify quote freshness');
  assert.match(worker, /Instant\.now\(\)\.getEpochSecond\(\)/,
    'native freshness must compare against the actual worker run time');
  assert.match(worker, /!isFreshMarketQuote\(quote,\s*nowEpoch\)/,
    'stale same-day quotes must be rejected before tavan/taban or portfolio evaluation');
});
