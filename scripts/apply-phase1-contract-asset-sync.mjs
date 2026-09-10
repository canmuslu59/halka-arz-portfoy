import fs from 'node:fs';

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`Missing expected block: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Expected one block only: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const indexPath = 'public/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
html = replaceOnce(html, 'v2.4.0 • Build 22', 'v2.3.9 • Build 21', 'Phase1 visible build identity');
html = replaceOnce(
  html,
  '<small class="build-info">Halka Arz Portföyüm<br />v2.3.9 • Build 21</small>',
  '<small id="appVersion" class="build-info">Halka Arz Portföyüm<br />v2.3.9 • Build 21</small>',
  'appVersion DOM hook'
);
fs.writeFileSync(indexPath, html);

const legacyPath = 'test/v236-code18.test.js';
let legacy = fs.readFileSync(legacyPath, 'utf8');
legacy = replaceOnce(
  legacy,
  "test('code18 keeps Play identity monotonic and preserves Android 15/16 edge-to-edge', () => {",
  "test('historical edge-to-edge regression follows the current published Play identity', () => {",
  'legacy identity test title'
);
legacy = replaceOnce(legacy, "assert.match(gradle, /versionCode 18/);", "assert.match(gradle, /versionCode 21/);", 'legacy versionCode');
legacy = replaceOnce(legacy, "assert.match(gradle, /versionName '2\\.3\\.6'/);", "assert.match(gradle, /versionName '2\\.3\\.9'/);", 'legacy versionName');
legacy = replaceOnce(legacy, "assert.match(html, /v2\\.3\\.6 • Build 18/);", "assert.match(html, /v2\\.3\\.9 • Build 21/);", 'legacy visible version');
legacy = replaceOnce(
  legacy,
  `test('1 percent threshold emits exactly the newly reached stock and portfolio levels', () => {\n  const first = evaluateDailyAlerts({\n    day:'2026-09-08', threshold:1, enabled:true,\n    holdings:[{ticker:'AAA',dailyPct:1.08,currentPrice:101.08,previousClose:100,dailySessionActive:true}],\n    portfolioPct:1.04,\n  });\n  assert.deepEqual(first.events.filter(e => e.kind === 'stock').map(e => e.level), [1]);\n  assert.deepEqual(first.events.filter(e => e.kind === 'portfolio').map(e => e.level), [1]);\n  const again = evaluateDailyAlerts({\n    day:'2026-09-08', threshold:1, enabled:true,\n    holdings:[{ticker:'AAA',dailyPct:1.4,currentPrice:101.4,previousClose:100,dailySessionActive:true}],\n    portfolioPct:1.2, previousState:first.state,\n  });\n  assert.equal(again.events.filter(e => e.kind === 'stock' || e.kind === 'portfolio').length, 0);\n});`,
  `test('1 percent threshold emits the newly reached portfolio level without ordinary stock alerts', () => {\n  const first = evaluateDailyAlerts({\n    day:'2026-09-08', threshold:1, enabled:true,\n    holdings:[{ticker:'AAA',dailyPct:1.08,currentPrice:101.08,previousClose:100,dailySessionActive:true}],\n    portfolioPct:1.04,\n  });\n  assert.equal(first.events.some(e => e.kind === 'stock'), false);\n  assert.deepEqual(first.events.filter(e => e.kind === 'portfolio').map(e => e.level), [1]);\n  const again = evaluateDailyAlerts({\n    day:'2026-09-08', threshold:1, enabled:true,\n    holdings:[{ticker:'AAA',dailyPct:1.4,currentPrice:101.4,previousClose:100,dailySessionActive:true}],\n    portfolioPct:1.2, previousState:first.state,\n  });\n  assert.equal(again.events.some(e => e.kind === 'stock' || e.kind === 'portfolio'), false);\n});`,
  'legacy threshold behavior'
);
fs.writeFileSync(legacyPath, legacy);

const uiPath = 'test/ui-contract.test.js';
let ui = fs.readFileSync(uiPath, 'utf8');
ui = replaceOnce(ui, 'assert.match(html, /v2\\.0\\.5/);', 'assert.match(html, /v2\\.3\\.9 • Build 21/);', 'current visible version UI contract');
fs.writeFileSync(uiPath, ui);

console.log('Updated Phase1 visible identity, DOM hook and historical regression contracts.');
