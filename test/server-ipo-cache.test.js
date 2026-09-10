import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fetchFixture = fileURLToPath(new URL('./fixtures/server-fetch-stub.mjs', import.meta.url));

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode != null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw lastError || new Error('server did not become ready');
}

async function countUpstreamCalls(logFile) {
  try {
    const text = await fs.readFile(logFile, 'utf8');
    return text.split('\n').filter(Boolean).length;
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
}

async function withServer(mode, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'halka-arz-ipo-cache-'));
  const logFile = path.join(dir, 'upstream.log');
  const dataFile = path.join(dir, 'portfolio.json');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', fetchFixture, 'server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      APP_PIN: '',
      PORTFOLIO_DATA_FILE: dataFile,
      FETCH_STUB_MODE: mode,
      FETCH_STUB_LOG: logFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    await waitForServer(baseUrl, child);
    await fn({ baseUrl, logFile });
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode != null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1000).unref();
    });
    await fs.rm(dir, { recursive:true, force:true });
  }
  assert.equal(stderr, '', `server wrote unexpected stderr: ${stderr}`);
}

test('total IPO upstream outage is surfaced and is not cached as a six-hour confirmed miss', async () => {
  await withServer('outage', async ({ baseUrl, logFile }) => {
    const first = await fetch(`${baseUrl}/api/lookup/TEST`).then(response => response.json());
    const firstCalls = await countUpstreamCalls(logFile);

    assert.equal(first.ipo, null);
    assert.match(first.warnings.join(' '), /halka arz kaynaklarına ulaşılamadı/i);
    assert.ok(firstCalls > 0, 'first lookup should attempt IPO upstreams');

    const second = await fetch(`${baseUrl}/api/lookup/TEST`).then(response => response.json());
    const secondCalls = await countUpstreamCalls(logFile);

    assert.equal(second.ipo, null);
    assert.ok(secondCalls > firstCalls, 'transient outage must be retried instead of served from the six-hour IPO cache');
  });
});

test('a fully successful IPO scan with no ticker match remains cacheable as a confirmed miss', async () => {
  await withServer('empty', async ({ baseUrl, logFile }) => {
    const first = await fetch(`${baseUrl}/api/lookup/TEST`).then(response => response.json());
    const firstCalls = await countUpstreamCalls(logFile);
    assert.equal(first.ipo?.ticker, 'TEST');
    assert.equal(first.ipo?.ipoPrice, null);
    assert.ok(firstCalls > 0);

    const second = await fetch(`${baseUrl}/api/lookup/TEST`).then(response => response.json());
    const secondCalls = await countUpstreamCalls(logFile);
    assert.equal(second.ipo?.ticker, 'TEST');
    assert.equal(secondCalls, firstCalls, 'confirmed miss should still use the six-hour IPO cache');
  });
});
