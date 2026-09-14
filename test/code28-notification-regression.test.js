import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDailyAlerts, notificationPayloadForEvent } from '../public/core/notification-rules.js';
import { calculateHolding, calculateTotals } from '../public/core/domain.js';
import { evaluateRegistrationAlerts, notificationForAlert } from '../backend/alert-engine.js';

const day = '2026-09-14';
const levels = result => result.events.filter(event => event.kind === 'portfolio').map(event => event.level);
function run(percent, previousState=null, date=day) {
  return evaluateDailyAlerts({day:date,threshold:1,enabled:true,portfolioPct:percent,previousState});
}
for (const [percent,expected] of [[-0.999,[]],[-1,[-1]],[-1.5,[-1]],[-3,[-1,-2,-3]],[1,[1]],[3,[1,2,3]]]) {
  test('portfolio signed threshold ' + percent, () => assert.deepEqual(levels(run(percent)),expected));
}
test('rise and decline are independent, each threshold is delivered once per Istanbul date', () => {
  const up=run(1);const down=run(-1,up.state);
  assert.deepEqual(levels(down),[-1]);
  assert.deepEqual(levels(run(-1.4,down.state)),[]);
  assert.deepEqual(levels(run(1.4,down.state)),[]);
  assert.deepEqual(levels(run(-2.1,down.state)),[-2]);
});
test('Friday delivery state cannot suppress either Monday direction', () => {
  const friday=run(-3,null,'2026-09-11');
  assert.deepEqual(levels(run(-1,friday.state)),[-1]);
  assert.deepEqual(levels(run(1,friday.state)),[1]);
});
test('declines use a decline title, signed percent and their own Android channel kind', () => {
  const message=notificationPayloadForEvent({kind:'portfolio',level:-1.5});
  assert.deepEqual(message,{kind:'portfolio_fall',ticker:'',title:'Portföy düşüşü',body:'Toplam portföy bugün -%1.5 seviyesine düştü.'});
  assert.equal(notificationForAlert({kind:'portfolio',level:-1,dailyPct:-1.1}).data.kind,'portfolio_fall');
});
function holding(ticker,date,current=99) {
  return calculateHolding({ticker,initialLots:10,currentLots:10,ipoPrice:100,currentPrice:current,previousClose:100,latestMarketDate:date,sales:[]},{today:day});
}
test('mixed Friday and Monday prices cannot be displayed as a complete Monday return', () => {
  const totals=calculateTotals([holding('AAA',day),holding('BBB','2026-09-11')]);
  assert.equal(totals.dailyComplete,false);assert.equal(totals.dailyPct,null);assert.equal(totals.dailyProfit,null);
  assert.equal(totals.activeValue,1980);
});
test('all fresh Monday quotes produce the same decline in UI and backend', () => {
  const totals=calculateTotals([holding('AAA',day),holding('BBB',day)]);
  const quotes=new Map(['AAA','BBB'].map(ticker=>[ticker,{current:99,previousClose:100,latestMarketDate:day}]));
  const result=evaluateRegistrationAlerts({registration:{threshold:1,holdings:[{ticker:'AAA',lots:10},{ticker:'BBB',lots:10}]},quotes,day});
  assert.equal(totals.dailyPct,-1);assert.equal(result.portfolioPct,-1);assert.deepEqual(levels(result),[-1]);
});
test('undated, null and Friday backend quotes cannot generate a fabricated decline', () => {
  for(const quote of [{current:99,previousClose:100},{current:null,previousClose:100,latestMarketDate:day},{current:99,previousClose:100,latestMarketDate:'2026-09-11'}]){
    const result=evaluateRegistrationAlerts({registration:{threshold:1,holdings:[{ticker:'AAA',lots:10}]},quotes:new Map([['AAA',quote]]),day});
    assert.deepEqual(result.events,[]);
  }
});
test('an entirely closed prior session still shows zero daily change', () => {
  const totals=calculateTotals([holding('AAA','2026-09-11'),holding('BBB','2026-09-11')]);
  assert.equal(totals.dailyPct,null); // no current-day denominator
  assert.equal(totals.dailyProfit,0);
});
