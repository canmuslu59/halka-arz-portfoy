import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BREAKING_PATTERNS, BREAKING_DAILY_CAP, breakingGuard, breakingKey, breakingTitle,
  classifyBreakingNews, createNewsNotificationEngine, holdingTickers,
} from '../cloudflare/news-notifications.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/breaking-news-cases.json', import.meta.url), 'utf8'));
const javaSource = readFileSync(new URL('../android/app/src/main/java/com/innative/halkaarz/BreakingNewsRules.java', import.meta.url), 'utf8');
const minute = 60_000;

function runJavaProbe(mode, lines) {
  const out = mkdtempSync(path.join(tmpdir(), 'breaking-rules-'));
  const compiled = spawnSync('javac', ['-encoding', 'UTF-8', '-d', out,
    'android/app/src/main/java/com/innative/halkaarz/BreakingNewsRules.java',
    'test/fixtures/BreakingNewsRulesProbe.java'], { encoding:'utf8' });
  assert.equal(compiled.status, 0, compiled.stderr || String(compiled.error));
  const input = path.join(out, `${mode}.tsv`);
  writeFileSync(input, lines.join('\n'), 'utf8');
  const run = spawnSync('java', ['-Dfile.encoding=UTF-8', '-cp', out, 'com.innative.halkaarz.BreakingNewsRulesProbe', mode, input], { encoding:'utf8' });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return run.stdout.trim().split(/\r?\n/);
}

test('breaking rules classify the agreed headline set', () => {
  for (const entry of cases) {
    const result = classifyBreakingNews({ title:entry.title, summary:entry.summary || '' }, { tickers:entry.tickers || [] });
    assert.equal(result?.reason ?? null, entry.expected, entry.title);
    if (entry.ticker) assert.equal(result.ticker, entry.ticker, entry.title);
  }
});

test('cloud and Android use the exact same breaking patterns', () => {
  for (const [key, source] of Object.entries(BREAKING_PATTERNS)) {
    const javaLiteral = JSON.stringify(source);
    assert.ok(javaSource.includes(`pattern("${key}", ${javaLiteral});`), `BreakingNewsRules.java ${key} kalıbı bulutla aynı değil`);
  }
});

test('Android breaking rules decide exactly like the cloud on the same headlines', () => {
  const lines = cases.map(entry => [entry.title, entry.summary || '', (entry.tickers || []).join(','), ''].join('\t'));
  const javaResults = runJavaProbe('classify', lines);
  cases.forEach((entry, index) => {
    const js = classifyBreakingNews({ title:entry.title, summary:entry.summary || '' }, { tickers:entry.tickers || [] });
    assert.equal(javaResults[index], `${js ? js.reason : 'null'}|${js?.ticker || ''}`, entry.title);
  });
});

test('Android also matches portfolio companies by name, not only by ticker', () => {
  const lines = [
    ['Hedef Holding sermaye artırımından vazgeçti', '', 'HEDEF', 'Hedef Holding A.Ş.'],
    ["Enda Enerji'den Urla RES kapasitesini artıracak yatırım", '', 'ENDAE', 'Enda Enerji Holding A.Ş.'],
    ['Aselsan yeni ihracat sözleşmesi imzaladı', '', 'ASELS', 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.'],
    ['Hedefimiz enflasyonu düşürmek', '', 'HEDEF', 'Hedef Holding A.Ş.'],
  ].map(parts => parts.join('\t'));
  assert.deepEqual(runJavaProbe('classify', lines), ['portfolio|HEDEF', 'portfolio|ENDAE', 'portfolio|ASELS', 'null|']);
});

test('guard spaces breaking news, applies topic cooldowns and a daily cap', () => {
  const now = Date.parse('2026-10-03T14:00:00+03:00');
  const rate = { reason:'rate', ticker:'' };
  const fx = { reason:'fx', ticker:'' };
  const portfolio = { reason:'portfolio', ticker:'ASELS' };
  assert.equal(breakingGuard([], rate, now), 'send');
  assert.equal(breakingGuard([], rate, now, { sentThisRun:true }), 'defer');
  assert.equal(breakingGuard([{ key:'market', at:new Date(now - 5 * minute).toISOString() }], rate, now), 'defer');
  assert.equal(breakingGuard([{ key:'rate', at:new Date(now - 30 * minute).toISOString() }], rate, now), 'drop');
  assert.equal(breakingGuard([{ key:'rate', at:new Date(now - 61 * minute).toISOString() }], rate, now), 'send');
  assert.equal(breakingGuard([{ key:'fx', at:new Date(now - 5 * 60 * minute).toISOString() }], fx, now), 'drop');
  assert.equal(breakingGuard([{ key:'portfolio:THYAO', at:new Date(now - 20 * minute).toISOString() }], portfolio, now), 'send');
  const full = Array.from({ length:BREAKING_DAILY_CAP }, (_, index) => ({ key:`market-${index}`, at:new Date(now - (index + 1) * 20 * minute).toISOString() }));
  assert.equal(breakingGuard(full, rate, now), 'drop');
  assert.equal(breakingKey(portfolio), 'portfolio:ASELS');
  assert.equal(breakingTitle(portfolio), '🔴 Son Dakika · ASELS');
  assert.equal(breakingTitle(rate), '🔴 Son Dakika');
});

test('Android guard makes the same decisions as the cloud guard', () => {
  const now = Date.parse('2026-10-03T14:00:00+03:00');
  const scenarios = [
    ['rate', '', now, false, []],
    ['rate', '', now, true, []],
    ['rate', '', now, false, [['market', now - 5 * minute]]],
    ['rate', '', now, false, [['rate', now - 30 * minute]]],
    ['rate', '', now, false, [['rate', now - 61 * minute]]],
    ['fx', '', now, false, [['fx', now - 5 * 60 * minute]]],
    ['portfolio', 'ASELS', now, false, [['portfolio:THYAO', now - 20 * minute]]],
    ['rate', '', now, false, Array.from({ length:BREAKING_DAILY_CAP }, (_, index) => [`market-${index}`, now - (index + 1) * 20 * minute])],
    ['market', '', Date.parse('2026-10-04T00:05:00+03:00'), false, Array.from({ length:BREAKING_DAILY_CAP }, (_, index) => [`market-${index}`, now - index * minute])],
  ];
  const lines = scenarios.map(([reason, ticker, at, sent, log]) => [reason, ticker, at, sent, log.map(([key, ms]) => `${key}@${ms}`).join(',')].join('\t'));
  const javaResults = runJavaProbe('guard', lines);
  scenarios.forEach(([reason, ticker, at, sent, log], index) => {
    const js = breakingGuard(log.map(([key, ms]) => ({ key, at:new Date(ms).toISOString() })), { reason, ticker }, at, { sentThisRun:sent });
    assert.equal(javaResults[index], js, `senaryo ${index}`);
  });
});

test('only active holdings with valid tickers feed portfolio matching', () => {
  assert.deepEqual(holdingTickers({ holdings:[{ ticker:'asels', lots:10 }, { ticker:'THYAO', lots:0 }, { ticker:'X', lots:5 }, { ticker:'ASELS', lots:3 }] }), ['ASELS']);
});

function engineFor(items, { holdings = [], nowRef }) {
  const state = { installations:{ phone1:{ installId:'phone1', fcmToken:'token-1', newsEnabled:true, holdings } } };
  const store = {
    async read() { return structuredClone(state); },
    async mutate(fn) { return fn(state); },
  };
  const feed = { items };
  const sent = [];
  const engine = createNewsNotificationEngine({
    store,
    sender:{ async send(token, message) { sent.push(message); } },
    fetchNews:async () => feed.items,
    now:() => new Date(nowRef.value),
  });
  return { engine, sent, state, feed };
}

const feedItem = (title, publishedAt, id) => ({ id, title, publishedAt, url:`https://www.bloomberght.com/haber-${id}-1234567`, category:'ekonomi', source:'Bloomberg HT' });

test('engine sends one breaking per run, defers the rest and opens the article on tap', async () => {
  const nowRef = { value:'2026-10-03T14:01:00+03:00' };
  const { engine, sent } = engineFor([
    feedItem('TCMB politika faizini 500 baz puan artırdı', '2026-10-03T14:00:00+03:00', 'n1'),
    feedItem('Borsa İstanbul işlemleri geçici olarak durdurdu', '2026-10-03T13:58:00+03:00', 'n2'),
    feedItem('Dolar güne yatay başladı', '2026-10-03T13:59:00+03:00', 'n3'),
  ], { nowRef });
  await engine.check();
  const breaking = () => sent.filter(message => message.data.kind === 'news_breaking');
  assert.equal(breaking().length, 1);
  assert.equal(breaking()[0].title, '🔴 Son Dakika');
  assert.equal(breaking()[0].data.breaking_reason, 'rate');
  assert.equal(breaking()[0].data.news_url, 'https://www.bloomberght.com/haber-n1-1234567');

  nowRef.value = '2026-10-03T14:05:00+03:00';
  await engine.check();
  assert.equal(breaking().length, 1, 'iki son dakika arasında en az 10 dakika olmalı');

  nowRef.value = '2026-10-03T14:12:00+03:00';
  await engine.check();
  assert.equal(breaking().length, 2);
  assert.equal(breaking()[1].data.breaking_reason, 'market');

  nowRef.value = '2026-10-03T14:30:00+03:00';
  await engine.check();
  assert.equal(breaking().length, 2, 'gönderilen haberler tekrar gelmez');
});

test('engine personalises portfolio breaking news with the ticker', async () => {
  const nowRef = { value:'2026-10-03T14:01:00+03:00' };
  const { engine, sent } = engineFor([
    feedItem("ASELS'ten 100 milyon dolarlık yeni sözleşme", '2026-10-03T14:00:00+03:00', 'p1'),
  ], { holdings:[{ ticker:'ASELS', lots:25 }], nowRef });
  await engine.check();
  const breaking = sent.filter(message => message.data.kind === 'news_breaking');
  assert.equal(breaking.length, 1);
  assert.equal(breaking[0].title, '🔴 Son Dakika · ASELS');
  assert.equal(breaking[0].data.ticker, 'ASELS');
  assert.equal(breaking[0].data.breaking_reason, 'portfolio');
});

test('a related story inside the topic cooldown is skipped instead of trickling later', async () => {
  const nowRef = { value:'2026-10-03T14:01:00+03:00' };
  const { engine, sent, state, feed } = engineFor([
    feedItem('TCMB politika faizini 500 baz puan artırdı', '2026-10-03T14:00:00+03:00', 'r1'),
  ], { nowRef });
  await engine.check();
  feed.items = [...feed.items, feedItem('Fed faiz oranını sabit tuttu', '2026-10-03T14:20:00+03:00', 'r2')];
  nowRef.value = '2026-10-03T14:21:00+03:00';
  await engine.check();
  nowRef.value = '2026-10-03T15:05:00+03:00';
  await engine.check();
  assert.equal(sent.filter(message => message.data.kind === 'news_breaking').length, 1);
  assert.ok(state.installations.phone1.newsState.breakingSeen.includes('r2'));
});

test('single-headline routine news carries the article address for tap-through', async () => {
  const nowRef = { value:'2026-10-03T14:01:00+03:00' };
  const { engine, sent } = engineFor([
    feedItem('Enda Enerji Urla RES kapasitesini artıracak yatırım başlattı', '2026-10-03T12:00:00+03:00', 'd1'),
  ], { nowRef });
  await engine.check();
  const routine = sent.find(message => message.data.kind === 'news_digest' && message.data.routine_interval_hours === '6');
  assert.ok(routine, 'rutin haber gönderilmeli');
  assert.equal(routine.data.news_url, 'https://www.bloomberght.com/haber-d1-1234567');
});
