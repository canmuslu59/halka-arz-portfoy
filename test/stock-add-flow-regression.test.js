import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const androidApp = fs.readFileSync(new URL('../android/app/src/main/assets/www/app.js', import.meta.url), 'utf8');
const androidCss = fs.readFileSync(new URL('../android/app/src/main/assets/www/styles.css', import.meta.url), 'utf8');
const androidManifest = fs.readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
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
});

test('Android activity uses adjustResize so WebView receives IME viewport changes where supported', () => {
  assert.match(androidManifest, /<activity[\s\S]*android:name="com\.innative\.halkaarz\.MainActivity"[\s\S]*android:windowSoftInputMode="adjustResize"/);
});

test('Android native IME inset is delivered to CSS and only the add sheet consumes the fallback', () => {
  assert.match(mainActivity, /WindowInsetsCompat\.Type\.ime\(\)/);
  assert.match(mainActivity, /--android-ime-bottom/);
  assert.match(css, /#addSheet\{bottom:max\(var\(--keyboard-inset,0px\),var\(--android-ime-bottom,0px\)\);max-height:calc\(92dvh - max\(var\(--keyboard-inset,0px\),var\(--android-ime-bottom,0px\)\)\)\}/);
});

// Play paketi, public/ kaynağına onaylı overlay'ler ve sürüm değişiklikleri uygulanarak üretilir;
// bire bir kopya değildir. Ekleme akışı düzeltmelerinin pakette de bulunduğu doğrulanır.
test('Android packaged assets keep the verified add-flow fixes from the web source', () => {
  for (const pattern of [
    /let closingAddSheetHistory = false;/,
    /if \(addSheet\?\.hidden !== false\) showSheet\('#addSheet'\);/,
    /if \(addForm\.dataset\.saving === 'true'\) return;/,
    /visualViewport\?\.addEventListener\('resize', syncKeyboardInset/,
  ]) assert.match(androidApp, pattern);
  assert.match(androidCss, /#addSheet\{bottom:max\(var\(--keyboard-inset,0px\),var\(--android-ime-bottom,0px\)\);max-height:calc\(92dvh - max\(var\(--keyboard-inset,0px\),var\(--android-ime-bottom,0px\)\)\)\}/);
});
