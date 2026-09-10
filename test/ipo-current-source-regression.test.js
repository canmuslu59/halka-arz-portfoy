import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createDataSources } from '../public/core/data-sources.js';
import { parseGedikCalendar } from '../public/core/gedik-calendar.js';

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fresh brokerage calendar parser extracts the active NETGL September offer', () => {
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
});

test('UI calendar treats a successful empty current source as authoritative', async () => {
  const calls = [];
  const sources = createDataSources({
    getJson: async () => ({}),
    getText: async url => {
      calls.push(url);
      if (url === 'https://gedik.com/halka-arz-takvimi') {
        return '<html><body><h1>Halka Arz Takvimi</h1><p>Aktif halka arz bulunmuyor.</p></body></html>';
      }
      throw new Error(`Fallback must not be requested after a successful current-source response: ${url}`);
    },
  });

  const rows = await sources.getIpoCalendar();
  assert.deepEqual(rows, []);
  assert.deepEqual(calls, ['https://gedik.com/halka-arz-takvimi']);
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
