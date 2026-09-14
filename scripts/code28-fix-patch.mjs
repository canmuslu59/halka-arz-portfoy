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

// Issue 4: permanently invalid FCM registrations are removed and do not consume delivery budget.
await replaceExact(
  'backend/service.js',
  `function ipoMessage(item = {}) {`,
  `function permanentTokenFailure(error) {\n  return error?.permanentToken === true || error?.code === 'FCM_TOKEN_INVALID';\n}\n\nfunction ipoMessage(item = {}) {`,
);

await replaceExact(
  'backend/service.js',
  `      let delivered = registration.alertState ?? null;\n      let changed = false;\n\n      for (const event of evaluated.events) {\n        if (notificationAttempts >= notificationBudget) {\n          notificationBudgetReached = true;\n          break;\n        }\n        notificationAttempts += 1;\n        try {\n          await sender.send(registration.fcmToken, notificationForAlert(event));\n          delivered = deliveredStateAfter(delivered, day, event);\n          changed = true;\n          sent += 1;\n        } catch {\n          failed += 1;\n        }\n      }\n\n      if (changed) {`,
  `      let delivered = registration.alertState ?? null;\n      let changed = false;\n      let invalidRegistration = false;\n\n      for (const event of evaluated.events) {\n        if (notificationAttempts >= notificationBudget) {\n          notificationBudgetReached = true;\n          break;\n        }\n        notificationAttempts += 1;\n        try {\n          await sender.send(registration.fcmToken, notificationForAlert(event));\n          delivered = deliveredStateAfter(delivered, day, event);\n          changed = true;\n          sent += 1;\n        } catch (error) {\n          failed += 1;\n          if (permanentTokenFailure(error)) {\n            notificationAttempts = Math.max(0, notificationAttempts - 1);\n            invalidRegistration = true;\n            await store.mutate(state => {\n              if (state.installations) delete state.installations[registration.installId];\n            });\n            break;\n          }\n        }\n      }\n\n      if (invalidRegistration) {\n        notificationBudgetReached = false;\n        continue;\n      }\n\n      if (changed) {`,
);
