import fs from 'node:fs/promises';

async function replaceRequired(path, from, to) {
  const original = await fs.readFile(path, 'utf8');
  if (!original.includes(from)) throw new Error(`Expected cleanup fragment not found in ${path}`);
  const next = original.replace(from, to);
  if (next === original) throw new Error(`Cleanup made no change in ${path}`);
  await fs.writeFile(path, next);
}

// One-time cleanup after the guarded patch helper re-applied two already-completed changes.
await replaceRequired(
  'backend/service.js',
  `function permanentTokenFailure(error) {\n  return error?.permanentToken === true || error?.code === 'FCM_TOKEN_INVALID';\n}\n\nfunction permanentTokenFailure(error) {\n  return error?.permanentToken === true || error?.code === 'FCM_TOKEN_INVALID';\n}`,
  `function permanentTokenFailure(error) {\n  return error?.permanentToken === true || error?.code === 'FCM_TOKEN_INVALID';\n}`,
);

await replaceRequired(
  'cloudflare/durable-store.js',
  `import { fetchCloudflareIpoCalendar } from './ipo-calendar.js';\nimport { fetchCloudflareIpoCalendar } from './ipo-calendar.js';`,
  `import { fetchCloudflareIpoCalendar } from './ipo-calendar.js';`,
);
