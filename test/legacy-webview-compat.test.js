import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const WWW = 'android/app/src/main/assets/www/';
const LEGACY = WWW + 'legacy/';
const read = rel => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const lf = text => text.replace(/\r\n/g, '\n');
// test/code42-labs-production.test.js ile aynı git blob SHA-1 (CRLF -> LF).
const blobSha = text => {
  const bytes = Buffer.from(lf(text), 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};
function list(rel, skip = null) {
  const out = [];
  for (const entry of readdirSync(new URL('../' + rel, import.meta.url), { withFileTypes:true })) {
    const child = rel + entry.name;
    if (entry.isDirectory()) { if (child + '/' !== skip) out.push(...list(child + '/', skip)); }
    else out.push(child);
  }
  return out;
}
const headerOf = text => text.split('\n', 1)[0].match(/legacy-webview source=(\S+) blob=([0-9a-f]{40}) esbuild=(\S+) target=(\S+)/);

const sources = list(WWW, LEGACY).filter(rel => /\.(js|css)$/.test(rel)).map(rel => rel.slice(WWW.length));
const legacyFiles = list(LEGACY).map(rel => rel.slice(LEGACY.length));

test('every www script and stylesheet has a fresh legacy copy for old WebViews', () => {
  assert.ok(sources.includes('app.js') && sources.includes('notification-recovery.js') && sources.includes('core/http.js'));
  for (const rel of sources) {
    const legacy = read(LEGACY + rel);
    const header = headerOf(legacy);
    assert.ok(header, `${rel}: legacy başlığı yok`);
    assert.equal(header[1], rel);
    assert.equal(header[2], blobSha(read(WWW + rel)), `${rel} değişti: node scripts/build-legacy-webview.mjs çalıştırın`);
    assert.equal(header[3], '0.25.11');
    assert.equal(header[4], 'chrome64');
    assert.ok(!legacy.includes('\r\n'), `${rel}: CRLF`);
  }
  const polyfills = read(LEGACY + 'legacy-polyfills.js');
  assert.equal(headerOf(polyfills)[2], blobSha(read('scripts/legacy-webview/polyfills.js')), 'polyfills.js değişti: node scripts/build-legacy-webview.mjs çalıştırın');
  assert.deepEqual(legacyFiles.sort(), [...sources, 'legacy-polyfills.js'].sort());
});

test('legacy copies of the Code41-locked web files come from the locked sources', () => {
  const locked = {
    'core/notification-rules.js': 'e953ca7205b133af2724b39a0d4ff4c6739fa013',
    'core/market-reference.js': '81fef009d1eec65d65b0f4f5ec89e4ae4569bd85',
    'core/market-calendar.js': '13eb6978b14053cc6bbeee7edc7e993169d3a6b9',
    'core/data-sources.js': '32f1f3182ef3d670426fda6035931c4b8f336a1b',
    'core/http.js': '7ca9240b782abbafb917ece6b181c7047fa5c016',
    'notification-recovery.js': 'f071d96b008db323fd02eaf80af817f81f679ccb',
  };
  for (const [rel, sha] of Object.entries(locked)) assert.equal(headerOf(read(LEGACY + rel))[2], sha, rel);
});

test('legacy scripts use no syntax newer than Chrome 64 and load polyfills first', () => {
  for (const rel of legacyFiles.filter(name => name.endsWith('.js'))) {
    const code = read(LEGACY + rel);
    assert.doesNotMatch(code, /\?\.(?!\d)/, `${rel}: ?.`);
    assert.doesNotMatch(code, /\?\?/, `${rel}: ??`);
    assert.doesNotMatch(code, /(?:\|\||&&)=/, `${rel}: mantıksal atama`);
    assert.doesNotMatch(code, /\b\d+_\d/, `${rel}: sayı ayırıcı`);
    assert.doesNotMatch(code, /catch\s*\{/, `${rel}: değişkensiz catch`);
  }
  const index = read(WWW + 'index.html');
  const entries = [...index.matchAll(/<script type="module" src="\.\/([^"]+)"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(entries, ['app.js', 'notification-recovery.js']);
  for (const rel of entries) assert.equal(read(LEGACY + rel).split('\n')[1], "import './legacy-polyfills.js';", rel);
});

test('MainActivity serves the legacy copies only below the modern WebView floor', () => {
  const support = read('android/app/src/main/java/com/innative/halkaarz/LegacyWebView.java');
  const activity = read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  assert.match(support, /static final int MODERN_MIN_CHROME_MAJOR = 92;/);
  assert.match(support, /static final String ASSET_DIR = "www\/legacy\/";/);
  assert.match(support, /return major > 0 && major < MODERN_MIN_CHROME_MAJOR;/);
  assert.match(support, /WebSettings\.getDefaultUserAgent\(context\)/);
  assert.match(activity, /this\.legacyAssets = LegacyWebView\.useLegacyAssets\(this\.context\);/);
  assert.match(activity, /if \(legacyAssets && \(path\.endsWith\("\.js"\) \|\| path\.endsWith\("\.css"\)\)\) \{\s*try \{\s*return new WebResourceResponse\(mimeType\(path\), "UTF-8", context\.getAssets\(\)\.open\(LegacyWebView\.ASSET_DIR \+ path\)\);/);
  assert.match(activity, /InputStream input = context\.getAssets\(\)\.open\("www\/" \+ path\);/);
});

// Polyfill'ler eksik API'leri olan bir bağlamda çalıştırılır ve Node'un yerel davranışıyla karşılaştırılır.
function legacyContext() {
  const context = vm.createContext({});
  vm.runInContext(`
    delete Object.fromEntries; delete Promise.allSettled; delete Array.prototype.flat; delete Array.prototype.flatMap;
    delete String.prototype.matchAll;
    const NativeDTF = Intl.DateTimeFormat;
    function OldDTF(locales, options) {
      const copy = Object.assign({}, options); delete copy.hourCycle;
      if (copy.hour12 === undefined && copy.hour) copy.hour12 = true;
      return new NativeDTF(locales, copy);
    }
    OldDTF.prototype = NativeDTF.prototype; OldDTF.supportedLocalesOf = NativeDTF.supportedLocalesOf;
    Intl.DateTimeFormat = OldDTF;
    const NativeNF = Intl.NumberFormat;
    function OldNF(locales, options) { const copy = Object.assign({}, options); delete copy.signDisplay; return new NativeNF(locales, copy); }
    OldNF.prototype = NativeNF.prototype; OldNF.supportedLocalesOf = NativeNF.supportedLocalesOf;
    Intl.NumberFormat = OldNF;
  `, context);
  context.crypto = { getRandomValues: array => webcrypto.getRandomValues(array) };
  vm.runInContext(read('scripts/legacy-webview/polyfills.js'), context);
  return context;
}

test('legacy polyfills match native behaviour for the APIs the web layer uses', async () => {
  const context = legacyContext();
  const run = source => vm.runInContext(source, context);
  assert.deepEqual(JSON.parse(run(`JSON.stringify(Object.fromEntries([['a', 1], ['b', [2]]]))`)), { a:1, b:[2] });
  assert.equal(run(`Object.keys(Object.fromEntries(new Map([['x', 1]]))).join()`), 'x');
  assert.equal(run(`Object.prototype.propertyIsEnumerable.call(Array.prototype, 'flatMap')`), false);
  assert.equal(run(`JSON.stringify([[1, [2]], 3, [4]].flatMap(x => x))`), JSON.stringify([[1, [2]], 3, [4]].flatMap(x => x)));
  assert.equal(run(`JSON.stringify([1, [2, [3, [4]]]].flat(Infinity))`), '[1,2,3,4]');
  assert.equal(run(`JSON.stringify([1, , 2].flatMap(x => [x, x * 2]))`), JSON.stringify([1, , 2].flatMap(x => [x, x * 2])));
  const settled = await run(`Promise.allSettled([1, Promise.reject(new Error('x')), Promise.resolve(3)]).then(r => JSON.stringify(r.map(i => i.status + ':' + (i.value || i.reason.message))))`);
  assert.equal(settled, JSON.stringify(['fulfilled:1', 'rejected:x', 'fulfilled:3']));
  const html = '<td>a</td><td>b</td>';
  assert.equal(run(`JSON.stringify([...${JSON.stringify(html)}.matchAll(/<td>(.*?)<\\/td>/g)].map(m => [m[1], m.index]))`),
    JSON.stringify([...html.matchAll(/<td>(.*?)<\/td>/g)].map(m => [m[1], m.index])));
  assert.equal(run(`[...'a1b22'.matchAll(/\\d*/g)].length`), [...'a1b22'.matchAll(/\d*/g)].length);
  assert.throws(() => run(`'abc'.matchAll(/b/)`), error => error.name === 'TypeError');
  assert.match(run(`crypto.randomUUID()`), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // market-calendar.js: hourCycle:'h23' eski motorda 12 saatlik biçime düşmemeli.
  const parts = run(`new Intl.DateTimeFormat('en-US', { timeZone:'Europe/Istanbul', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })
    .formatToParts(new Date('2026-10-20T11:30:00Z')).filter(p => p.type === 'hour' || p.type === 'dayPeriod').map(p => p.value).join('|')`);
  assert.equal(parts, '14');
  // app.js pct(): signDisplay:'always' ile pozitif yüzdeler "+" taşır.
  run(`globalThis.fmtPct = new Intl.NumberFormat('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2, signDisplay:'always' })`);
  assert.equal(run(`fmtPct.format(2.345)`), new Intl.NumberFormat('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2, signDisplay:'always' }).format(2.345));
  assert.equal(run(`fmtPct.format(-1.5)`), new Intl.NumberFormat('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2, signDisplay:'always' }).format(-1.5));
  assert.equal(run(`fmtPct.format(0)`), '+0,00');
});

test('legacy polyfills leave native implementations untouched', () => {
  const context = vm.createContext({ crypto:{ getRandomValues: array => webcrypto.getRandomValues(array), randomUUID: () => 'native' } });
  const before = vm.runInContext('[Object.fromEntries, Promise.allSettled, Array.prototype.flatMap, String.prototype.matchAll, Intl.DateTimeFormat, Intl.NumberFormat]', context);
  vm.runInContext(read('scripts/legacy-webview/polyfills.js'), context);
  const after = vm.runInContext('[Object.fromEntries, Promise.allSettled, Array.prototype.flatMap, String.prototype.matchAll, Intl.DateTimeFormat, Intl.NumberFormat]', context);
  for (let i = 0; i < before.length; i++) assert.equal(after[i], before[i]);
  assert.equal(vm.runInContext('crypto.randomUUID()', context), 'native');
});
