import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { calculateHolding } from '../public/core/domain.js';
import { parseYahooChart } from '../public/core/parsers.js';

const mainActivityPath = new URL('../android/app/src/main/java/com/innative/halkaarz/MainActivity.java', import.meta.url);
const appPath = new URL('../public/app.js', import.meta.url);

test('Android WebView installs a WebChromeClient so JavaScript confirm() can be answered by the user', async () => {
  const source = await fs.readFile(mainActivityPath, 'utf8');
  assert.match(source, /import android\.webkit\.WebChromeClient;/);
  assert.match(source, /setWebChromeClient\(new WebChromeClient\(\)\)/);
});

test('startup does not overwrite the last native push registration with an empty portfolio before load completes', async () => {
  const source = await fs.readFile(appPath, 'utf8');
  const startup = source.slice(source.lastIndexOf('initTheme();'));
  assert.doesNotMatch(startup, /initTheme\(\);\s*syncPushConfiguration\(\);/);
  assert.match(source, /state\.portfolio\s*=\s*fresh;[\s\S]{0,500}syncPushConfiguration\(\);/);
});

test('an undated quote is never treated as the current Istanbul trading session', () => {
  const holding = calculateHolding({
    ticker: 'TEST',
    initialLots: 100,
    currentLots: 100,
    ipoPrice: 10,
    currentPrice: 9.9,
    previousClose: 10,
    latestMarketDate: null,
    sales: [],
  }, { today: '2026-09-15' });

  assert.equal(holding.dailySessionActive, false);
  assert.equal(holding.dailyProfit, 0);
  assert.equal(holding.dailyPct, 0);
});

test('runtime web JavaScript avoids Array at/findLast/findLastIndex for older Android WebViews', async () => {
  const roots = [new URL('../public/', import.meta.url)];
  const offenders = [];
  async function walk(url) {
    const entries = await fs.readdir(url, { withFileTypes:true });
    for (const entry of entries) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
      if (entry.isDirectory()) await walk(child);
      else if (entry.name.endsWith('.js')) {
        const text = await fs.readFile(child, 'utf8');
        if (/\.at\s*\(|\.findLast(?:Index)?\s*\(/.test(text)) offenders.push(child.pathname);
      }
    }
  }
  for (const root of roots) await walk(root);
  assert.deepEqual(offenders, []);
});

test('Yahoo price parsing still works when newer Array at/findLast/findLastIndex methods are unavailable', () => {
  const methods = ['at', 'findLast', 'findLastIndex'];
  const saved = new Map(methods.map(name => [name, Object.getOwnPropertyDescriptor(Array.prototype, name)]));
  try {
    for (const name of methods) Object.defineProperty(Array.prototype, name, { configurable: true, writable: true, value: undefined });

    const first = Math.floor(new Date('2026-09-12T15:00:00+03:00').getTime() / 1000);
    const latest = Math.floor(new Date('2026-09-15T12:00:00+03:00').getTime() / 1000);
    const parsed = parseYahooChart({
      chart: {
        result: [{
          meta: {
            currency: 'TRY',
            exchangeTimezoneName: 'Europe/Istanbul',
            regularMarketPrice: 9.9,
            regularMarketTime: latest,
            previousClose: 10,
          },
          timestamp: [first, latest],
          indicators: { quote: [{ close: [10, 9.9], high: [10.1, 10], low: [9.8, 9.8], open: [10, 10] }] },
        }],
      },
    }, 'TEST');

    assert.equal(parsed.current, 9.9);
    assert.equal(parsed.previousClose, 10);
    assert.equal(parsed.latestMarketDate, '2026-09-15');
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(Array.prototype, name, descriptor);
      else delete Array.prototype[name];
    }
  }
});
