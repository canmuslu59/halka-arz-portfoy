import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const tempRoot = mkdtempSync(join(tmpdir(), 'halkaarz-repeat-buy-'));
cpSync(fileURLToPath(new URL('../public/core/', import.meta.url)), join(tempRoot, 'core'), { recursive:true });
const coreOverlay = fileURLToPath(new URL('../scripts/apply-test-repeated-purchase-core.mjs', import.meta.url));
const transformed = spawnSync(process.execPath, [coreOverlay], {
  cwd:fileURLToPath(new URL('..', import.meta.url)),
  env:{ ...process.env, TEST_ASSET_ROOT:tempRoot },
  encoding:'utf8',
});
if (transformed.status !== 0) {
  throw new Error(`Repeated-purchase test overlay failed: ${transformed.stderr || transformed.stdout}`);
}

const { createRepository } = await import(pathToFileURL(join(tempRoot, 'core/repository.js')).href);
const { createPortfolioService } = await import(pathToFileURL(join(tempRoot, 'core/portfolio-service.js')).href);
after(() => rmSync(tempRoot, { recursive:true, force:true }));

function memoryRepository() {
  let raw = null;
  return createRepository({ get: async () => raw, set: async value => { raw = value; } });
}

function market() {
  return {
    ticker:'TEST', symbol:'TEST.IS', current:150, previousClose:140,
    marketTime:'2026-08-29T09:00:00.000Z', latestMarketDate:'2026-08-29',
    history:[
      { date:'2026-08-27', close:100 },
      { date:'2026-08-28', close:120 },
      { date:'2026-08-29', close:150 },
    ],
  };
}

function ipo() {
  return { ticker:'TEST', company:'Test AŞ', ipoPrice:100, firstTradeDate:'2026-08-20', source:'Test' };
}

function serviceFixture() {
  let nowValue = new Date('2026-08-27T10:00:00.000Z');
  let id = 0;
  const service = createPortfolioService({
    repository: memoryRepository(),
    getQuote: async () => market(),
    getHistory: async () => market(),
    getIpo: async () => ipo(),
    getSector: async () => ({ ticker:'TEST', sector:'Teknoloji' }),
    now: () => nowValue,
    uuid: () => `id-${++id}`,
  });
  return { service, setNow: value => { nowValue = new Date(value); } };
}

test('repeated buy of the same ticker merges into one holding with weighted average cost', async () => {
  const { service, setNow } = serviceFixture();
  await service.addHolding({ ticker:'TEST', lots:10, ipoPriceOverride:100, firstTradeDateOverride:'2026-08-27' });
  setNow('2026-08-28T10:00:00.000Z');
  const second = await service.addHolding({ ticker:'test.is', lots:5, ipoPriceOverride:130, firstTradeDateOverride:'2026-08-28' });
  const portfolio = await service.getPortfolio({ refresh:false });

  assert.equal(portfolio.holdings.length, 1);
  assert.equal(second.merged, true);
  assert.equal(second.holding.currentLots, 15);
  assert.equal(second.holding.purchases.length, 2);
  assert.ok(Math.abs(second.holding.averagePurchasePrice - 110) < 1e-9);
  assert.ok(Math.abs(second.holding.positionCost - 1650) < 1e-9);
});

test('a later buy does not reprice profit from an earlier sale', async () => {
  const { service, setNow } = serviceFixture();
  const first = await service.addHolding({ ticker:'TEST', lots:10, ipoPriceOverride:100, firstTradeDateOverride:'2026-08-27' });
  setNow('2026-08-28T10:00:00.000Z');
  const sold = await service.addSale(first.holding.id, { lots:4, price:120, date:'2026-08-28' });
  assert.ok(Math.abs(sold.realizedProfit - 66) < 1e-9);

  setNow('2026-08-29T10:00:00.000Z');
  const repurchased = await service.addHolding({ ticker:'TEST', lots:5, ipoPriceOverride:130, firstTradeDateOverride:'2026-08-29' });

  assert.equal(repurchased.holding.currentLots, 11);
  assert.ok(Math.abs(repurchased.holding.positionCost - 1250) < 1e-9);
  assert.ok(Math.abs(repurchased.holding.averagePurchasePrice - (1250 / 11)) < 1e-9);
  assert.ok(Math.abs(repurchased.holding.realizedProfit - 66) < 1e-9);
  assert.ok(Math.abs(repurchased.holding.sales[0].costPrice - 100) < 1e-9);
});

test('add sheet hides the floating add button and keeps the real submit action keyboard-accessible', () => {
  const overlay = readFileSync(new URL('../scripts/apply-test-stock-entry-fixes.mjs', import.meta.url), 'utf8');
  assert.match(overlay, /body\.sheet-open #addFab/);
  assert.match(overlay, /classList\.add\('sheet-open'\)/);
  assert.match(overlay, /classList\.remove\('sheet-open'\)/);
  assert.match(overlay, /#addSubmit\{position:sticky/);
  assert.match(overlay, /--keyboard-inset/);
});

test('stock detail exposes average purchase price, current cost and purchase history', () => {
  const overlay = readFileSync(new URL('../scripts/apply-test-stock-entry-fixes.mjs', import.meta.url), 'utf8');
  assert.match(overlay, /Ortalama alış/);
  assert.match(overlay, /Mevcut maliyet/);
  assert.match(overlay, /Alış geçmişi/);
  assert.match(overlay, /h\.purchases/);
});
