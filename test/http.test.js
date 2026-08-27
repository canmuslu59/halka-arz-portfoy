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
