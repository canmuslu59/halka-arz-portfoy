import fs from 'node:fs/promises';

async function replaceExact(path, from, to) {
  const original = await fs.readFile(path, 'utf8');
  if (original.includes(to)) return false;
  if (!original.includes(from)) throw new Error(`Expected source fragment not found in ${path}`);
  const next = original.replace(from, to);
  if (next === original) throw new Error(`Patch made no change in ${path}`);
  await fs.writeFile(path, next);
  return true;
}

// Issue 2: never fabricate a previous close from the current-session tick.
const parserBefore = `  const previousClose = Number.isFinite(meta.previousClose) ? meta.previousClose\n    : previousRow?.close\n      ?? (Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : lastClose);`;
const parserAfter = `  const previousClose = Number.isFinite(meta.previousClose) ? meta.previousClose\n    : previousRow?.close\n      ?? (Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : null);`;

for (const path of [
  'public/core/parsers.js',
  'android/app/src/main/assets/www/core/parsers.js',
]) {
  await replaceExact(path, parserBefore, parserAfter);
}

await replaceExact(
  'android/app/src/main/java/com/innative/halkaarz/BackgroundAlertWorker.java',
  `        if (!Double.isFinite(previousClose)) previousClose = chartPreviousClose;\n        if (!Double.isFinite(previousClose)) previousClose = latestTickClose;\n        if (!(current > 0) || !(previousClose > 0)) throw new IllegalStateException("Eksik fiyat verisi.");`,
  `        if (!Double.isFinite(previousClose)) previousClose = chartPreviousClose;\n        if (!(current > 0) || !(previousClose > 0)) throw new IllegalStateException("Eksik fiyat verisi.");`,
);

// Issue 3: IPO identities include the offer window, so a ticker can be offered again without being suppressed.
await replaceExact(
  'backend/service.js',
  `      || item.subscriptionPeriod\n      || item.dates`,
  `      || item.subscriptionPeriod\n      || item.offerDates\n      || item.dates`,
);

await replaceExact(
  'cloudflare/durable-store.js',
  `import { fetchYahooQuote } from './yahoo-quote.js';`,
  `import { fetchYahooQuote } from './yahoo-quote.js';\nimport { fetchCloudflareIpoCalendar } from './ipo-calendar.js';`,
);

await replaceExact(
  'cloudflare/durable-store.js',
  `          getQuote:ticker => fetchYahooQuote(ticker),\n          getIpoCalendar:async()=>[],`,
  `          getQuote:ticker => fetchYahooQuote(ticker),\n          getIpoCalendar:() => fetchCloudflareIpoCalendar(),`,
);

await replaceExact(
  'cloudflare/durable-store.js',
  `    try {\n      if (!status.isOpen) {\n        await store.runtimeWrite({\n          status:'market_closed',\n          startedAt:started.toISOString(),\n          finishedAt:new Date().toISOString(),\n          result:null,\n        });\n        return;\n      }\n\n      const sender = createCloudflareFcmSender({\n        serviceAccountJson:this.env.FIREBASE_SERVICE_ACCOUNT_JSON,\n      });\n      const service = createPushService({\n        store,\n        sender,\n        dataSources:{\n          getQuote:ticker => fetchYahooQuote(ticker),\n          getIpoCalendar:() => fetchCloudflareIpoCalendar(),\n        },\n        now:()=>started,\n      });\n      const result = await service.marketCheck({`,
  `    try {\n      const sender = createCloudflareFcmSender({\n        serviceAccountJson:this.env.FIREBASE_SERVICE_ACCOUNT_JSON,\n      });\n      const service = createPushService({\n        store,\n        sender,\n        dataSources:{\n          getQuote:ticker => fetchYahooQuote(ticker),\n          getIpoCalendar:() => fetchCloudflareIpoCalendar(),\n        },\n        now:()=>started,\n      });\n      const ipo = await service.ipoCheck();\n      if (!status.isOpen) {\n        await store.runtimeWrite({\n          status:'market_closed',\n          startedAt:started.toISOString(),\n          finishedAt:new Date().toISOString(),\n          result:{ ipo },\n        });\n        return;\n      }\n\n      const result = await service.marketCheck({`,
);

await replaceExact(
  'cloudflare/durable-store.js',
  `        result,\n      });`,
  `        result:{ ...result, ipo },\n      });`,
);
