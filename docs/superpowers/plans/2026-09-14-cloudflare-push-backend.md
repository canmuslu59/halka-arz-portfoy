# Cloudflare Push Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paid Render push runtime with a Cloudflare Workers + D1 backend that checks market alerts every two minutes, sends FCM notifications, and preserves Android's 15-minute WorkManager fallback.

**Architecture:** Keep the existing pure alert engine and `createPushService()` contract, add a D1-backed store that implements the same `read()/mutate()` interface, and add a Worker entrypoint for HTTP registration/health plus a Cron `scheduled()` handler. Use a Worker-specific FCM HTTP v1 sender implemented with Web Crypto; keep Firebase credentials only in Cloudflare encrypted secrets and keep the Android Firebase config injected by CI.

**Tech Stack:** JavaScript ES modules, Node 22 tests, Cloudflare Workers, D1, Wrangler, Firebase Cloud Messaging HTTP v1, Android/Gradle.

**Spec:** `docs/superpowers/specs/2026-09-14-cloudflare-push-backend-design.md`

## Global Constraints

- Production target stays `2.4.6 / versionCode 28`; Code28 has not been uploaded to Play.
- Cron cadence is exactly `*/2 * * * *` (two minutes).
- Market-open decisions use `Europe/Istanbul`; Cloudflare Cron itself is UTC.
- Android WorkManager remains exactly 15 minutes as fallback.
- Keep positive portfolio, negative portfolio, ceiling and floor semantics unchanged.
- Delivery state advances only after successful FCM delivery.
- Aggregate portfolio alerts still require fresh same-day quotes for every active holding.
- Cloudflare Workers Free guardrail: maximum 30 unique quote subrequests and 15 FCM sends per scheduled invocation, leaving headroom under the 50-subrequest limit.
- `FIREBASE_SERVICE_ACCOUNT_JSON`, `google-services.json`, signing keys and passwords never enter Git.
- Final upload certificate must remain `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`.

---

### Task 1: Add Cloudflare tooling, D1 schema, and a D1 store adapter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `wrangler.jsonc`
- Create: `migrations/0001_push_backend.sql`
- Create: `cloudflare/d1-store.js`
- Create: `test/cloudflare-d1-store.test.js`

**Interfaces:**
- Consumes: Cloudflare D1 binding `env.DB`.
- Produces: `createD1Store(db)` returning `{ read(), mutate(mutator), runtimeRead(), runtimeWrite(value) }`.
- `read()` returns `{ installations: { [installId]: registration } }`, matching `backend/service.js`.
- `mutate(mutator)` applies the existing state-object mutation contract and persists changed installation rows with a D1 `batch()` transaction.

- [ ] **Step 1: Write the failing D1 store tests**

Create `test/cloudflare-d1-store.test.js` with a fake D1 binding that supports `prepare().bind().all()/first()/run()` and `batch()`. Cover these exact behaviors:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1Store } from '../cloudflare/d1-store.js';

test('D1 store reads installation rows into the existing push-service state shape', async () => {
  const db = fakeD1({
    installations:[{
      install_id:'550e8400-e29b-41d4-a716-446655440000',
      fcm_token:'token-1', enabled:1, threshold:3, ipo_enabled:1,
      holdings_json:'[{"ticker":"THYAO","lots":7}]',
      alert_state_json:'{"day":"2026-09-14","portfolio":[3],"limits":{},"stocks":{}}',
      ipo_state_json:null, created_at:'2026-09-14T10:00:00.000Z', updated_at:'2026-09-14T10:00:00.000Z',
    }],
  });
  const state = await createD1Store(db).read();
  assert.equal(state.installations['550e8400-e29b-41d4-a716-446655440000'].threshold, 3);
  assert.deepEqual(state.installations['550e8400-e29b-41d4-a716-446655440000'].holdings, [{ticker:'THYAO',lots:7}]);
});

test('D1 mutate preserves alert state while replacing registration preferences', async () => {
  const db = fakeD1(/* one seeded installation */);
  const store = createD1Store(db);
  await store.mutate(state => {
    const item = state.installations['550e8400-e29b-41d4-a716-446655440000'];
    item.threshold = 4.5;
    item.holdings = [{ticker:'EREGL',lots:3}];
  });
  const next = await store.read();
  assert.equal(next.installations['550e8400-e29b-41d4-a716-446655440000'].threshold, 4.5);
  assert.deepEqual(next.installations['550e8400-e29b-41d4-a716-446655440000'].alertState.portfolio, [3]);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node --test test/cloudflare-d1-store.test.js
```

Expected: FAIL because `cloudflare/d1-store.js` does not exist.

- [ ] **Step 3: Add Wrangler tooling and exact configuration**

Install the current stable Wrangler CLI as a dev dependency so `package-lock.json` pins it:

```bash
npm install --save-dev wrangler
```

Add scripts to `package.json`:

```json
"cf:dev": "wrangler dev --config wrangler.jsonc",
"cf:deploy": "wrangler deploy --config wrangler.jsonc",
"cf:migrate:local": "wrangler d1 migrations apply DB --local --config wrangler.jsonc",
"cf:migrate:remote": "wrangler d1 migrations apply DB --remote --config wrangler.jsonc"
```

Create `wrangler.jsonc` initially without a D1 UUID; the real binding is added by `wrangler d1 create --update-config` during Task 6:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "halka-arz-portfoy-push",
  "main": "cloudflare/worker.js",
  "compatibility_date": "2026-09-14",
  "triggers": { "crons": ["*/2 * * * *"] }
}
```

- [ ] **Step 4: Add the D1 migration**

Create `migrations/0001_push_backend.sql`:

```sql
CREATE TABLE IF NOT EXISTS installations (
  install_id TEXT PRIMARY KEY,
  fcm_token TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  threshold REAL NOT NULL DEFAULT 3,
  ipo_enabled INTEGER NOT NULL DEFAULT 1,
  holdings_json TEXT NOT NULL DEFAULT '[]',
  alert_state_json TEXT,
  ipo_state_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_installations_enabled ON installations(enabled);

CREATE TABLE IF NOT EXISTS runtime_state (
  state_key TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 5: Implement the D1 adapter minimally**

Create `cloudflare/d1-store.js`. Map snake_case SQL rows to the existing registration object and back. `mutate()` must diff the before/after snapshots and persist changed rows with one `db.batch(statements)` call so each mutation is committed transactionally.

Core public shape:

```js
export function createD1Store(db) {
  if (!db?.prepare || !db?.batch) throw new TypeError('D1 DB binding is required.');
  return Object.freeze({ read, mutate, runtimeRead, runtimeWrite });
}
```

`runtimeWrite(value)` stores key `market_scheduler`; `runtimeRead()` returns that value or `null`.

- [ ] **Step 6: Run the focused and existing backend tests**

```bash
node --test test/cloudflare-d1-store.test.js test/backend-service.test.js test/backend-alert-engine.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json wrangler.jsonc migrations/0001_push_backend.sql cloudflare/d1-store.js test/cloudflare-d1-store.test.js
git commit -m "feat: add Cloudflare D1 push store"
```

---

### Task 2: Add Worker-compatible Firebase HTTP v1 sender

**Files:**
- Create: `cloudflare/fcm-sender.js`
- Create: `test/cloudflare-fcm-sender.test.js`
- Retain temporarily: `backend/fcm-sender.js` until Render cleanup in Task 5.

**Interfaces:**
- Produces: `createCloudflareFcmSender({ serviceAccountJson, fetchImpl, cryptoImpl, now })`.
- Returned sender exposes `send(deviceToken, message)` and `configured`.
- FCM payload remains data-only with `android.priority = "high"`.

- [ ] **Step 1: Write RED tests for Web Crypto JWT and FCM payload**

Create tests that generate an ephemeral RSA key with Node's `crypto.webcrypto.subtle`, export PKCS#8 PEM, inject it as a fake service account, and verify the OAuth and FCM requests. Assert:

```js
assert.equal(fcm.message.notification, undefined);
assert.equal(fcm.message.android.priority, 'high');
assert.equal(fcm.message.data.kind, 'portfolio_fall');
assert.equal(fcm.message.data.title, 'Portföy düşüşü');
assert.equal(fcm.message.data.body, 'Toplam portföy bugün -%1 seviyesini geçti.');
```

Also verify missing/invalid `project_id`, `client_email`, or `private_key` rejects before an FCM send.

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/cloudflare-fcm-sender.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement Worker-safe OAuth**

Implement PEM decoding with `atob`/`Uint8Array`, import the PKCS#8 key with:

```js
cryptoImpl.subtle.importKey(
  'pkcs8',
  pkcs8Bytes,
  { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' },
  false,
  ['sign'],
)
```

Create a service-account JWT with scope `https://www.googleapis.com/auth/firebase.messaging`, exchange it at `token_uri`, cache the access token in module/sender memory until 60 seconds before expiry, then POST to:

```text
https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
```

- [ ] **Step 4: Run sender tests**

```bash
node --test test/cloudflare-fcm-sender.test.js test/fcm-sender.test.js
```

Expected: PASS for both Cloudflare and current Node sender tests.

- [ ] **Step 5: Commit**

```bash
git add cloudflare/fcm-sender.js test/cloudflare-fcm-sender.test.js
git commit -m "feat: add Worker-compatible FCM sender"
```

---

### Task 3: Add Worker quote source, HTTP routes, and two-minute scheduled handler

**Files:**
- Create: `cloudflare/yahoo-quote.js`
- Create: `cloudflare/worker.js`
- Create: `test/cloudflare-worker.test.js`
- Modify: `backend/service.js`
- Modify: `test/backend-service.test.js`

**Interfaces:**
- `fetchYahooQuote(ticker, { fetchImpl }) -> { ticker, current, previousClose, latestMarketDate } | null`.
- Worker exports default `{ fetch(request, env, ctx), scheduled(controller, env, ctx) }`.
- `GET /api/health` returns `push.pollIntervalMs = 120000` and `push.androidFallbackMinutes = 15`.
- `POST /v1/installations` reuses `createPushService().register()`.

- [ ] **Step 1: Write RED worker route/scheduler tests**

Create dependency-injected factory `createWorkerApp(deps)` in the test contract and cover:

```js
test('health reports 120000 ms Cloudflare cadence and 15 minute Android fallback', async () => {
  const response = await app.fetch(new Request('https://unit.test/api/health'), env, {});
  const body = await response.json();
  assert.equal(body.push.pollIntervalMs, 120000);
  assert.equal(body.push.androidFallbackMinutes, 15);
});

test('market-closed scheduled run performs zero quote fetches', async () => {
  await app.scheduled({ scheduledTime:Date.parse('2026-09-13T09:00:00Z') }, env, {});
  assert.equal(quoteCalls, 0);
});
```

Add registration validation tests for body >128 KiB, missing install ID/token, malformed JSON, and a successful `POST /v1/installations`.

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/cloudflare-worker.test.js
```

Expected: FAIL because Worker modules do not exist.

- [ ] **Step 3: Port Yahoo quote acquisition from `push-server.js`**

Create `cloudflare/yahoo-quote.js` using Worker `fetch`, `AbortSignal.timeout(12000)` when available, the existing Yahoo chart URL with `interval=1m`, and the same Istanbul date derivation as the current Node runtime. Do not import Node APIs.

- [ ] **Step 4: Add explicit service budgets**

Modify `backend/service.js` so:

```js
async function marketCheck({ maxUniqueTickers = Infinity, maxNotifications = Infinity } = {})
```

Deduplicate tickers first. If the unique-ticker count is over `maxUniqueTickers`, fetch only the first allowed tickers and return diagnostics containing:

```js
{ sent, failed, partial:true, reason:'ticker_budget', totalTickers, checkedTickers }
```

Stop additional FCM sends after `maxNotifications`; leave unsent events undelivered so they retry next cron and report `partial:true, reason:'notification_budget'` when that budget is reached.

- [ ] **Step 5: Implement Worker routes and scheduler**

In `cloudflare/worker.js`, use constants:

```js
const POLL_INTERVAL_MS = 120_000;
const ANDROID_FALLBACK_MINUTES = 15;
const MAX_UNIQUE_TICKERS = 30;
const MAX_NOTIFICATIONS = 15;
```

Scheduled flow:

```js
const startedAt = new Date(now()).toISOString();
if (!getBistMarketStatus(new Date(now())).isOpen) {
  await store.runtimeWrite({ status:'market_closed', startedAt, finishedAt:new Date(now()).toISOString(), result:null });
  return;
}
const result = await service.marketCheck({ maxUniqueTickers:30, maxNotifications:15 });
await store.runtimeWrite({ status:result.partial ? 'partial' : 'checked', startedAt, finishedAt:new Date(now()).toISOString(), result });
```

The health endpoint must expose only aggregate diagnostics: no FCM tokens, holdings contents, private keys, OAuth tokens, or raw service-account JSON.

- [ ] **Step 6: Run focused alert/runtime tests**

```bash
node --test test/cloudflare-worker.test.js test/backend-service.test.js test/backend-alert-engine.test.js test/notification-rules.test.js
```

Expected: PASS, including signed positive/negative thresholds and independent ceiling/floor dedupe.

- [ ] **Step 7: Commit**

```bash
git add cloudflare/yahoo-quote.js cloudflare/worker.js backend/service.js test/cloudflare-worker.test.js test/backend-service.test.js
git commit -m "feat: run push alerts from Cloudflare cron"
```

---

### Task 4: Lock configuration/security contracts and Android fallback

**Files:**
- Create: `test/cloudflare-config.test.js`
- Modify: `.gitignore`
- Modify: `test/firebase-release-config.test.js`
- Re-verify: `android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java`
- Re-verify: `android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java`

**Interfaces:**
- No Android API changes.
- Release `PUSH_BACKEND_URL` remains an HTTPS base URL consumed by existing `PushConfigSync`.

- [ ] **Step 1: Write RED config/security tests**

Tests must assert:

```js
assert.match(wrangler, /"crons"\s*:\s*\[\s*"\*\/2 \* \* \* \*"\s*\]/);
assert.doesNotMatch(wrangler, /private_key|FIREBASE_SERVICE_ACCOUNT_JSON\s*:/i);
assert.match(scheduler, /15, TimeUnit\.MINUTES/);
assert.match(pushSync, /BuildConfig\.PUSH_BACKEND_URL/);
```

Scan tracked Cloudflare/config files to ensure they contain neither `-----BEGIN PRIVATE KEY-----` nor the uploaded service-account `private_key_id`.

- [ ] **Step 2: Run and verify RED only for missing guardrails**

```bash
node --test test/cloudflare-config.test.js test/firebase-release-config.test.js test/android-notification-background-behavior.test.js
```

- [ ] **Step 3: Add local Cloudflare state to `.gitignore`**

Append:

```gitignore
.wrangler/
.dev.vars
.dev.vars.*
```

Do not ignore `wrangler.jsonc` or migrations.

- [ ] **Step 4: Keep release CI strict**

Extend `test/firebase-release-config.test.js` only as needed so the workflow must still reject missing/non-HTTPS `PUSH_BACKEND_URL` and missing `GOOGLE_SERVICES_JSON_BASE64`. Do not add the Firebase Admin JSON to GitHub Actions because that credential belongs only in Cloudflare Worker secrets.

- [ ] **Step 5: Run focused security/Android tests**

```bash
node --test test/cloudflare-config.test.js test/firebase-release-config.test.js test/android-notification-background-behavior.test.js test/android-push-config-noop.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .gitignore test/cloudflare-config.test.js test/firebase-release-config.test.js
git commit -m "test: lock Cloudflare push security contracts"
```

---

### Task 5: Remove the paid Render production path

**Files:**
- Delete: `render.yaml`
- Delete: `push-server.js`
- Delete: `backend/fcm-sender.js`
- Delete: `test/push-server-runtime.test.js`
- Delete: `test/fcm-sender.test.js`
- Modify: `README.md` if it references the push server/Render path.
- Modify: `test/release-workflow-hygiene.test.js` to reject live Render production files.

**Interfaces:**
- Production backend becomes only `cloudflare/worker.js`.
- `server.js` remains the existing local/web application server and is not converted into the push backend.

- [ ] **Step 1: Add a RED hygiene assertion before deletion**

Extend `test/release-workflow-hygiene.test.js`:

```js
await assert.rejects(fs.access('render.yaml'), { code:'ENOENT' });
await assert.rejects(fs.access('push-server.js'), { code:'ENOENT' });
```

Also assert `cloudflare/worker.js` and `wrangler.jsonc` exist.

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/release-workflow-hygiene.test.js
```

Expected: FAIL while Render files still exist.

- [ ] **Step 3: Delete Render-only runtime files and stale tests**

Remove exactly the files listed above. Preserve `backend/service.js`, `backend/alert-engine.js`, and the alert-rule tests because they are shared by the Worker.

- [ ] **Step 4: Update README deployment wording**

Document production push as Cloudflare Worker + D1 + FCM, two-minute Cron, and Android 15-minute fallback. Do not include credentials, D1 IDs from other accounts, or a guessed Worker URL.

- [ ] **Step 5: Run the full Node regression suite**

```bash
npm test
```

Expected: all tests PASS with zero failures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace Render push runtime with Cloudflare"
```

---

### Task 6: Create the real D1 binding, migrate, deploy, and connect Firebase

**Files:**
- Modify automatically: `wrangler.jsonc` (real D1 UUID added by Wrangler)
- No secret files committed.

**Interfaces:**
- D1 database name: `halka-arz-portfoy-push`.
- D1 Worker binding: `DB`.
- Worker secret: `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Public backend URL: actual HTTPS `*.workers.dev` URL returned by deployment.

- [ ] **Step 1: Authenticate Wrangler to the user's Cloudflare account**

Run locally/through an authenticated Cloudflare environment:

```bash
npx wrangler login
```

- [ ] **Step 2: Create D1 and let Wrangler write the real UUID**

```bash
npx wrangler d1 create halka-arz-portfoy-push --location=eeur --binding=DB --update-config --config wrangler.jsonc
```

Verify `wrangler.jsonc` now contains binding `DB`, database name `halka-arz-portfoy-push`, and a concrete Cloudflare-generated `database_id`.

- [ ] **Step 3: Apply remote migrations**

```bash
npm run cf:migrate:remote
```

Expected: `0001_push_backend.sql` applied successfully.

- [ ] **Step 4: Set the Firebase Admin SDK JSON only as an encrypted Worker secret**

On the user's Windows PowerShell, using the already downloaded file:

```powershell
Get-Content -Raw "$HOME\Downloads\halka-arz-portfoyum-firebase-adminsdk-fbsvc-4cd4f6f906.json" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON --config wrangler.jsonc
```

If the file is stored elsewhere, use its actual local path; never copy its private key into a tracked file.

- [ ] **Step 5: Deploy**

```bash
npm run cf:deploy
```

Capture the real HTTPS Worker URL from Wrangler output; do not infer or invent it.

- [ ] **Step 6: Verify live health**

```bash
curl https://ACTUAL_WORKER_HOST/api/health
```

Acceptance: HTTP 200; `pollIntervalMs` is `120000`; `androidFallbackMinutes` is `15`; no `fcmToken`, `private_key`, `access_token`, or service-account JSON appears.

- [ ] **Step 7: Commit only the generated D1 binding UUID/config change**

```bash
git add wrangler.jsonc
git commit -m "ops: bind production Cloudflare D1 database"
```

---

### Task 7: Build and verify the configured Code28 Play bundle

**Files:**
- No source version bump.
- Runtime input: real Worker HTTPS URL.
- CI input: Android Firebase config from the already supplied `google-services.json`.
- Existing signing workflow/scripts remain authoritative.

**Interfaces:**
- `PUSH_BACKEND_URL = https://ACTUAL_WORKER_HOST`
- `GOOGLE_SERVICES_JSON_BASE64 = base64(original google-services.json bytes)`

- [ ] **Step 1: Verify registration endpoint live before building**

Use a non-secret synthetic token only to validate request parsing, or preferably install a test APK and let Android register its real FCM token. Verify `/api/health` installation count increases without exposing token contents.

- [ ] **Step 2: Configure GitHub release secrets**

Set repository secrets through GitHub UI/authorized secret tooling:

- `PUSH_BACKEND_URL` = exact Worker HTTPS URL.
- `GOOGLE_SERVICES_JSON_BASE64` = base64 of the provided `google-services.json`.
- Keep the existing Play upload signing secrets unchanged.

- [ ] **Step 3: Run the full source verification before release dispatch**

```bash
npm ci
npm test
npm run android:sync
gradle -p android --no-daemon compileReleaseJavaWithJavac
```

Expected: all Node tests PASS, asset sync clean, Java compile PASS.

- [ ] **Step 4: Trigger the configured Code28 workflow manually**

Run `.github/workflows/code28-notifications.yml` with `workflow_dispatch`. The release gate must fail if either Firebase Android config or Worker HTTPS URL is missing.

- [ ] **Step 5: Verify the produced AAB**

Check:

```text
versionName = 2.4.6
versionCode = 28
package = com.innative.halkaarz
PUSH_BACKEND_URL = real Worker HTTPS base URL
```

Run `jarsigner -verify` and verify signer certificate SHA-256 is exactly:

```text
02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72
```

- [ ] **Step 6: Physical notification smoke test**

On the Android device:

1. Open the app and allow notifications.
2. Confirm FCM token registration reaches the live Worker.
3. Confirm the backend health data shows an installation without leaking its token.
4. Exercise a controlled test path for positive/negative portfolio and ceiling/floor delivery where feasible.
5. Confirm Android WorkManager remains scheduled at 15 minutes as fallback.

Do not claim real-device FCM delivery unless it is actually observed.

- [ ] **Step 7: Final verification checkpoint**

Re-run `npm test`, verify latest GitHub Actions run is green, verify live `/api/health`, and verify the final signed AAB hash/certificate before delivering the AAB.
