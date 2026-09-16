import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyNews,
  normalizeNewsItems,
  parseBloombergBreaking,
  parseBloombergLatest,
  parseTcmbRss,
} from '../cloudflare/news-sources.js';

const latest = readFileSync(new URL('./fixtures/bloomberght-latest.html', import.meta.url), 'utf8');
const breaking = readFileSync(new URL('./fixtures/bloomberght-breaking.html', import.meta.url), 'utf8');
const tcmb = readFileSync(new URL('./fixtures/tcmb-press-rss.xml', import.meta.url), 'utf8');
const now = new Date('2026-09-17T00:00:00+03:00');

test('classifies finance categories deterministically', () => {
  assert.equal(classifyNews('BIST 100 endeksi yükseldi'), 'borsa');
  assert.equal(classifyNews('Dolar/TL kuru geriledi'), 'doviz');
  assert.equal(classifyNews('Altının ons fiyatı yükseldi'), 'altin');
  assert.equal(classifyNews("Halkbank ikincil halka arz için SPK'ya başvurdu"), 'halka-arz');
  assert.equal(classifyNews('Fed faiz oranını artırdı'), 'ekonomi');
  assert.equal(classifyNews("Teknoloji fuarı İstanbul'da başladı"), null);
});

test('parses Bloomberg latest and removes non-financial items', () => {
  const items = parseBloombergLatest(latest, now);
  assert.equal(items.length, 4);
  assert.ok(items.every(item => item.source === 'Bloomberg HT'));
  assert.ok(items.every(item => item.breaking === false));
  assert.ok(items.every(item => item.url.startsWith('https://www.bloomberght.com/')));
  assert.ok(items.some(item => item.category === 'halka-arz'));
  assert.ok(!items.some(item => /Teknoloji fuarı/.test(item.title)));
});

test('only the dedicated breaking source marks items as breaking', () => {
  const breakingItems = parseBloombergBreaking(breaking, now);
  const tcmbItems = parseTcmbRss(tcmb, now);
  assert.equal(breakingItems.length, 3);
  assert.ok(breakingItems.every(item => item.breaking === true));
  assert.ok(tcmbItems.length >= 1);
  assert.ok(tcmbItems.every(item => item.breaking === false));
});

test('normalization dedupes equivalent titles and sorts newest first', () => {
  const a = parseBloombergLatest(latest, now);
  const b = parseBloombergBreaking(breaking, now);
  const duplicate = { ...a[1], id:'different-id', publishedAt:'2026-09-15T12:00:00.000Z' };
  const result = normalizeNewsItems([a, b, [duplicate]]);
  const keys = result.map(item => item.title.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, ' ').trim());
  assert.equal(new Set(keys).size, keys.length);
  for (let i = 1; i < result.length; i += 1) {
    assert.ok(Date.parse(result[i - 1].publishedAt) >= Date.parse(result[i].publishedAt));
  }
  assert.ok(result.every(item => /^news_[a-z0-9]+$/.test(item.id)));
});
