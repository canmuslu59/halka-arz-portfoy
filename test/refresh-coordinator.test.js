import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRefreshGate } from '../public/core/refresh-coordinator.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('forced refresh requested during normal refresh runs once after the active refresh', async () => {
  const gate = createRefreshGate();
  const first = deferred();
  const calls = [];

  const normal = gate.run(async ({ force }) => {
    calls.push(force);
    await first.promise;
    return 'normal';
  }, { force:false });

  const forced = gate.run(async ({ force }) => {
    calls.push(force);
    return 'forced';
  }, { force:true });

  assert.deepEqual(calls, [false]);
  first.resolve();
  assert.equal(await normal, 'normal');
  assert.equal(await forced, 'forced');
  assert.deepEqual(calls, [false, true]);
});

test('multiple forced refresh requests behind one normal refresh coalesce to one forced run', async () => {
  const gate = createRefreshGate();
  const first = deferred();
  let forcedCalls = 0;

  const normal = gate.run(async () => {
    await first.promise;
    return 'normal';
  });
  const forceTask = async ({ force }) => {
    assert.equal(force, true);
    forcedCalls += 1;
    return 'forced';
  };
  const forcedA = gate.run(forceTask, { force:true });
  const forcedB = gate.run(forceTask, { force:true });

  first.resolve();
  await normal;
  assert.equal(await forcedA, 'forced');
  assert.equal(await forcedB, 'forced');
  assert.equal(forcedCalls, 1);
});

test('duplicate normal refreshes and duplicate active forced refreshes reuse the in-flight work', async () => {
  const gate = createRefreshGate();
  const hold = deferred();
  let calls = 0;
  const task = async ({ force }) => {
    calls += 1;
    await hold.promise;
    return force ? 'forced' : 'normal';
  };

  const first = gate.run(task);
  const duplicate = gate.run(task);
  hold.resolve();
  assert.equal(await first, 'normal');
  assert.equal(await duplicate, 'normal');
  assert.equal(calls, 1);

  const holdForced = deferred();
  const forcedTask = async ({ force }) => {
    calls += 1;
    await holdForced.promise;
    return force ? 'forced' : 'normal';
  };
  const forcedA = gate.run(forcedTask, { force:true });
  const forcedB = gate.run(forcedTask, { force:true });
  holdForced.resolve();
  assert.equal(await forcedA, 'forced');
  assert.equal(await forcedB, 'forced');
  assert.equal(calls, 2);
});

test('SPA routes portfolio and history refreshes through independent refresh gates', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ createRefreshGate \} from '\.\/core\/refresh-coordinator\.js';/);
  assert.match(source, /const portfolioRefreshGate\s*=\s*createRefreshGate\(\)/);
  assert.match(source, /const historyRefreshGate\s*=\s*createRefreshGate\(\)/);
  assert.match(source, /portfolioRefreshGate\.run\([\s\S]*?\{ force \}\)/);
  assert.match(source, /historyRefreshGate\.run\([\s\S]*?\{ force \}\)/);
  assert.doesNotMatch(source, /if \(portfolioRefreshPromise\) return portfolioRefreshPromise/);
  assert.doesNotMatch(source, /if \(state\.historyRefreshStarted && !force\) return/);
});
