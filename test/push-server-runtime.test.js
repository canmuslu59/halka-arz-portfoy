import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function startServer(t) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'halka-push-'));
  const port = 31000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['push-server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      PUSH_DATA_FILE: path.join(tempDir, 'push.json'),
      PUSH_POLL_INTERVAL_MS: '60000',
      FCM_DRY_RUN: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server start timeout: ${stderr}`)), 8000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Push backend:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`server exited early (${code}): ${stderr}`));
    });
  });

  t.after(async () => {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve)).catch(() => {});
    await rm(tempDir, { recursive:true, force:true });
  });
  return `http://127.0.0.1:${port}`;
}

test('push installation endpoint accepts Android FCM registration and persists normalized config', { timeout:15000 }, async t => {
  const base = await startServer(t);
  const response = await fetch(`${base}/v1/installations`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      installId:'550e8400-e29b-41d4-a716-446655440000',
      fcmToken:'token-1234567890',
      config:{enabled:true,threshold:1,ipoEnabled:true,holdings:[{ticker:'THYAO',lots:7}]},
    }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^application\/json/);
  const body = await response.json();
  assert.equal(body.installId, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(body.threshold, 1);
  assert.deepEqual(body.holdings, [{ticker:'THYAO',lots:7}]);
});

test('health endpoint reports one-minute server push cadence while Android remains a fallback', { timeout:15000 }, async t => {
  const base = await startServer(t);
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.push?.pollIntervalMs, 60000);
  assert.equal(body.push?.androidFallbackMinutes, 15);
});
