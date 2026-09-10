import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseAhlatciCalendar } from '../public/core/parsers.js';

async function read(path) { return fs.readFile(path, 'utf8'); }

const activeCardHtml = `
<section>
  <h2>Talep Toplayan Halka Arzlar</h2>
  <article class="ipo-card">
    <a href="/halka-arz/net-global-endustriyel-yatirimlar"><h3>Net Global Endüstriyel Yatırımlar A.Ş.</h3></a>
    <span>NETGL</span><span>Aktif</span>
    <div>Halka Arz Fiyatı <strong>25,52 ₺</strong></div>
    <div>Talep Tarihleri <strong>9-11 Eylül 2026</strong></div>
    <div>Büyüklük <strong>2.233.000.000 ₺</strong></div>
    <div>Konsorsiyum Liderleri <strong>Tacirler Yatırım</strong></div>
  </article>
</section>`;

const completedRow = `
<table><tr>
<td>İntetra Teknoloji ve Bilişim Hizmetleri A.Ş. INTET</td><td>Bilişim ve Yazılım</td><td>53,60 ₺</td>
<td>26-27 Ağustos 2026</td><td>2.144.000.000 ₺</td><td>Bulls Yatırım</td>
<td><a href="/halka-arz/intetra-teknoloji">İncele</a></td>
</tr></table>`;

test('calendar includes active/upcoming cards above the completed archive table', () => {
  const items = parseAhlatciCalendar(activeCardHtml + completedRow);
  const netgl = items.find(item => item.ticker === 'NETGL');
  assert.ok(netgl, 'NETGL active card must be included');
  assert.equal(netgl.company, 'Net Global Endüstriyel Yatırımlar A.Ş.');
  assert.equal(netgl.ipoPrice, 25.52);
  assert.equal(netgl.offerDates, '9-11 Eylül 2026');
  assert.equal(netgl.ipoSizeTRY, 2233000000);
  assert.deepEqual(netgl.consortiumLeaders, ['Tacirler Yatırım']);
  assert.match(netgl.detailUrl, /net-global-endustriyel-yatirimlar/);
  assert.ok(items.some(item => item.ticker === 'INTET'));
});

test('calendar deduplicates an IPO present in both card and table representations', () => {
  const duplicateRow = `<table><tr><td>Net Global Endüstriyel Yatırımlar A.Ş. NETGL</td><td>Yatırım</td><td>25,52 ₺</td><td>9-11 Eylül 2026</td><td>2.233.000.000 ₺</td><td>Tacirler Yatırım</td><td><a href="/halka-arz/net-global-endustriyel-yatirimlar">İncele</a></td></tr></table>`;
  const items = parseAhlatciCalendar(activeCardHtml + duplicateRow);
  assert.equal(items.filter(item => item.ticker === 'NETGL').length, 1);
});

test('rise, ceiling and floor notifications use three distinct custom sound channels', async () => {
  const java = await read('android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java');
  assert.match(java, /CHANNEL_RISE\s*=\s*"market_rise_v1"/);
  assert.match(java, /CHANNEL_CEILING\s*=\s*"market_ceiling_coin_v1"/);
  assert.match(java, /CHANNEL_FLOOR\s*=\s*"market_floor_v1"/);
  assert.match(java, /R\.raw\.notification_rise/);
  assert.match(java, /R\.raw\.notification_ceiling_coin/);
  assert.match(java, /R\.raw\.notification_floor/);
  assert.match(java, /"ceiling"\.equals\(kind\)\) channel = CHANNEL_CEILING/);
  assert.match(java, /"floor"\.equals\(kind\)\) channel = CHANNEL_FLOOR/);
  assert.match(java, /"portfolio"\.equals\(kind\)\) channel = CHANNEL_RISE/);
  assert.match(java, /else channel = CHANNEL_MARKET/);
});

test('custom notification WAV resources are present and non-empty', async () => {
  for (const file of ['notification_rise.wav', 'notification_ceiling_coin.wav', 'notification_floor.wav']) {
    const data = await fs.readFile(`android/app/src/main/res/raw/${file}`);
    assert.equal(data.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(data.subarray(8, 12).toString('ascii'), 'WAVE');
    assert.ok(data.length > 8000, `${file} must contain audible PCM data`);
  }
});

test('Code21 invalidates old IPO calendar cache and advances Play identity', async () => {
  const service = await read('public/core/ipo-service.js');
  const gradle = await read('android/app/build.gradle');
  const html = await read('public/index.html');
  assert.match(service, /halka_arz_calendar_cache_v2/);
  assert.match(gradle, /versionCode 21/);
  assert.match(gradle, /versionName ['"]2\.3\.9['"]/);
  assert.match(html, /v2\.3\.9\s*•\s*Build 21/);
});
