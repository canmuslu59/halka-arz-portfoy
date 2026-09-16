import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ASSETS = [
  'app.js',
  'index.html',
  'premium-demo.js',
  'premium-charts.js',
  'premium-demo.css',
  'premium-app/index.js',
  'premium-app/router.js',
  'premium-app/premium.css',
  'core/premium-entitlement.js',
  'core/premium-analytics.js',
  'core/premium-alerts.js',
  'core/premium-backup.js',
  'core/premium-watchlist.js',
  'core/logo-resolver.js',
];

test('premium public assets are byte-for-byte mirrored into Android WebView assets', () => {
  for (const relative of ASSETS) {
    const source = path.join('public', relative);
    const bundled = path.join('android/app/src/main/assets/www', relative);
    assert.equal(fs.existsSync(source), true, `source exists: ${relative}`);
    assert.equal(fs.existsSync(bundled), true, `Android asset exists: ${relative}`);
    assert.equal(fs.readFileSync(bundled, 'utf8'), fs.readFileSync(source, 'utf8'), `asset parity: ${relative}`);
  }
});
