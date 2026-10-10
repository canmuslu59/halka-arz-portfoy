import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateJournal, validateJournalRow, normalizeJournal} from '../public/core/lab-ledger.js';

let i=0;
const row=(type, fields={})=>({id:String(++i).padStart(3,'0'),ticker:'TSTX',date:'2026-10-09',type,...fields});
test('buy sell uses average cost, includes trade commissions',()=>{
  i=0;
  const r=calculateJournal([
    row('BUY',{lots:10,price:100,fee:5}),
    row('BUY',{lots:10,price:120,fee:5}),
    row('SELL',{lots:5,price:130,fee:3}),
  ]);
  const p=r.positions[0];
  assert.equal(p.lots,15);
  assert.equal(p.bookCost,1657.5);
  assert.equal(p.averageCost,110.5);
  assert.equal(p.realized,94.5);
  assert.equal(p.cashFlow,-1463);
});
test('split keeps cost basis, dividend increases realized',()=>{
  i=0;
  const r=calculateJournal([
    row('BUY',{lots:20,price:10}),
    row('SPLIT',{numerator:2,denominator:1}),
    row('DIVIDEND',{amount:12}),
    row('FEE',{amount:2}),
  ]);
  assert.equal(r.positions[0].lots,40);
  assert.equal(r.positions[0].averageCost,5);
  assert.equal(r.positions[0].realized,10);
  assert.equal(r.positions[0].dividends,12);
});
test('reject negative cash and oversells',()=>{
  i=0;
  assert.throws(()=>validateJournalRow(row('DIVIDEND',{amount:-5})));
  assert.throws(()=>calculateJournal([row('BUY',{lots:3,price:10}),row('SELL',{lots:4,price:12})]));
});
test('reject duplicate ids and fractional shares after split',()=>{
  i=0;
  const buy=row('BUY',{lots:3,price:10});
  assert.throws(()=>normalizeJournal([buy,buy]));
  assert.throws(()=>calculateJournal([buy,row('SPLIT',{numerator:1,denominator:2})]));
});
test('sort dates before processing',()=>{
  i=0;
  const b=row('BUY',{lots:4,price:10,date:'2026-10-01'});
  const s=row('SELL',{lots:2,price:20,date:'2026-10-02'});
  assert.equal(calculateJournal([s,b]).positions[0].realized,20);
});
