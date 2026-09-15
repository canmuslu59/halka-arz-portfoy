import fs from 'node:fs/promises';
import path from 'node:path';

async function read(file) { return fs.readFile(file, 'utf8'); }
async function write(file, value) { await fs.writeFile(file, value); }
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected source occurs more than once`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// Same-day sale P/L must use the independently verified prior close too.
{
  const file = 'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java';
  let source = await read(file);
  source = replaceOnce(
    source,
    'if (saleLots > 0 && salePrice > 0) saleDayGain += saleLots * (salePrice - quote.previousClose);',
    'if (saleLots > 0 && salePrice > 0) saleDayGain += saleLots * (salePrice - reference.previousClose);',
    'verified sale-day base',
  );
  await write(file, source);
}

// Code 28 is already uploaded to Play; keep the visible version name and advance only versionCode.
{
  const file = 'android/app/build.gradle';
  let source = await read(file);
  source = replaceOnce(source, '        versionCode 28\n', '        versionCode 29\n', 'Android versionCode');
  await write(file, source);
}

{
  const file = 'public/index.html';
  let source = await read(file);
  source = replaceOnce(source, 'v2.4.6 • Build 28', 'v2.4.6 • Build 29', 'visible build identity');
  await write(file, source);
}

// Current-release tests should follow the Play-uploadable build identity; historical Code26 fixtures remain untouched.
{
  const entries = await fs.readdir('test', { withFileTypes:true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.test.js')) continue;
    const file = path.join('test', entry.name);
    let source = await read(file);
    const before = source;
    source = source
      .replaceAll('versionCode 28 / versionName 2.4.6', 'versionCode 29 / versionName 2.4.6')
      .replaceAll('/versionCode 28/', '/versionCode 29/')
      .replaceAll('Build 28/', 'Build 29/')
      .replaceAll('Build 28', 'Build 29');
    if (source !== before) await write(file, source);
  }
}

// Lock the verified previous-close rule into the dedicated regression suite.
{
  const file = 'test/verified-market-reference.test.js';
  let source = await read(file);
  const marker = "  assert.match(worker, /reference\\.ceilingPrice/);\n";
  const addition = "  assert.match(worker, /salePrice - reference\\.previousClose/);\n  assert.doesNotMatch(worker, /salePrice - quote\\.previousClose/);\n";
  if (!source.includes('salePrice - reference\\.previousClose')) {
    const index = source.indexOf(marker);
    if (index < 0) throw new Error('sale-basis regression insertion marker missing');
    source = source.slice(0, index + marker.length) + addition + source.slice(index + marker.length);
  }
  await write(file, source);
}

console.log('Finalized Code29 market-reference release identity and sale-day basis.');
