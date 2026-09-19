import fs from 'node:fs';
import { scoreNewsImportance, selectDigestItems } from '../../cloudflare/news-notifications.js';

const health = JSON.parse(fs.readFileSync(process.env.HEALTH_FILE, 'utf8'));
const feed60Body = JSON.parse(fs.readFileSync(process.env.FEED60_FILE, 'utf8'));
const feed200Body = JSON.parse(fs.readFileSync(process.env.FEED200_FILE, 'utf8'));
const items60 = Array.isArray(feed60Body) ? feed60Body : Array.isArray(feed60Body.items) ? feed60Body.items : [];
const items200 = Array.isArray(feed200Body) ? feed200Body : Array.isArray(feed200Body.items) ? feed200Body.items : [];

function clean(v){ return String(v ?? '').replace(/\s+/g,' ').trim(); }
function parsed(v){ const d=new Date(v); return Number.isFinite(d.getTime())?d:null; }
function summarize(items){
  const dates=items.map(x=>parsed(x?.publishedAt)).filter(Boolean).sort((a,b)=>a-b);
  const counts={};
  for(const x of items){ const s=scoreNewsImportance(x); counts[s]=(counts[s]||0)+1; }
  return {
    count:items.length,
    oldest:dates[0]?.toISOString()||null,
    newest:dates.at(-1)?.toISOString()||null,
    scored:counts,
  };
}

const target = new Date('2026-09-19T10:05:00+03:00');
const rawDigest60 = selectDigestItems(items60, {slot:'morning', now:target});
const rawDigest200 = selectDigestItems(items200, {slot:'morning', now:target});

console.log('HEALTH', JSON.stringify({
  ok:health?.ok,
  now:health?.now,
  newsNotificationsEnabled:health?.push?.newsNotificationsEnabled,
  fcmConfigured:health?.push?.fcmConfigured,
  installationCount:health?.push?.installationCount,
  runtime:health?.push?.runtime,
}, null, 2));

console.log('FEED60', JSON.stringify(summarize(items60), null, 2));
console.log('FEED200', JSON.stringify(summarize(items200), null, 2));
console.log('RAW_MORNING_DIGEST_60', JSON.stringify(rawDigest60.map(x=>({
  importance:scoreNewsImportance(x), title:clean(x.title), publishedAt:x.publishedAt, source:x.source, category:x.category, url:x.url
})), null, 2));
console.log('RAW_MORNING_DIGEST_200', JSON.stringify(rawDigest200.map(x=>({
  importance:scoreNewsImportance(x), title:clean(x.title), publishedAt:x.publishedAt, source:x.source, category:x.category, url:x.url
})), null, 2));

const start = new Date('2026-09-18T19:00:00+03:00');
const end = new Date('2026-09-19T10:00:00+03:00');
const windowItems = items200.filter(x=>{
  const d=parsed(x?.publishedAt);
  return d && d>=start && d<end;
}).map(x=>({
  importance:scoreNewsImportance(x),
  publishedAt:x.publishedAt,
  source:x.source,
  category:x.category,
  title:clean(x.title),
  url:x.url,
})).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));

console.log('RAW_WINDOW_ITEMS', JSON.stringify(windowItems, null, 2));
console.log('COUNTS', JSON.stringify({
  rawWindowCount:windowItems.length,
  rawWindowImportance3Plus:windowItems.filter(x=>x.importance>=3).length,
  rawWindowImportance2Plus:windowItems.filter(x=>x.importance>=2).length,
}, null, 2));
