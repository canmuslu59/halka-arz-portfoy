import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const secret = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
if (!secret) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required.');
JSON.parse(secret);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'halka-cf-bootstrap-'));
const secretPath = path.join(tempDir, 'secrets.json');
await writeFile(secretPath, JSON.stringify({ FIREBASE_SERVICE_ACCOUNT_JSON:secret }), { mode:0o600 });

function runWrangler() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', [
      '-y', 'wrangler@4.131.1', 'deploy', '--temporary',
      '--config', 'wrangler.jsonc', '--secrets-file', secretPath,
    ], { stdio:['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = chunk => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`Wrangler exited with ${code}.`)));
  });
}

let output;
try {
  output = await runWrangler();
} finally {
  await rm(tempDir, { recursive:true, force:true });
}

const claimUrl = output.match(/https:\/\/dash\.cloudflare\.com\/claim-preview\?claimToken=[^\s]+/)?.[0] || '';
const workerUrl = output.match(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev/)?.[0] || '';
if (!claimUrl || !workerUrl) throw new Error('Temporary Cloudflare deployment did not return claim and Worker URLs.');

let health = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    const response = await fetch(`${workerUrl}/api/health`);
    if (response.ok) {
      health = await response.json();
      break;
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 1500));
}
if (!health?.ok || health?.push?.fcmConfigured !== true) {
  throw new Error('Temporary Cloudflare Worker health verification failed.');
}

console.log(`BOOTSTRAP_WORKER_URL=${workerUrl}`);
console.log(`BOOTSTRAP_CLAIM_URL=${claimUrl}`);
console.log(`BOOTSTRAP_FCM_CONFIGURED=${health.push.fcmConfigured}`);

const port = Number(process.env.PORT || 10000);
http.createServer((req, res) => {
  res.writeHead(200, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
  res.end(JSON.stringify({ ok:true, workerUrl, fcmConfigured:true }));
}).listen(port, '0.0.0.0', () => console.log(`Bootstrap status server listening on ${port}`));
