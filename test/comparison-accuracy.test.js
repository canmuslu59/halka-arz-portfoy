import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparisonSeriesFromYahoo,
  comparisonWindowFromBist,
  percentageMoveBetweenDates,
  combinedPercentageMoveBetweenDates,
  compoundedPortfolioMove,
} from '../public/core/comparison-math.js';

test('Yahoo daily chart is converted into dated Istanbul close rows', () => {
  const stamp = Math.floor(new Date('2026-09-18T12:00:00Z').getTime() / 1000);
  const rows = comparisonSeriesFromYahoo({
    chart:{ result:[{ timestamp:[stamp], indicators:{ quote:[{ close:[13284.42] }] } }] },
  });
  assert.deepEqual(rows, [{ date:'2026-09-18', close:13284.42 }]);
});

test('daily BIST comparison is inactive on Saturday instead of replaying Friday as today', () => {
  const bist = [
    { date:'2026-09-17', close:13509.76 },
    { date:'2026-09-18', close:13284.42 },
  ];
  const window = comparisonWindowFromBist(bist, 'daily', {
    today:'2026-09-19',
    sessions:{ daily:1, weekly:5, monthly:22 },
  });
  assert.deepEqual(window, {
    range:'daily',
    startDate:'2026-09-17',
    endDate:'2026-09-18',
    sessionActive:false,
  });
});

test('daily BIST comparison is active only when the latest BIST date is today', () => {
  const bist = [
    { date:'2026-09-17', close:100 },
    { date:'2026-09-18', close:102 },
  ];
  const window = comparisonWindowFromBist(bist, 'daily', {
    today:'2026-09-18',
    sessions:{ daily:1, weekly:5, monthly:22 },
  });
  assert.equal(window.sessionActive, true);
  assert.ok(Math.abs(percentageMoveBetweenDates(bist, window.startDate, window.endDate) - 2) < 1e-12);
});

test('weekly and monthly reference windows are selected from BIST sessions', () => {
  const bistDates = ["2026-08-19","2026-08-20","2026-08-21","2026-08-24","2026-08-25","2026-08-26","2026-08-27","2026-08-28","2026-08-31","2026-09-01","2026-09-02","2026-09-03","2026-09-04","2026-09-07","2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-14","2026-09-15","2026-09-16","2026-09-17","2026-09-18"];
  const bist = bistDates.map((date, index) => ({ date, close:100 + index }));
  const weekly = comparisonWindowFromBist(bist, 'weekly', {
    today:'2026-09-30',
    sessions:{ daily:1, weekly:5, monthly:22 },
  });
  const monthly = comparisonWindowFromBist(bist, 'monthly', {
    today:'2026-09-30',
    sessions:{ daily:1, weekly:5, monthly:22 },
  });
  assert.equal(weekly.startDate, bist.at(-6).date);
  assert.equal(weekly.endDate, bist.at(-1).date);
  assert.equal(monthly.startDate, bist[0].date);
  assert.equal(monthly.endDate, bist.at(-1).date);
});

test('reference assets use the exact same BIST start and end dates', () => {
  const usd = [
    { date:'2026-09-10', close:40 },
    { date:'2026-09-11', close:41 },
    { date:'2026-09-12', close:99 },
    { date:'2026-09-18', close:42 },
    { date:'2026-09-19', close:100 },
  ];
  const move = percentageMoveBetweenDates(usd, '2026-09-10', '2026-09-18');
  assert.ok(Math.abs(move - 5) < 1e-12);
});

test('gold TL proxy combines gold USD and USDTRY levels on the same dates', () => {
  const gold = [
    { date:'2026-09-10', close:2000 },
    { date:'2026-09-18', close:2100 },
  ];
  const usd = [
    { date:'2026-09-10', close:40 },
    { date:'2026-09-18', close:42 },
  ];
  const move = combinedPercentageMoveBetweenDates(gold, usd, '2026-09-10', '2026-09-18');
  assert.ok(Math.abs(move - 10.25) < 1e-12);
});

test('portfolio range return compounds cash-flow-neutral daily returns instead of raw wallet growth', () => {
  const history = [
    { date:'2026-09-11', value:100000, dailyPct:0, complete:true },
    { date:'2026-09-12', value:110000, dailyPct:10, complete:true },
    // 50k new capital is added here. Raw wallet value jumps, but performance is 0%.
    { date:'2026-09-15', value:160000, dailyPct:0, capitalAdded:50000, complete:true },
    { date:'2026-09-16', value:168000, dailyPct:5, complete:true },
  ];
  const move = compoundedPortfolioMove(history, '2026-09-11', '2026-09-16');
  assert.ok(Math.abs(move - 15.5) < 1e-12);
});

test('portfolio comparison refuses partial history instead of presenting a misleading return', () => {
  const history = [
    { date:'2026-09-11', value:100000, dailyPct:0, complete:true },
    { date:'2026-09-12', value:null, dailyPct:null, complete:false },
    { date:'2026-09-16', value:105000, dailyPct:2, complete:true },
  ];
  assert.equal(compoundedPortfolioMove(history, '2026-09-11', '2026-09-16'), null);
});

test('aligned move returns null when either exact endpoint is missing', () => {
  const usd = [
    { date:'2026-09-10', close:40 },
    { date:'2026-09-17', close:42 },
  ];
  assert.equal(percentageMoveBetweenDates(usd, '2026-09-10', '2026-09-18'), null);
});
