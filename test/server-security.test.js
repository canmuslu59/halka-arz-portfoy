import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startFixture({ pin = '', portfolioText = null, siblingSecret = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'halkaarz-server-'));
  await copyFile(new URL('../server.js', import.meta.url), path.join(dir, 'server.js'));
  await mkdir(path.join(dir, 'public'), { recursive:true });
  await writeFile(path.join(dir, 'public', 'index.html'), '<h1>ok</h1>');
  if (portfolioText != null) {
    await mkdir(path.join(dir, 'data'), { recursive:true });
    await writeFile(path.join(dir, 'data', 'portfolio.json'), portfolioText);
  }
  if (siblingSecret) {
    await mkdir(path.join(dir, 'public-secret'), { recursive:true });
    await writeFile(path.join(dir, 'public-secret', 'secret.txt'), 'TOP-SECRET');
  }
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd:dir,
    env:{ ...process.env, PORT:String(port), APP_PIN:pin },
    stdio:['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${stderr}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 25));
    if (i === 59) throw new Error(`Server did not start: ${stderr}`);
  }
  return {
    base,
    async close() {
      if (child.exitCode == null) child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
      await rm(dir, { recursive:true, force:true });
    },
  };
}

test('server accepts APP_PIN only from header, never from URL query', async t => {
  const fixture = await startFixture({ pin:'secret-pin' });
  t.after(() => fixture.close());

  const queryResponse = await fetch(`${fixture.base}/api/portfolio?pin=secret-pin`);
  assert.equal(queryResponse.status, 401);

  const headerResponse = await fetch(`${fixture.base}/api/portfolio`, { headers:{ 'x-app-pin':'secret-pin' } });
  assert.equal(headerResponse.status, 200);
});

test('corrupt portfolio JSON is surfaced as a server error instead of silently erasing the portfolio', async t => {
  const fixture = await startFixture({ portfolioText:'{"holdings":[' });
  t.after(() => fixture.close());
  const response = await fetch(`${fixture.base}/api/portfolio`);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.match(String(body.error || ''), /portföy.*bozuk|veri.*bozuk/i);
});

test('encoded path traversal cannot read a sibling directory that shares the public prefix', async t => {
  const fixture = await startFixture({ siblingSecret:true });
  t.after(() => fixture.close());
  const response = await fetch(`${fixture.base}/%2e%2e%2fpublic-secret/secret.txt`);
  assert.equal(response.status, 404);
  assert.notEqual(await response.text(), 'TOP-SECRET');
});

test('malformed JSON request body returns 400 instead of 500', async t => {
  const fixture = await startFixture();
  t.after(() => fixture.close());
  const response = await fetch(`${fixture.base}/api/holdings`, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:'{"ticker":',
  });
  assert.equal(response.status, 400);
});
