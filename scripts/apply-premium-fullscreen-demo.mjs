import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceOnce(path, source, needle, replacement) {
  if (!source.includes(needle)) throw new Error(`${path}: expected anchor not found: ${needle.slice(0, 90)}`);
  return source.replace(needle, replacement);
}

function ensureReplacement(path, source, needle, replacement) {
  if (source.includes(replacement)) return source;
  return replaceOnce(path, source, needle, replacement);
}

for (const required of [
  'public/premium-app/index.js',
  'public/premium-app/router.js',
  'public/premium-app/premium.css',
  'public/premium-demo.js',
]) {
  if (!fs.existsSync(required)) throw new Error(`Premium mini app asset missing: ${required}`);
}

// Premium Test still supports older Android System WebView versions used by the
// production shell. The transforms are deliberately idempotent because this
// integration step can be invoked more than once by local/CI validation flows.
const premiumAppPath = 'public/premium-app/index.js';
let premiumApp = read(premiumAppPath);
premiumApp = ensureReplacement(
  premiumAppPath,
  premiumApp,
  'displayDate(rows.at(-1).date)',
  'displayDate(rows[rows.length - 1].date)',
);
premiumApp = ensureReplacement(
  premiumAppPath,
  premiumApp,
  "const worst = analytics.holdingContributions?.at(-1) || null;",
  "const worstRows = analytics.holdingContributions || [];\n  const worst = worstRows.length ? worstRows[worstRows.length - 1] : null;",
);

// The normal calendar can open a specific IPO directly in Premium. Keep that
// deep-link bridge explicit in the isolated mini-app public API.
premiumApp = ensureReplacement(
  premiumAppPath,
  premiumApp,
  'const api = { mount, update, close, destroy, navigate, getState:',
  'const api = { mount, update, close, destroy, navigate, openIpo, getState:',
);
write(premiumAppPath, premiumApp);

const indexPath = 'public/index.html';
let index = read(indexPath);
if (!index.includes('id="premiumEntry"')) {
  const anchor = '        <button id="themeToggle" class="icon-btn theme-toggle" aria-label="Açık temaya geç" title="Tema">';
  const entry = '        <button id="premiumEntry" class="premium-entry-btn" type="button" aria-label="Premium’u keşfet" title="Premium’u keşfet"><span>♛</span><b>Premium</b></button>\n';
  index = replaceOnce(indexPath, index, anchor, `${entry}${anchor}`);
  write(indexPath, index);
}

const appPath = 'public/app.js';
let app = read(appPath);
if (!app.includes("$('#premiumEntry')?.addEventListener('click'")) {
  const anchor = "$('#themeToggle')?.addEventListener('click', () => applyTheme(nextTheme(state.theme)));";
  const wiring = "$('#premiumEntry')?.addEventListener('click', () => switchView('pro'));\n";
  app = replaceOnce(appPath, app, anchor, `${wiring}${anchor}`);
  write(appPath, app);
}

console.log('Premium mini app integration is ready and idempotent.');
