import test from 'node:test';
import assert from 'node:assert/strict';
import { httpGetJson, httpGetText } from '../public/core/http.js';

test('httpGetText uses Android bridge when available', async () => {
  const oldWindow = globalThis.window;
  globalThis.window = { AndroidBridge: { httpGet: () => JSON.stringify({ ok:true, status:200, body:'hello' }) } };
  try {
    assert.equal(await httpGetText('https://example.com/a'), 'hello');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test('httpGetJson parses bridge response body', async () => {
  const oldWindow = globalThis.window;
  globalThis.window = { AndroidBridge: { httpGet: () => JSON.stringify({ ok:true, status:200, body:'{"x":7}' }) } };
  try {
    assert.deepEqual(await httpGetJson('https://example.com/a'), { x:7 });
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test('httpGetText surfaces native HTTP failure', async () => {
  const oldWindow = globalThis.window;
  globalThis.window = { AndroidBridge: { httpGet: () => JSON.stringify({ ok:false, status:503, error:'HTTP 503' }) } };
  try {
    await assert.rejects(() => httpGetText('https://example.com/a'), /HTTP 503/);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test('httpGetText uses asynchronous Android bridge without blocking caller', async () => {
  const oldWindow = globalThis.window;
  let called = false;
  globalThis.window = { AndroidBridge: { httpGetAsync: (_url, id) => {
    called = true;
    queueMicrotask(() => globalThis.window.__nativeHttpResolve(id, JSON.stringify({ ok:true, status:200, body:'async-ok' })));
  } } };
  try {
    const promise = httpGetText('https://example.com/async');
    assert.equal(called, true);
    assert.equal(await promise, 'async-ok');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

test('async Android bridge rejects native failure callback', async () => {
  const oldWindow = globalThis.window;
  globalThis.window = { AndroidBridge: { httpGetAsync: (_url, id) => {
    queueMicrotask(() => globalThis.window.__nativeHttpReject(id, 'Ağ yok'));
  } } };
  try {
    await assert.rejects(() => httpGetText('https://example.com/async'), /Ağ yok/);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});
