import fs from 'node:fs/promises';

async function replaceExact(path, from, to) {
  const original = await fs.readFile(path, 'utf8');
  if (original.includes(to)) return false;
  if (!original.includes(from)) throw new Error(`Expected source fragment not found in ${path}`);
  const next = original.replace(from, to);
  if (next === original) throw new Error(`Patch made no change in ${path}`);
  await fs.writeFile(path, next);
  return true;
}

const parserBefore = `  const previousClose = Number.isFinite(meta.previousClose) ? meta.previousClose\n    : previousRow?.close\n      ?? (Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : lastClose);`;
const parserAfter = `  const previousClose = Number.isFinite(meta.previousClose) ? meta.previousClose\n    : previousRow?.close\n      ?? (Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : null);`;

for (const path of [
  'public/core/parsers.js',
  'android/app/src/main/assets/www/core/parsers.js',
]) {
  await replaceExact(path, parserBefore, parserAfter);
}

await replaceExact(
  'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java',
  `        if (!Double.isFinite(previousClose)) previousClose = chartPreviousClose;\n        if (!Double.isFinite(previousClose)) previousClose = latestTickClose;\n        if (!(current > 0) || !(previousClose > 0)) throw new IllegalStateException("Eksik fiyat verisi.");`,
  `        if (!Double.isFinite(previousClose)) previousClose = chartPreviousClose;\n        if (!(current > 0) || !(previousClose > 0)) throw new IllegalStateException("Eksik fiyat verisi.");`,
);
