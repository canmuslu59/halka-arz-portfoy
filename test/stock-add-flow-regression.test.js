import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const androidApp = fs.readFileSync(new URL('../android/app/src/main/assets/www/app.js', import.meta.url), 'utf8');
const androidCss = fs.readFileSync(new URL('../android/app/src/main/assets/www/styles.css', import.meta.url), 'utf8');
const mainActivity = fs.readFileSync(new URL('../android/app/src/main/java/com/innative/halkaarz/MainActivity.java', import.meta.url), 'utf8');

test('closing add sheet skips stale duplicate add-sheet history entries', () => {
  assert.match(app, /let closingAddSheetHistory = false;/);
  assert.match(app, /closingAddSheetHistory && nav\?\.sheet === '#addSheet'/);
  assert.match(app, /if \(currentSheet === '#addSheet'\) closingAddSheetHistory = true;/);
});

test('opening add sheet is idempotent and does not reset or repush an already-open add sheet', () => {
  assert.match(app, /const addSheet = \$\('#addSheet'\);/);
  assert.match(app, /window\.history\.state\?\.sheet === '#addSheet' \|\| addSheet\?\.hidden === false/);
  assert.match(app, /if \(addSheet\?\.hidden !== false\) showSheet\('#addSheet'\);/);
});

test('add form suppresses duplicate submits while save is in flight', () => {
  assert.match(app, /if \(addForm\.dataset\.saving === 'true'\) return;/);
  assert.match(app, /addForm\.dataset\.saving = 'true';/);
  assert.match(app, /addForm\.dataset\.saving = 'false';/);
});

test('add sheet follows the visual viewport so the keyboard cannot cover ticker input', () => {
  assert.match(app, /window\.visualViewport/);
  assert.match(app, /--keyboard-inset/);
  assert.match(app, /visualViewport\?\.addEventListener\('resize', syncKeyboardInset/);
  assert.match(css, /#addSheet\{bottom:var\(--keyboard-inset,0px\);max-height:calc\(92dvh - var\(--keyboard-inset,0px\)\)\}/);
});

test('Android IME inset is forwarded to the add sheet when WebView visualViewport does not resize', () => {
  assert.match(mainActivity, /WindowInsetsCompat\.Type\.ime\(\)/);
  assert.match(mainActivity, /--android-keyboard-inset/);
  assert.match(css, /--android-keyboard-inset/);
  assert.match(css, /max\(var\(--keyboard-inset,0px\),var\(--android-keyboard-inset,0px\)\)/);
});

test('Android packaged assets exactly mirror the verified web source', () => {
  assert.equal(androidApp, app);
  assert.equal(androidCss, css);
});
