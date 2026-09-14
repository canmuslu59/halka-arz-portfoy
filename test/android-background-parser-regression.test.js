import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseAhlatciCalendar } from '../public/core/parsers.js';
const read = p => fs.readFile(new URL('../'+p, import.meta.url), 'utf8');

test('Android back delegates SPA history before exit', async () => {
  const main = await read('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
  const app = await read('public/app.js');
  assert.match(main, /__handleAndroidBack/);
  assert.doesNotMatch(main, /webView\.canGoBack\(\)/);
  assert.match(app, /window\.__handleAndroidBack\s*=/);
  assert.match(app, /history\.back\(\)/);
  assert.match(app, /navDepth/);
});

test('background scheduler runs alerts without holdings and kicks immediate work', async () => {
  const scheduler = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java');
  const sync = await read('android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java');
  const app = await read('public/app.js');
  assert.match(scheduler, /OneTimeWorkRequest/);
  assert.doesNotMatch(scheduler, /holdings\.length\(\)\s*>\s*0/);
  assert.match(sync, /ipoEnabled/);
  assert.doesNotMatch(sync, /holdings\.length\(\)\s*>\s*0/);
  assert.match(app, /ipoEnabled\s*:\s*true/);
  assert.doesNotMatch(app, /initTheme\(\);\s*syncPushConfiguration\(\);/);
  assert.match(app, /state\.portfolio\s*=\s*fresh;[\s\S]{0,500}syncPushConfiguration\(\);/);
});

test('background worker has native IPO fetch, de-dup state and notification permission guard', async () => {
  const worker = await read('android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java');
  assert.match(worker, /gedik\.com\/halka-arz-takvimi/);
  assert.match(worker, /ahlatciyatirim\.com\.tr\/halka-arz/);
  assert.match(worker, /IPO_STATE_KEY/);
  assert.match(worker, /showIpoNotification/);
  assert.match(worker, /NotificationManagerCompat\.from\(context\)\.areNotificationsEnabled\(\)/);
  assert.match(worker, /IpoCalendarParser\.parseGedik\([^)]*\)/);
  assert.match(worker, /IpoCalendarParser\.parse\([^)]*\)/);
});

test('active card parser isolates consortium leader from page intro', () => {
  const html = `<p>Halka arz takvimi, konsorsiyum liderleri ve şirket detayları KAP ve SPK duyurularına göre güncellenmektedir.</p>
  <h2>ŞU AN AKTİF</h2><div><a href="/halka-arz/net-global-endustriyel-yatirimlar">Net Global Endüstriyel Yatırımlar A.Ş.</a>
  NETGL Aktif Halka Arz Fiyatı 25,52 ₺ Talep Tarihleri 9-11 Eylül 2026 Büyüklük 2.233.000.000 ₺ Konsorsiyum Liderleri Tacirler Yatırım <a href="/halka-arz/net-global-endustriyel-yatirimlar">Halka Arza Katıl</a></div>
  <div><a href="/halka-arz/ornek-sirket">Örnek Şirket A.Ş.</a> ORNEK Yaklaşan Halka Arz Fiyatı 10,00 ₺ Talep Tarihleri 15-16 Eylül 2026 Büyüklük 100.000.000 ₺ Konsorsiyum Liderleri Başka Yatırım <a href="/halka-arz/ornek-sirket">Halka Arza Katıl</a></div><h2>Tamamlanmış Halka Arzlar</h2>`;
  const row = parseAhlatciCalendar(html).find(x => x.ticker === 'NETGL');
  assert.deepEqual(row?.consortiumLeaders, ['Tacirler Yatırım']);
});