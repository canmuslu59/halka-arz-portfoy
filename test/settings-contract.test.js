import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('bottom navigation exposes Settings as the fourth primary tab', async () => {
  const html = await read('public/index.html');
  const css = await read('public/styles.css');
  assert.match(html, /id="settingsView"/);
  assert.match(html, /id="settingsTab"[^>]+data-view="settings"/);
  assert.match(css, /grid-template-columns:\s*repeat\(4,1fr\)/);
});

test('Settings contains default-on 3 percent alert controls from 1 to 10 in half points', async () => {
  const html = await read('public/index.html');
  assert.match(html, /id="notificationEnabled"[^>]+checked/);
  assert.match(html, /id="notificationThreshold"[^>]+min="1"[^>]+max="10"[^>]+step="0\.5"[^>]+value="3"/);
  assert.match(html, /id="notificationThresholdValue"/);
  assert.match(html, /id="requestNotificationPermission"/);
  assert.match(html, /id="notificationPermissionStatus"/);
});

test('theme toggle is restored to topbar and removed from Settings', async () => {
  const html = await read('public/index.html');
  const app = await read('public/app.js');
  assert.match(html, /id="themeToggle"/);
  assert.doesNotMatch(html, /id="themeSetting"/);
  assert.match(app, /themeToggle/);
  assert.match(app, /nextTheme/);
  assert.match(html, /Halka Arz Portföyüm/);
  assert.match(html, /v2\.4\.1\s*•\s*Build 23/);
});

test('app wires Settings, native notification permission and visibility-aware refresh', async () => {
  const app = await read('public/app.js');
  assert.match(app, /settings:\s*\{\s*title:'Ayarlar'/);
  assert.match(app, /getNotificationPermissionStatus/);
  assert.match(app, /requestNotificationPermission/);
  assert.match(app, /document\.hidden/);
  assert.match(app, /15_000/);
  assert.match(app, /30_000/);
  assert.match(app, /300_000/);
});
