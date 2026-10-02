import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createBackupPayload, parseBackupText, BACKUP_FORMAT } from '../android/app/src/main/assets/www/core/labs-backup.js';
import { NEWS_SOURCES, resolveEnabledSources, parseRssFeed, mergeNewsItems, filterNews, buildHoldingMatchers } from '../android/app/src/main/assets/www/core/news-feed.js';

const read = rel => readFileSync(new URL('../' + rel, import.meta.url));
const text = rel => read(rel).toString('utf8');

// Git blob SHA-1; metin dosyalarında CRLF -> LF (Windows checkout'undan bağımsız).
function gitBlobSha(rel) {
  let bytes = read(rel);
  if (!rel.endsWith('.wav')) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

// Code41 (Play'de aktif, Last Known Good) bildirim mekanizmasının dosyaları.
// Kaynak: release/v2.5.7-code41 + onaylı overlay'ler (commit 8f2fc2b). Bu dosyalar Code42'de değişmez.
const CODE41_NOTIFICATION_LOCK = Object.freeze({
  'android/app/src/main/java/com/innative/halkaarz/AlertDiagnostics.java': '250dce7f61cc7551bef5701b82d468d0e2963546',
  'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java': '7d911722cdbd0f7fd1a96317752399c232a6e5e3',
  'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java': '5474484163e63853e9b6639199cc92b9467f11ef',
  'android/app/src/main/java/com/innative/halkaarz/BackgroundRetryPolicy.java': 'f2193e55c752243517aa63d504c802ddf6078619',
  'android/app/src/main/java/com/innative/halkaarz/IpoCalendarParser.java': '2cbad3107ec067644a3b906828946e6ce05b50aa',
  'android/app/src/main/java/com/innative/halkaarz/NativeHttpPolicy.java': '59495d1253dcb742bc72cc25e59bb06c3c78d918',
  'android/app/src/main/java/com/innative/halkaarz/NewsNotificationFormatter.java': 'f2a0a5f62a2d13078fe107c0dc71fb7db7b47d74',
  'android/app/src/main/java/com/innative/halkaarz/NewsTestPreviewWorker.java': 'f6598b56cd62e3c29762f3923ea202768e17a4a0',
  'android/app/src/main/java/com/innative/halkaarz/NewsTestScheduler.java': 'bb34294b9280b92de1c18e08304517cd2439f07a',
  'android/app/src/main/java/com/innative/halkaarz/NewsTestWorker.java': 'f3ebd22c431576b1ef97c50ef35172ea899f56a2',
  'android/app/src/main/java/com/innative/halkaarz/NotificationHelper.java': '794c9b3577c3f11dc2a20dd59105bc4d8ef8f94f',
  'android/app/src/main/java/com/innative/halkaarz/PortfolioAlertRules.java': 'c72d08ce80c472896107117428beece1d2f6beca',
  'android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java': '2636caca40f5eb5ed44bfb80bc2f9e8fe539f25b',
  'android/app/src/main/java/com/innative/halkaarz/PushMessagingService.java': '635f9119993d1767698194f57b266ebb9a15d80e',
  'android/app/src/main/java/com/innative/halkaarz/WalletWidgetProvider.java': 'e95c0c0a050a4ab22c765f67a2b8def8932e910c',
  'android/app/src/main/assets/www/core/notification-rules.js': 'e953ca7205b133af2724b39a0d4ff4c6739fa013',
  'android/app/src/main/assets/www/core/market-reference.js': '81fef009d1eec65d65b0f4f5ec89e4ae4569bd85',
  'android/app/src/main/assets/www/core/market-calendar.js': '13eb6978b14053cc6bbeee7edc7e993169d3a6b9',
  'android/app/src/main/assets/www/core/data-sources.js': '32f1f3182ef3d670426fda6035931c4b8f336a1b',
  'android/app/src/main/assets/www/core/http.js': '7ca9240b782abbafb917ece6b181c7047fa5c016',
  'android/app/src/main/assets/www/notification-recovery.js': 'f071d96b008db323fd02eaf80af817f81f679ccb',
  'android/app/src/main/res/raw/notification_ceiling_coin.wav': 'd097e12f51874e34da450826b777eefdc7e0be43',
  'android/app/src/main/res/raw/notification_floor.wav': 'e85f9eafd3cfd16860cb5347925450871ec6f0da',
  'android/app/src/main/res/raw/notification_rise.wav': '8128e548f8258cd6c605ad2c525df2b6d9cdca98',
  'android/app/src/main/res/xml/network_security_config.xml': '683208ffda765ff9d68c5dc665fc017fe9f5bbdc',
  'android/app/src/main/res/values/strings.xml': 'ad5b305c151e021448509f325efd24c5235e0037',
});

const index = text('android/app/src/main/assets/www/index.html');
const app = text('android/app/src/main/assets/www/app.js');
const styles = text('android/app/src/main/assets/www/styles.css');
const activity = text('android/app/src/main/java/com/innative/halkaarz/MainActivity.java');
const manifest = text('android/app/src/main/AndroidManifest.xml');
const gradle = text('android/app/build.gradle');

test('Code42 keeps every Code41 notification file byte-identical', () => {
  for (const [rel, expected] of Object.entries(CODE41_NOTIFICATION_LOCK)) {
    assert.equal(gitBlobSha(rel), expected, `${rel} Code41 bildirim referansından farklı`);
  }
});

test('Code42 keeps Code41 push wiring in the shell', () => {
  assert.match(manifest, /<service\s+android:name="com\.innative\.halkaarz\.PushMessagingService"\s+android:exported="false">\s*<intent-filter>\s*<action android:name="com\.google\.firebase\.MESSAGING_EVENT" \/>/);
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  for (const call of ['NotificationHelper.ensureChannels(this);', 'BackgroundAlertScheduler.ensure(this);', 'NewsTestScheduler.ensure(this);', 'PushConfigSync.installId(this);', 'PushMessagingService.refreshToken(this);']) {
    assert.ok(activity.includes(call), call);
  }
  assert.match(activity, /PushConfigSync\.saveConfig\(activity, json\)/);
  assert.match(activity, /NotificationHelper\.diagnosticStatus\(activity\)/);
  assert.match(index, /<script type="module" src="\.\/notification-recovery\.js"><\/script>/);
  assert.match(gradle, /firebase-messaging:24\.1\.1/);
  assert.match(gradle, /work-runtime:2\.10\.1/);
});

test('Labs-only news notification controls are not shipped in production', () => {
  for (const marker of ['newsBreakingToggle', 'newsDigestToggle', 'getNewsNotificationPrefs', 'setNewsNotificationPrefs', 'setNewsSources', 'labs_news_notification_prefs_v1']) {
    assert.ok(!index.includes(marker) && !app.includes(marker) && !activity.includes(marker), marker);
  }
});

test('Labs features are present with production identity', () => {
  assert.match(index, /<title>Hisse Portföyüm<\/title>/);
  assert.match(index, /<link rel="stylesheet" href="\.\/labs\.css" \/>/);
  assert.doesNotMatch(index, /Portföy Yönetimi Labs|labs-badge"|Claude Labs/);
  assert.doesNotMatch(app, /Portföy Yönetimi Labs|2\.5\.4-labs/);
  for (const id of ['privacyQuickToggle', 'newsSearch', 'newsFilters', 'newsSourceSettings', 'backupSaveBtn', 'backupShareBtn', 'backupRestoreBtn', 'cacheClearBtn', 'notificationDiagnostics']) {
    assert.match(index, new RegExp(`id="${id}"`), id);
  }
  for (const method of ['openExternalUrl', 'isSystemDarkMode', 'getAppInfo', 'saveBackupFile', 'pickBackupFile', 'shareBackup']) {
    assert.match(activity, new RegExp(`public \\w+ ${method}\\(`), method);
  }
  assert.match(manifest, /android\.support\.customtabs\.action\.CustomTabsService/);
  assert.match(gradle, /androidx\.browser:browser:1\.8\.0/);
  assert.match(text('android/app/src/main/res/xml/share_file_paths.xml'), /<cache-path name="backups" path="backups\/" \/>/);
});

test('light mode keeps Performance totals readable', () => {
  assert.match(styles, /html\[data-theme="light"\] \.history-summary-item\.total strong\{color:#0b7480\}/);
  assert.match(styles, /html\[data-theme="light"\] \.history-chart-tooltip \.tooltip-total b\{color:#0b7480\}/);
  assert.match(styles, /html\[data-theme="light"\] \.history-chart-tooltip strong,html\[data-theme="light"\] \.history-chart-tooltip span b\{color:var\(--text\)\}/);
});

test('backup payload round-trips and accepts Labs backups', () => {
  const portfolio = { holdings:[{ ticker:'ABCDE', lots:10 }], sales:[] };
  const payload = createBackupPayload({ portfolio, settings:{ alertThreshold:'3', other:'x' }, appVersion:'2.5.8', now:new Date('2026-10-02T10:00:00Z') });
  assert.equal(payload.format, BACKUP_FORMAT);
  assert.equal(payload.app.name, 'Hisse Portföyüm');
  assert.deepEqual(payload.settings, { alertThreshold:'3' });
  const parsed = parseBackupText(JSON.stringify(payload));
  assert.deepEqual(parsed.tickers, ['ABCDE']);
  assert.equal(parsed.exportedAt, '2026-10-02T10:00:00.000Z');

  const labsBackup = { ...payload, app:{ name:'Portföy Yönetimi Labs', version:'2.5.4-labs.2' } };
  assert.deepEqual(parseBackupText(JSON.stringify(labsBackup)).tickers, ['ABCDE']);
  assert.throws(() => parseBackupText(JSON.stringify({ ...payload, portfolio:{ holdings:[{ ticker:'bad ticker' }] } })));
  assert.throws(() => parseBackupText('not json'));
});

test('news feed parses RSS, merges duplicates and filters by portfolio', () => {
  assert.deepEqual(resolveEnabledSources(null), { bloomberght:true, aa:true, trt:true, cnnturk:true, haberturk:false });
  const source = NEWS_SOURCES[0];
  const xml = '<rss><channel>' +
    '<item><title>ABCDE hisseleri borsada yükseldi</title><link>https://www.bloomberght.com/a-1</link><pubDate>Thu, 01 Oct 2026 10:00:00 GMT</pubDate></item>' +
    '<item><title><![CDATA[Gram altın fiyatı rekor kırdı]]></title><link>http://www.bloomberght.com/a-2</link></item>' +
    '</channel></rss>';
  const items = parseRssFeed(xml, source, { now:Date.parse('2026-10-02T00:00:00Z') });
  assert.equal(items.length, 2);
  assert.equal(items[1].url, 'https://www.bloomberght.com/a-2');
  assert.equal(items[1].category, 'altin');
  const merged = mergeNewsItems([items, [{ ...items[0], id:'aa:dup', sourceId:'aa' }]]);
  assert.equal(merged.length, 2);
  const matchers = buildHoldingMatchers([{ ticker:'ABCDE', company:'Abcde Teknoloji' }]);
  assert.deepEqual(filterNews(merged, { category:'portfolio', holdingMatchers:matchers }).map(item => item.url), ['https://www.bloomberght.com/a-1']);
});
