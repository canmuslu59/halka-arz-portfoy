import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createDataSources } from '../public/core/data-sources.js';
import { parseGedikCalendar } from '../public/core/gedik-calendar.js';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fresh brokerage calendar parser extracts active and valid unlabelled September offers', () => {
  const html = `
    <section class="ipo-card">
      <strong>NETGL</strong>
      <span>Net Global Endüstriyel Yatırımlar A.Ş.</span>
      <b>AKTİF</b>
      <span>9-10-11 Eylül 2026</span>
      <span>25,52 TL</span>
    </section>
    <section class="ipo-card">
      <strong>BKRGY</strong>
      <span>Bakırcı Gayrimenkul Yatırım Ortaklığı A.Ş.</span>
      <span>24-25-26 Ağustos 2026</span>
      <span>12,93 TL</span>
    </section>`;

  const rows = parseGedikCalendar(html);
  const netgl = rows.find(row => row.ticker === 'NETGL');
  assert.equal(netgl?.company, 'Net Global Endüstriyel Yatırımlar A.Ş.');
  assert.equal(netgl?.offerDates, '9-11 Eylül 2026');
  assert.equal(netgl?.ipoPrice, 25.52);
  assert.equal(netgl?.source, 'Gedik Yatırım');
  assert.equal(netgl?.status, 'active');

  const bkrgy = rows.find(row => row.ticker === 'BKRGY');
  assert.equal(bkrgy?.company, 'Bakırcı Gayrimenkul Yatırım Ortaklığı A.Ş.');
  assert.equal(bkrgy?.offerDates, '24-26 Ağustos 2026');
  assert.equal(bkrgy?.ipoPrice, 12.93);
  assert.equal(bkrgy?.status, null);
});

test('native Gedik row grammar does not require a literal AKTİF marker', async () => {
  const parser = await read('android/app/src/main/java/com/innative/halkaarz/IpoCalendarParser.java');
  const start = parser.indexOf('private static final Pattern GEDIK_ACTIVE');
  const end = parser.indexOf('private IpoCalendarParser()', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const grammar = parser.slice(start, end);
  assert.doesNotMatch(grammar, /\\\\s\+AKTİF\\\\s\+/,
    'foreground accepts structurally valid Gedik rows without AKTİF, so native parsing must not require that literal marker');
});

test('UI calendar cross-checks Ahlatci even after a successful empty Gedik response', async () => {
  const calls = [];
  const sources = createDataSources({
    getJson: async () => ({}),
    getText: async url => {
      calls.push(url);
      if (url === 'https://gedik.com/halka-arz-takvimi') {
        return '<html><body><h1>Halka Arz Takvimi</h1><p>Aktif halka arz bulunmuyor.</p></body></html>';
      }
      if (url === 'https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1') {
        return '<html><body><h1>Halka Arz</h1><p>Aktif halka arz bulunmuyor.</p></body></html>';
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const rows = await sources.getIpoCalendar();
  assert.deepEqual(rows, []);
  assert.deepEqual(calls.sort(), [
    'https://gedik.com/halka-arz-takvimi',
    'https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1',
  ].sort());
});

test('UI calendar prefers the current brokerage source and Android native HTTP allows it', async () => {
  const sources = await read('public/core/data-sources.js');
  const policy = await read('android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java');
  assert.match(sources, /gedik\.com\/halka-arz-takvimi/);
  assert.match(sources, /parseGedikCalendar/);
  assert.match(policy, /"gedik\.com"/);
  assert.match(policy, /"www\.gedik\.com"/);
});

test('background IPO worker checks the current calendar and preserves one-notification-per-offering dedupe', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  const parser = await read('android/app/src/main/java/com/innative/halkaarz/IpoCalendarParser.java');
  assert.match(worker, /gedik\.com\/halka-arz-takvimi/);
  assert.match(worker, /IpoCalendarParser\.parseGedik/);
  assert.match(worker, /ipoEventKey/);
  assert.match(worker, /showIpoNotification/);
  assert.match(parser, /parseGedik/);
  assert.match(parser, /AKTİF/);
});

test('background IPO worker independently cross-checks Gedik and Ahlatci before deduping entries', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /List<IpoCalendarParser\.Entry>\s+gedikEntries/);
  assert.match(worker, /List<IpoCalendarParser\.Entry>\s+ahlatciEntries/);
  assert.match(worker, /mergeIpoEntries\s*\(/);
  assert.match(worker, /GEDIK_IPO_CALENDAR_URL/);
  assert.match(worker, /AHLATCI_IPO_CALENDAR_URL/);
});