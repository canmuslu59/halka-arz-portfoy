import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Code42 production identity uses Hisse Portföyüm and a higher Play version', () => {
  const gradle = read('../android/app/build.gradle');
  const strings = read('../android/app/src/main/res/values/strings.xml');
  assert.match(gradle, /applicationId ['"]com\.innative\.halkaarz['"]/);
  assert.match(gradle, /versionCode\s+42\b/);
  assert.match(gradle, /versionName ['"]2\.5\.8['"]/);
  assert.match(strings, /<string name="app_name">Hisse Portföyüm<\/string>/);
});

test('store-facing app sources no longer use the old portfolio brand name', () => {
  const sources = [
    read('../public/index.html'),
    read('../public/privacy.html'),
    read('../public/manifest.webmanifest'),
    read('../android/app/src/main/res/values/strings.xml'),
  ];
  for (const source of sources) {
    assert.doesNotMatch(source, /Halka Arz Portföyüm/);
  }
});

test('functional halka arz feature names remain available after the brand rename', () => {
  const index = read('../public/index.html');
  assert.match(index, /Halka Arz Takvimi/);
  assert.match(index, /Halka Arz Pro/);
});

test('about screen advertises the exact Code42 release identity', () => {
  const index = read('../public/index.html');
  assert.match(index, /<h2>Hisse Portföyüm<\/h2>/);
  assert.match(index, /Hisse Portföyüm<br \/>v2\.5\.8 • Build 42/);
});

test('web manifest reflects the general stock-portfolio brand', () => {
  const manifest = JSON.parse(read('../public/manifest.webmanifest'));
  assert.equal(manifest.name, 'Hisse Portföyüm');
  assert.equal(manifest.short_name, 'HissePortföy');
  assert.match(manifest.description, /hisse portföy/i);
});
