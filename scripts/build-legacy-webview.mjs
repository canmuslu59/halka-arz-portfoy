// Eski Android WebView'ler (Chrome < 92) için www JS/CSS dosyalarının dönüştürülmüş kopyalarını
// android/app/src/main/assets/www/legacy altına üretir. Kaynak dosyalar (Code41 bildirim kilidi
// dahil) değişmez; MainActivity eski WebView'de aynı adresleri bu kopyalardan sunar.
//
//   npm i --no-save esbuild@0.25.11
//   node scripts/build-legacy-webview.mjs           # üret
//   node scripts/build-legacy-webview.mjs --check   # commit'lenen kopyalar güncel mi?
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ESBUILD_VERSION = '0.25.11';
const TARGET = 'chrome64';
const WWW = path.resolve('android/app/src/main/assets/www');
const LEGACY = path.join(WWW, 'legacy');
const POLYFILLS_SOURCE = path.resolve('scripts/legacy-webview/polyfills.js');
const POLYFILLS_NAME = 'legacy-polyfills.js';

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  console.error(`esbuild bulunamadı: npm i --no-save esbuild@${ESBUILD_VERSION}`);
  process.exit(1);
}
if (esbuild.version !== ESBUILD_VERSION) {
  console.error(`esbuild ${ESBUILD_VERSION} gerekli, bulunan ${esbuild.version}`);
  process.exit(1);
}

const lf = text => text.replace(/\r\n/g, '\n');
// test/code42-labs-production.test.js ile aynı: CRLF -> LF sonrası git blob SHA-1.
const blobSha = text => {
  const bytes = Buffer.from(lf(text), 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};

async function listSources(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== LEGACY) await listSources(full, out);
    } else if (/\.(js|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function transform(code, rel) {
  const result = await esbuild.transform(code, {
    loader:rel.endsWith('.css') ? 'css' : 'js',
    target:TARGET,
    charset:'utf8',
    legalComments:'inline',
    sourcefile:rel,
    logLevel:'silent',
  });
  for (const warning of result.warnings) console.warn(`${rel}: ${warning.text}`);
  return lf(result.code);
}

const header = (rel, sha) => `${rel.endsWith('.css') ? '/*' : '//'} legacy-webview source=${rel} blob=${sha} esbuild=${ESBUILD_VERSION} target=${TARGET} — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.${rel.endsWith('.css') ? ' */' : ''}\n`;

const index = await fs.readFile(path.join(WWW, 'index.html'), 'utf8');
const entries = new Set([...index.matchAll(/<script type="module" src="\.\/([^"]+)"><\/script>/g)].map(match => match[1]));
if (!entries.size) throw new Error('index.html içinde modül giriş betiği bulunamadı');

const outputs = new Map();
const polyfills = await fs.readFile(POLYFILLS_SOURCE, 'utf8');
outputs.set(POLYFILLS_NAME, header('scripts/legacy-webview/polyfills.js', blobSha(polyfills)) + await transform(polyfills, POLYFILLS_NAME));

for (const file of await listSources(WWW)) {
  const rel = path.relative(WWW, file).split(path.sep).join('/');
  const source = await fs.readFile(file, 'utf8');
  let body = await transform(source, rel);
  // Polyfill'ler giriş modüllerinin ilk import'u: modül grafiğindeki her şeyden önce çalışır.
  if (entries.has(rel)) body = `import './${'../'.repeat(rel.split('/').length - 1)}${POLYFILLS_NAME}';\n` + body;
  outputs.set(rel, header(rel, blobSha(source)) + body);
}

async function listExisting(dir, out = []) {
  let items = [];
  try { items = await fs.readdir(dir, { withFileTypes:true }); } catch { return out; }
  for (const entry of items) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listExisting(full, out);
    else out.push(path.relative(LEGACY, full).split(path.sep).join('/'));
  }
  return out;
}

if (process.argv.includes('--check')) {
  const stale = [];
  const existing = new Set(await listExisting(LEGACY));
  for (const [rel, code] of outputs) {
    let current = null;
    try { current = await fs.readFile(path.join(LEGACY, rel), 'utf8'); } catch {}
    if (current !== code) stale.push(rel);
    existing.delete(rel);
  }
  stale.push(...[...existing].map(rel => `${rel} (fazla)`));
  if (stale.length) {
    console.error('www/legacy güncel değil:\n  ' + stale.join('\n  ') + '\nnode scripts/build-legacy-webview.mjs çalıştırın.');
    process.exit(1);
  }
  console.log(`www/legacy güncel (${outputs.size} dosya).`);
} else {
  await fs.rm(LEGACY, { recursive:true, force:true });
  for (const [rel, code] of outputs) {
    const target = path.join(LEGACY, rel);
    await fs.mkdir(path.dirname(target), { recursive:true });
    await fs.writeFile(target, code, 'utf8');
  }
  console.log(`www/legacy üretildi: ${outputs.size} dosya, esbuild ${ESBUILD_VERSION}, target ${TARGET}.`);
}
