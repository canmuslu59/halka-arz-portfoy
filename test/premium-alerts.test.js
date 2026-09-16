import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validatePremiumRule,
  createPremiumRuleStore,
  evaluatePremiumRules,
} from '../public/core/premium-alerts.js';

function storageMock() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

test('premium rule validation accepts supported stock and portfolio rules', () => {
  const price = validatePremiumRule({ id:'r1', type:'price_above', ticker:'asels', value:125.5, enabled:true });
  assert.equal(price.ticker, 'ASELS');
  assert.equal(price.value, 125.5);
  assert.equal(price.enabled, true);

  const portfolio = validatePremiumRule({ id:'r2', type:'portfolio_negative', value:2.5 });
  assert.equal(portfolio.value, 2.5);
  assert.equal(portfolio.ticker, null);
  assert.equal(portfolio.enabled, true);

  assert.equal(validatePremiumRule({ type:'stock_daily_rise', ticker:'BIMAS', value:2 }).type, 'stock_daily_rise');
  assert.equal(validatePremiumRule({ type:'stock_daily_fall', ticker:'TUPRS', value:2 }).type, 'stock_daily_fall');
});

test('premium rule validation rejects invalid ticker, price and percentages', () => {
  assert.throws(() => validatePremiumRule({ type:'price_above', ticker:'', value:100 }), /hisse kodu/i);
  assert.throws(() => validatePremiumRule({ type:'price_below', ticker:'ASELS', value:0 }), /fiyat/i);
  assert.throws(() => validatePremiumRule({ type:'stock_daily_pct', ticker:'THYAO', value:-2 }), /yüzde/i);
  assert.throws(() => validatePremiumRule({ type:'stock_daily_rise', ticker:'THYAO', value:0 }), /yüzde/i);
  assert.throws(() => validatePremiumRule({ type:'unknown', value:2 }), /alarm türü/i);
});

test('premium rule store persists, updates, toggles and removes rules without production keys', () => {
  const storage = storageMock();
  const store = createPremiumRuleStore(storage, { now:() => 123456 });
  const created = store.upsert({ type:'price_above', ticker:'ASELS', value:120 });
  assert.ok(created.id.startsWith('pr_'));
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].ticker, 'ASELS');

  store.upsert({ ...created, value:130 });
  assert.equal(store.list()[0].value, 130);
  store.setEnabled(created.id, false);
  assert.equal(store.list()[0].enabled, false);
  store.remove(created.id);
  assert.deepEqual(store.list(), []);
  assert.equal(storage.getItem('alertEnabled'), null);
});

test('premium rule evaluator handles target prices, directional stock moves, portfolio moves and verified limits locally', () => {
  const rules = [
    { id:'a', type:'price_above', ticker:'ASELS', value:120, enabled:true },
    { id:'b', type:'price_below', ticker:'THYAO', value:280, enabled:true },
    { id:'c', type:'stock_daily_pct', ticker:'ASELS', value:3, enabled:true },
    { id:'r', type:'stock_daily_rise', ticker:'ASELS', value:3, enabled:true },
    { id:'rf', type:'stock_daily_rise', ticker:'THYAO', value:1, enabled:true },
    { id:'f1', type:'stock_daily_fall', ticker:'THYAO', value:1, enabled:true },
    { id:'ff', type:'stock_daily_fall', ticker:'ASELS', value:3, enabled:true },
    { id:'d', type:'portfolio_positive', value:2, enabled:true },
    { id:'e', type:'portfolio_negative', value:2, enabled:true },
    { id:'f', type:'ceiling', ticker:'ASELS', value:null, enabled:true },
    { id:'g', type:'floor', ticker:'THYAO', value:null, enabled:true },
  ].map(validatePremiumRule);

  const events = evaluatePremiumRules({
    portfolioDailyPct:2.4,
    holdings:[
      { ticker:'ASELS', currentPrice:125, dailyPct:3.5, referenceVerified:true, ceiling:125, floor:103 },
      { ticker:'THYAO', currentPrice:275, dailyPct:-1.2, referenceVerified:false, ceiling:330, floor:270 },
    ],
  }, rules);

  assert.deepEqual(events.map(event => event.ruleId).sort(), ['a','b','c','d','f','f1','r']);
  assert.equal(events.some(event => event.ruleId === 'rf'), false, 'a falling stock must not fire a rise rule');
  assert.equal(events.some(event => event.ruleId === 'ff'), false, 'a rising stock must not fire a fall rule');
  assert.equal(events.some(event => event.ruleId === 'g'), false, 'unverified floor must not fire');
  assert.equal(events.some(event => event.ruleId === 'e'), false, 'positive portfolio move must not fire negative rule');
});
