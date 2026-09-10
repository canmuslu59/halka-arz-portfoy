import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const modulePath = new URL('../public/core/navigation.js', import.meta.url);

async function loadNavigation() {
  await assert.doesNotReject(
    () => fs.access(modulePath),
    'navigation state must live in a deterministic production module',
  );
  return import(`${modulePath.href}?t=${Date.now()}`);
}

test('navigation state increments app history depth and keeps root deterministic', async () => {
  const { createRootNavigationState, nextNavigationState } = await loadNavigation();

  const root = createRootNavigationState('portfolio');
  assert.deepEqual(root, { appRoot:true, view:'portfolio', navDepth:0 });

  const calendar = nextNavigationState(root, { view:'calendar' });
  assert.deepEqual(calendar, { appRoot:true, view:'calendar', navDepth:1 });

  const detail = nextNavigationState(calendar, { sheet:'#detailSheet', holdingId:'holding-1' });
  assert.equal(detail.appRoot, true);
  assert.equal(detail.view, 'calendar');
  assert.equal(detail.sheet, '#detailSheet');
  assert.equal(detail.holdingId, 'holding-1');
  assert.equal(detail.navDepth, 2);
});

test('Android back is handled only for genuine app history above root', async () => {
  const { canHandleAppBack } = await loadNavigation();

  assert.equal(canHandleAppBack({ appRoot:true, navDepth:2 }), true);
  assert.equal(canHandleAppBack({ appRoot:true, navDepth:1 }), true);
  assert.equal(canHandleAppBack({ appRoot:true, navDepth:0 }), false);
  assert.equal(canHandleAppBack({ appRoot:true, navDepth:-1 }), false);
  assert.equal(canHandleAppBack({ navDepth:4 }), false);
  assert.equal(canHandleAppBack(null), false);
});

test('new navigation never inherits stale sheet/detail fields unless explicitly requested', async () => {
  const { nextNavigationState } = await loadNavigation();
  const current = {
    appRoot:true,
    view:'portfolio',
    sheet:'#detailSheet',
    holdingId:'old-holding',
    selectedTicker:'OLD',
    navDepth:3,
  };

  assert.deepEqual(nextNavigationState(current, { view:'settings' }), {
    appRoot:true,
    view:'settings',
    navDepth:4,
  });
});

test('SPA wires tab, sheet, popstate and native back through navigation state helpers', async () => {
  const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /from ['"]\.\/core\/navigation\.js['"]/);
  assert.match(app, /canHandleAppBack\(window\.history\.state\)/);
  assert.match(app, /nextNavigationState\(window\.history\.state/);
  assert.match(app, /window\.addEventListener\(['"]popstate['"]/);
  assert.match(app, /openSheet[\s\S]*nextNavigationState/);
  assert.match(app, /switchView[\s\S]*nextNavigationState/);
});
