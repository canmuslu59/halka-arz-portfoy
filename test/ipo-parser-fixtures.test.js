import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAhlatciCalendar, parseAhlatciList, parseAhlatciDetail } from '../public/core/parsers.js';

const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('saved active/upcoming IPO fixture keeps NETGL consortium data scoped to its card', async () => {
  const html = await fixture('ahlatci-active-upcoming.html');
  const items = parseAhlatciCalendar(html);
  const netgl = items.find(item => item.ticker === 'NETGL');
  const upcoming = items.find(item => item.ticker === 'ORNEK');

  assert.ok(netgl);
  assert.equal(netgl.company, 'Net Global Endüstriyel Yatırımlar A.Ş.');
  assert.equal(netgl.ipoPrice, 25.52);
  assert.equal(netgl.offerDates, '9-11 Eylül 2026');
  assert.deepEqual(netgl.consortiumLeaders, ['Tacirler Yatırım']);

  assert.ok(upcoming);
  assert.equal(upcoming.company, 'Örnek Teknoloji A.Ş.');
  assert.equal(upcoming.offerDates, '15-16 Eylül 2026');
  assert.deepEqual(upcoming.consortiumLeaders, ['Örnek Yatırım']);
});

test('saved archive fixture parses independently', async () => {
  const html = await fixture('ahlatci-archive.html');
  const items = parseAhlatciCalendar(html);
  const intet = items.find(item => item.ticker === 'INTET');
  assert.ok(intet);
  assert.equal(intet.ipoPrice, 53.6);
  assert.equal(intet.sector, 'Bilişim ve Yazılım');
  assert.equal(intet.offerDates, '26-27 Ağustos 2026');
});

test('saved detail fixture enriches the archive record independently', async () => {
  const archive = await fixture('ahlatci-archive.html');
  const detailHtml = await fixture('ahlatci-detail.html');
  const base = parseAhlatciList(archive, 'INTET');
  assert.ok(base);
  const detail = parseAhlatciDetail(detailHtml, base);
  assert.equal(detail.ipoPrice, 53.6);
  assert.equal(detail.firstTradeDate, '2026-08-31');
  assert.equal(detail.source, 'Ahlatcı Yatırım');
});

test('saved active/upcoming and archive fixtures normalize together without dropping records', async () => {
  const active = await fixture('ahlatci-active-upcoming.html');
  const archive = await fixture('ahlatci-archive.html');
  const items = parseAhlatciCalendar(`${active}\n${archive}`);
  assert.deepEqual(new Set(items.map(item => item.ticker)), new Set(['NETGL', 'ORNEK', 'INTET']));
});
