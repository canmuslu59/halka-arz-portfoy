import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRepository } from '../public/core/repository.js';
import { createPortfolioService } from '../public/core/portfolio-service.js';
import { parseOfferWindow } from '../public/core/ipo-service.js';
import { getBistMarketStatus } from '../public/core/market-calendar.js';
import { createProAccess } from '../public/core/pro-access.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function memoryRepository() {
  let raw = null;
  return createRepository({ get: async () => raw, set: async value => { raw = value; } });
}

function market() {
  return {
    ticker:'TEST', symbol:'TEST.IS', current:15, previousClose:14,
    marketTime:'2026-09-11T09:00:00.000Z', latestMarketDate:'2026-09-11',
    history:[{ date:'2026-09-10', close:14 }, { date:'2026-09-11', close:15 }],
  };
}

function ipo() {
  return { ticker:'TEST', company:'Test AŞ', ipoPrice:10, firstTradeDate:'2026-09-01', offerDates:'1-2 Eylül 2026', source:'Test' };
}

test('future-dated sales are rejected and do not reduce current lots', async () => {
  const service = createPortfolioService({
    repository:memoryRepository(), getMarket:async()=>market(), getIpo:async()=>ipo(),
    now:()=>new Date('2026-09-11T12:00:00+03:00'), uuid:(()=>{let i=0; return()=>`id-${++i}`;})(),
  });
  const { holding } = await service.addHolding({ ticker:'TEST', lots:100 });
  await assert.rejects(
    () => service.addSale(holding.id, { lots:10, price:20, date:'2026-12-01' }),
    /gelecek/i,
  );
  const portfolio = await service.getPortfolio({ refresh:false });
  assert.equal(portfolio.holdings[0].currentLots, 100);
  assert.equal(portfolio.holdings[0].sales.length, 0);
});

test('offer windows crossing New Year assign the first date to the previous year', () => {
  assert.deepEqual(parseOfferWindow('30 Aralık - 2 Ocak 2027'), {
    start:'2026-12-30',
    end:'2027-01-02',
  });
});

test('2027 religious public holidays close or shorten the BIST session', () => {
  const ramadanEve = getBistMarketStatus(new Date('2027-03-08T14:00:00+03:00'));
  assert.equal(ramadanEve.isOpen, false);
  assert.equal(ramadanEve.reason, 'Seans kapandı');

  const ramadan = getBistMarketStatus(new Date('2027-03-09T11:00:00+03:00'));
  assert.equal(ramadan.isOpen, false);
  assert.equal(ramadan.reason, 'Resmî tatil');

  const sacrifice = getBistMarketStatus(new Date('2027-05-17T11:00:00+03:00'));
  assert.equal(sacrifice.isOpen, false);
  assert.equal(sacrifice.reason, 'Resmî tatil');
});

test('calendar auto-refresh forces a network refresh instead of only re-rendering cached state', async () => {
  const app = await read('public/app.js');
  assert.match(app, /state\.view === 'calendar'\) loadIpoCalendar\(\{\s*force:\s*true\s*\}\)/);
});

test('foreground notification state is persisted only after native notification delivery succeeds', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const app = await read('public/app.js');
  assert.match(main, /public boolean showLocalNotification\(String json\)/);
  assert.match(main, /return NotificationHelper\.show\(activity, data\)/);
  assert.match(app, /deliveredCount\s*\+=\s*1/);
  assert.match(app, /result\.events\.length\s*===\s*0\s*\|\|\s*deliveredCount\s*===\s*result\.events\.length/);
  assert.doesNotMatch(app, /safeSetLocal\(LOCAL_ALERT_STATE_KEY, JSON\.stringify\(result\.state\)\);\s*for \(const event of result\.events\)/);
});

test('privacy page and every imported PWA module are packaged in the offline asset list', async () => {
  const index = await read('public/index.html');
  const privacy = await read('public/privacy.html');
  const sw = await read('public/sw.js');
  assert.match(index, /href="\.\/privacy\.html"/);
  assert.match(privacy, /Gizlilik Politikası/i);
  assert.match(sw, /\.\/privacy\.html/);
  assert.match(sw, /\.\/core\/gedik-calendar\.js/);
});

test('IPO notification deep-link consumes the pending ticker and focuses the matching calendar card', async () => {
  const app = await read('public/app.js');
  assert.match(app, /data-ipo-ticker/);
  assert.match(app, /pushFocusIpo/);
  assert.match(app, /scrollIntoView/);
  assert.match(app, /safeSetLocal\('pushFocusIpo',\s*''\)/);
});

test('Google Play review access is temporary rather than a permanent localStorage unlock', () => {
  const values = new Map();
  const storage = {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key,value) => values.set(key, String(value)),
  };
  let now = Date.parse('2026-09-11T12:00:00+03:00');
  const access = createProAccess(storage, { now:()=>now });
  assert.equal(access.enableReviewAccess('GPLAY-REVIEW-HA11-2026'), true);
  assert.equal(access.getState().status, 'review');
  now += 25 * 60 * 60 * 1000;
  assert.notEqual(access.getState().status, 'review');
});
