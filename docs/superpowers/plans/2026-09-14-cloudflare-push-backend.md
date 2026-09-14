# Cloudflare Push Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paid Render push runtime with a Cloudflare Workers + D1 backend that checks market alerts every two minutes, sends FCM notifications, and preserves Android's 15-minute WorkManager fallback.

**Architecture:** Keep the existing pure alert engine and `createPushService()` contract. Add a D1 store implementing the same `read()/mutate()` interface, a Worker entrypoint for registration/health/Cron, and a Worker-specific Firebase HTTP v1 sender using Web Crypto. Firebase credentials live only in Cloudflare encrypted secrets; Android Firebase config stays injected by CI.

**Tech Stack:** JavaScript ES modules, Node 22 tests, Cloudflare Workers, D1, Wrangler, Firebase Cloud Messaging HTTP v1, Android/Gradle.

**Spec:** `docs/superpowers/specs/2026-09-14-cloudflare-push-backend-design.md`

## Global Constraints

- Production target remains `2.4.6 / versionCode 28`; Code28 has not been uploaded to Play.
- Cron cadence is exactly `*/2 * * * *`.
- BIST session decisions use `Europe/Istanbul`; Cloudflare Cron itself is UTC.
- Android WorkManager remains exactly 15 minutes as fallback.
- Positive portfolio, negative portfolio, ceiling and floor semantics do not change.
- Delivery state advances only after successful FCM delivery.
- Aggregate portfolio alerts still require fresh same-day quotes for every active holding.
- Scheduled Worker guardrail: at most 30 unique Yahoo quote requests and 15 FCM sends per run, leaving headroom below the Workers Free 50-subrequest limit.
- `FIREBASE_SERVICE_ACCOUNT_JSON`, `google-services.json`, keystores and passwords never enter Git.
- Final upload certificate remains `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`.

---

### Task 1: Add Cloudflare tooling, D1 schema, and D1 store adapter

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
- `read()` returns `{ installations: { [installId]: registration } }`, the state shape already consumed by `backend/service.js`.
- `runtimeWrite(value)` stores scheduler diagnostics under key `market_scheduler`.

- [ ] **Step 1: Write the failing D1 store tests**

Use this seeded row in `test/cloudflare-d1-store.test.js`:

```js
const seededRow = {
  install_id:'550e8400-e29b-41d4-a716-446655440000',
  fcm_token:'token-1',
  enabled:1,
  threshold:3,
  ipo_enabled:1,
  holdings_json:'[{"ticker":"THYAO","lots":7}]',
  alert_state_json:'{"day":"2026-09-14","portfolio":[3],"limits":{},"stocks":{}}',
  ipo_state_json:null,
  created_at:'2026-09-14T10:00:00.000Z',
  updated_at:'2026-09-14T10:00:00.000Z',
};
```

Create the fake D1 helper with the exact upsert parameter order used by the planned adapter:

```js
function fakeD1(seed = {}) {
  const rows = new Map((seed.installations || []).map(row => [row.install_id, structuredClone(row)]));
  let runtimeRow = seed.runtime || null;

  function statement(sql, args = []) {
    return {
      bind(...next) { return statement(sql, next); },
      async all() {
        if (/FROM installations/i.test(sql)) return { results:[...rows.values()].map(structuredClone) };
        return { results:[] };
      },
      async first() {
        if (/FROM runtime_state/i.test(sql)) return runtimeRow ? structuredClone(runtimeRow) : null;
        return null;
      },
      async run() {
        if (/INSERT INTO installations/i.test(sql)) {
          const [install_id,fcm_token,enabled,threshold,ipo_enabled,holdings_json,alert_state_json,ipo_state_json,created_at,updated_at] = args;
          rows.set(install_id, { install_id,fcm_token,enabled,threshold,ipo_enabled,holdings_json,alert_state_json,ipo_state_json,created_at,updated_at });
        }
        if (/INSERT INTO runtime_state/i.test(sql)) {
          const [state_key,state_json,updated_at] = args;
          runtimeRow = { state_key,state_json,updated_at };
        }
        return { success:true };
      },
    };
  }

  return {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      const results = [];
      for (const item of statements) results.push(await item.run());
      return results;
    },
  };
}
```

Then add:

```js
test('D1 store maps rows to existing push-service registration shape', async () => {
  const state = await createD1Store(fakeD1({ installations:[seededRow] })).read();
  const item = state.installations[seededRow.install_id];
  assert.equal(item.threshold, 3);
  assert.deepEqual(item.holdings, [{ticker:'THYAO',lots:7}]);
  assert.deepEqual(item.alertState.portfolio, [3]);
});

test('D1 mutate preserves prior delivery state while changing preferences', async () => {
  const store = createD1Store(fakeD1({ installations:[seededRow] }));
  await store.mutate(state => {
    const item = state.installations[seededRow.install_id];
    item.threshold = 4.5;
    item.holdings = [{ticker:'EREGL',lots:3}];
  });
  const item = (await store.read()).installations[seededRow.install_id];
  assert.equal(item.threshold, 4.5);
  assert.deepEqual(item.holdings, [{ticker:'EREGL',lots:3}]);
  assert.deepEqual(item.alertState.portfolio, [3]);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/cloudflare-d1-store.test.js
```

Expected: FAIL because `cloudflare/d1-store.js` does not exist.

- [ ] **Step 3: Add Wrangler tooling and base config**

```bash
npm install --save-dev wrangler
```

Add these scripts:

```json
"cf:dev": "wrangler dev --config wrangler.jsonc",
"cf:deploy": "wrangler deploy --config wrangler.jsonc",
"cf:migrate:local": "wrangler d1 migrations apply DB --local --config wrangler.jsonc",
"cf:migrate:remote": "wrangler d1 migrations apply DB --remote --config wrangler.jsonc"
```

Create `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "halka-arz-portfoy-push",
  "main": "cloudflare/worker.js",
  "compatibility_date": "2026-09-14",
  "triggers": { "crons": ["*/2 * * * *"] }
}
```

The real D1 UUID is intentionally absent until Cloudflare creates the database in Task 6; Wrangler will insert it with `--update-config`.

- [ ] **Step 4: Add migration**

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

- [ ] **Step 5: Implement `cloudflare/d1-store.js`**

Use one `SELECT * FROM installations` for `read()`. Convert JSON columns with safe `JSON.parse` fallbacks. For each changed/new registration in `mutate()`, add this prepared upsert to one `db.batch()` call:

```sql
INSERT INTO installations (
  install_id,fcm_token,enabled,threshold,ipo_enabled,holdings_json,
  alert_state_json,ipo_state_json,created_at,updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(install_id) DO UPDATE SET
  fcm_token=excluded.fcm_token,
  enabled=excluded.enabled,
  threshold=excluded.threshold,
  ipo_enabled=excluded.ipo_enabled,
  holdings_json=excluded.holdings_json,
  alert_state_json=excluded.alert_state_json,
  ipo_state_json=excluded.ipo_state_json,
  updated_at=excluded.updated_at
```

Public export:

```js
export function createD1Store(db) {
  if (!db?.prepare || !db?.batch) throw new TypeError('D1 DB binding is required.');
  return Object.freeze({ read, mutate, runtimeRead, runtimeWrite });
}
```

- [ ] **Step 6: Run focused tests**

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
- Retain temporarily: `backend/fcm-sender.js` until Render cleanup.

**Interfaces:**
- Produces `createCloudflareFcmSender({ serviceAccountJson, fetchImpl, cryptoImpl, now })`.
- Returned sender exposes `send(deviceToken, message)` and `configured`.
- FCM remains data-only and `android.priority = "high"`.

- [ ] **Step 1: Write RED tests**

Generate an ephemeral RSA key in the test with Node `webcrypto.subtle.generateKey()`, export PKCS#8, convert it to PEM, and build this synthetic account object:

```js
const account = {
  project_id:'unit-project',
  client_email:'unit@unit-project.iam.gserviceaccount.com',
  private_key:pem,
  token_uri:'https://oauth2.googleapis.com/token',
};
```

Inject `fetchImpl` that returns `{access_token:'access-token',expires_in:3600}` for OAuth and captures the FCM request. Assert the FCM JSON contains:

```js
assert.equal(payload.message.notification, undefined);
assert.equal(payload.message.android.priority, 'high');
assert.equal(payload.message.data.kind, 'portfolio_fall');
assert.equal(payload.message.data.title, 'Portföy düşüşü');
```

Also assert missing `project_id`, `client_email`, or `private_key` rejects before any FCM call.

- [ ] **Step 2: Run RED**

```bash
node --test test/cloudflare-fcm-sender.test.js
```

Expected: FAIL because `cloudflare/fcm-sender.js` does not exist.

- [ ] **Step 3: Implement Web Crypto OAuth**

Import the PKCS#8 key with:

```js
cryptoImpl.subtle.importKey(
  'pkcs8',
  pkcs8Bytes,
  { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' },
  false,
  ['sign'],
)
```

Build a JWT with scope `https://www.googleapis.com/auth/firebase.messaging`, exchange at `account.token_uri`, cache the token until 60 seconds before expiry, then send to this runtime URL:

```js
const fcmUrl = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`;
```

FCM body:

```js
{
  message:{
    token:deviceToken,
    data:{ ...stringifiedData, title:String(message.title), body:String(message.body) },
    android:{ priority:'high' },
  },
}
```

- [ ] **Step 4: Run sender tests**

```bash
node --test test/cloudflare-fcm-sender.test.js test/fcm-sender.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cloudflare/fcm-sender.js test/cloudflare-fcm-sender.test.js
git commit -m "feat: add Worker-compatible FCM sender"
```

---

### Task 3: Add Yahoo quote source, HTTP routes, two-minute Cron, and free-tier budgets

**Files:**
- Create: `cloudflare/yahoo-quote.js`
- Create: `cloudflare/worker.js`
- Create: `test/cloudflare-worker.test.js`
- Modify: `backend/service.js`
- Modify: `test/backend-service.test.js`

**Interfaces:**
- `fetchYahooQuote(ticker, { fetchImpl })` returns `{ ticker, current, previousClose, latestMarketDate } | null`.
- `createWorkerApp(deps)` returns `{ fetch, scheduled }` for test injection.
- Default Worker export uses D1 `env.DB` and secret `env.FIREBASE_SERVICE_ACCOUNT_JSON`.
- Health returns `pollIntervalMs:120000` and `androidFallbackMinutes:15`.

- [ ] **Step 1: Write RED runtime tests**

Add exact assertions:

```js
test('health reports two-minute cloud cadence and 15-minute Android fallback', async () => {
  const response = await app.fetch(new Request('https://unit.test/api/health'), env, {});
  const body = await response.json();
  assert.equal(body.push.pollIntervalMs, 120000);
  assert.equal(body.push.androidFallbackMinutes, 15);
  assert.equal(JSON.stringify(body).includes('token-123'), false);
  assert.equal(JSON.stringify(body).includes('PRIVATE KEY'), false);
});

test('market-closed scheduled run performs no quote requests', async () => {
  await app.scheduled({ scheduledTime:Date.parse('2026-09-13T09:00:00Z') }, env, {});
  assert.equal(quoteCalls, 0);
});
```

Also cover malformed JSON, body >128 KiB, missing install/token, and successful `POST /v1/installations`.

Extend `test/backend-service.test.js` with:

```js
test('market check enforces quote and notification budgets without marking unsent events delivered', async () => {
  // seed more unique tickers/events than the supplied budgets
  const result = await service.marketCheck({ maxUniqueTickers:2, maxNotifications:1 });
  assert.equal(result.partial, true);
  assert.ok(['ticker_budget','notification_budget'].includes(result.reason));
});
```

- [ ] **Step 2: Run RED**

```bash
node --test test/cloudflare-worker.test.js test/backend-service.test.js
```

Expected: FAIL for missing Worker modules/new budget contract.

- [ ] **Step 3: Implement `cloudflare/yahoo-quote.js`**

Port the existing Yahoo 1-minute chart request without Node imports. Keep `range=5d`, `interval=1m`, `includePrePost=false`, and derive `latestMarketDate` in `Europe/Istanbul` from `regularMarketTime` or the last timestamp.

- [ ] **Step 4: Extend `marketCheck()` budget contract**

Change signature to:

```js
async function marketCheck({ maxUniqueTickers = Infinity, maxNotifications = Infinity } = {})
```

Deduplicate tickers before fetch. Fetch at most `maxUniqueTickers`. Stop FCM delivery after `maxNotifications`. Never mark unattempted/failed events delivered. Return normal `{sent,failed}` plus these fields whenever partial:

```js
{
  partial:true,
  reason:'ticker_budget',
  totalTickers,
  checkedTickers,
}
```

or

```js
{
  partial:true,
  reason:'notification_budget',
  sent,
  failed,
}
```

- [ ] **Step 5: Implement `cloudflare/worker.js`**

Use:

```js
const POLL_INTERVAL_MS = 120_000;
const ANDROID_FALLBACK_MINUTES = 15;
const MAX_UNIQUE_TICKERS = 30;
const MAX_NOTIFICATIONS = 15;
```

`POST /v1/installations` calls `service.register(await request.json())` after the 128 KiB guard. `GET /api/health` reads aggregate runtime state and installation count only.

Scheduled logic:

```js
const startedAt = new Date(now()).toISOString();
if (!getBistMarketStatus(new Date(now())).isOpen) {
  await store.runtimeWrite({ status:'market_closed', startedAt, finishedAt:new Date(now()).toISOString(), result:null });
  return;
}
const result = await service.marketCheck({ maxUniqueTickers:MAX_UNIQUE_TICKERS, maxNotifications:MAX_NOTIFICATIONS });
await store.runtimeWrite({
  status:result.partial ? 'partial' : 'checked',
  startedAt,
  finishedAt:new Date(now()).toISOString(),
  result,
});
```

- [ ] **Step 6: Verify signed-alert parity**

Run:

```bash
node --test test/cloudflare-worker.test.js test/backend-service.test.js test/backend-alert-engine.test.js test/notification-rules.test.js
```

Expected: PASS, including independent positive/negative portfolio levels and ceiling/floor dedupe.

- [ ] **Step 7: Commit**

```bash
git add cloudflare/yahoo-quote.js cloudflare/worker.js backend/service.js test/cloudflare-worker.test.js test/backend-service.test.js
git commit -m "feat: run push alerts from Cloudflare cron"
```

---

### Task 4: Lock secret/configuration contracts and Android fallback

**Files:**
- Create: `test/cloudflare-config.test.js`
- Modify: `.gitignore`
- Modify: `test/firebase-release-config.test.js`
- Re-verify: `android/app/src/main/java/com/innative/halkaarz/BackgroundAlertScheduler.java`
- Re-verify: `android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java`

**Interfaces:**
- Android push registration continues to use `BuildConfig.PUSH_BACKEND_URL + "/v1/installations"`.
- Android local fallback stays at 15 minutes.

- [ ] **Step 1: Write RED config/security tests**

```js
assert.match(wrangler, /"crons"\s*:\s*\[\s*"\*\/2 \* \* \* \*"\s*\]/);
assert.doesNotMatch(wrangler, /BEGIN PRIVATE KEY|private_key_id/i);
assert.match(scheduler, /15, TimeUnit\.MINUTES/);
assert.match(pushSync, /BuildConfig\.PUSH_BACKEND_URL/);
```

Scan `.gitignore`, `wrangler.jsonc`, `cloudflare/`, `.github/workflows/`, and `docs/` and fail if a tracked file contains `-----BEGIN PRIVATE KEY-----` or the real Firebase service-account private-key ID.

- [ ] **Step 2: Run focused tests**

```bash
node --test test/cloudflare-config.test.js test/firebase-release-config.test.js test/android-notification-background-behavior.test.js
```

Expected RED only for guardrails not yet added.

- [ ] **Step 3: Update `.gitignore`**

Append:

```gitignore
.wrangler/
.dev.vars
.dev.vars.*
```

Keep `wrangler.jsonc` and migrations tracked.

- [ ] **Step 4: Keep release CI strict**

`test/firebase-release-config.test.js` must continue requiring `PUSH_BACKEND_URL` to be HTTPS and `GOOGLE_SERVICES_JSON_BASE64` to be present. Firebase Admin credentials are not a GitHub Actions release secret; they live only in Cloudflare.

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
- Modify: `README.md`
- Modify: `test/release-workflow-hygiene.test.js`

**Interfaces:**
- Production push runtime becomes only `cloudflare/worker.js`.
- `server.js` remains the existing application web server.

- [ ] **Step 1: Add RED hygiene test**

```js
await assert.rejects(fs.access('render.yaml'), { code:'ENOENT' });
await assert.rejects(fs.access('push-server.js'), { code:'ENOENT' });
await fs.access('cloudflare/worker.js');
await fs.access('wrangler.jsonc');
```

- [ ] **Step 2: Run RED**

```bash
node --test test/release-workflow-hygiene.test.js
```

Expected: FAIL while Render files exist.

- [ ] **Step 3: Delete only Render-specific files**

Delete the five files listed above. Preserve `backend/service.js`, `backend/alert-engine.js`, and alert-rule tests because the Worker reuses them.

- [ ] **Step 4: Update README**

Document Cloudflare Worker + D1 + FCM as the production push path, Cron `*/2 * * * *`, and Android 15-minute fallback. Do not include credentials, a guessed Worker URL, or any private-key material.

- [ ] **Step 5: Run full Node regression**

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace Render push runtime with Cloudflare"
```

---

### Task 6: Create real D1 binding, migrate, set secret, deploy

**Files:**
- Modify automatically: `wrangler.jsonc` with Cloudflare-generated D1 UUID.
- No secret files committed.

**Interfaces:**
- D1 database: `halka-arz-portfoy-push`.
- Binding: `DB`.
- Encrypted Worker secret: `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Public backend URL: exact HTTPS Workers URL returned by deployment.

- [ ] **Step 1: Authenticate Wrangler**

```bash
npx wrangler login
```

- [ ] **Step 2: Create D1 and update config with the real ID**

```bash
npx wrangler d1 create halka-arz-portfoy-push --location=eeur --binding=DB --update-config --config wrangler.jsonc
```

Verify `wrangler.jsonc` now contains binding `DB`, database name `halka-arz-portfoy-push`, and a concrete UUID in `database_id`.

- [ ] **Step 3: Apply remote migration**

```bash
npm run cf:migrate:remote
```

Expected: `0001_push_backend.sql` applied successfully.

- [ ] **Step 4: Set Firebase Admin JSON as encrypted secret**

On the user's Windows PowerShell, with the downloaded file already created earlier:

```powershell
Get-Content -Raw "$HOME\Downloads\halka-arz-portfoyum-firebase-adminsdk-fbsvc-4cd4f6f906.json" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON --config wrangler.jsonc
```

If Windows saved the download to another directory, select that same downloaded JSON file; never paste the private key into a tracked repo file.

- [ ] **Step 5: Deploy and capture the exact URL**

```bash
npm run cf:deploy
```

Copy the exact HTTPS URL printed by Wrangler into a local shell variable for verification, for example in PowerShell:

```powershell
$workerUrl = Read-Host "Paste the exact HTTPS Worker URL printed by wrangler deploy"
```

- [ ] **Step 6: Verify live health**

```powershell
Invoke-RestMethod "$workerUrl/api/health"
```

Acceptance: HTTP 200; `pollIntervalMs` is `120000`; `androidFallbackMinutes` is `15`; output contains no FCM token, private key, OAuth token, or service-account JSON.

- [ ] **Step 7: Commit only the generated D1 config change**

```bash
git add wrangler.jsonc
git commit -m "ops: bind production Cloudflare D1 database"
```

---

### Task 7: Build and verify configured Code28 Play AAB

**Files:**
- No version bump.
- Runtime input: exact Worker HTTPS URL captured in Task 6.
- CI input: the already supplied Android `google-services.json` encoded as base64.
- Existing Play signing secrets remain unchanged.

**Interfaces:**
- `PUSH_BACKEND_URL` receives the exact Worker URL captured from Wrangler.
- `GOOGLE_SERVICES_JSON_BASE64` receives base64 of the original `google-services.json` bytes.

- [ ] **Step 1: Verify live registration path**

Prefer a test APK/installed app so Android supplies a real FCM token. Confirm `POST /v1/installations` succeeds and `/api/health` installation count increases without revealing token contents.

- [ ] **Step 2: Configure GitHub release secrets**

Through GitHub UI or authorized secret tooling, set `PUSH_BACKEND_URL` to the exact Worker URL and `GOOGLE_SERVICES_JSON_BASE64` to the supplied Android config encoded as base64. Do not change existing Play signing secrets.

- [ ] **Step 3: Run source verification**

```bash
npm ci
npm test
npm run android:sync
gradle -p android --no-daemon compileReleaseJavaWithJavac
```

Expected: all Node tests PASS, asset sync clean, Java compile PASS.

- [ ] **Step 4: Trigger `.github/workflows/code28-notifications.yml` with `workflow_dispatch`**

The workflow must reject a missing/non-HTTPS backend URL or missing Android Firebase config, then produce the configured bundle when both exist.

- [ ] **Step 5: Verify produced AAB identity/signature**

Verify package `com.innative.halkaarz`, `versionName 2.4.6`, `versionCode 28`, and that the compiled `PUSH_BACKEND_URL` equals the exact deployed Worker URL. Run `jarsigner -verify` and verify certificate SHA-256 is exactly:

```text
02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72
```

- [ ] **Step 6: Physical notification smoke test**

On Android: allow notifications, confirm FCM registration reaches Worker, observe at least one controlled FCM delivery if a safe test path is available, and confirm Android's 15-minute WorkManager fallback remains present. Do not claim real-device FCM delivery unless actually observed.

- [ ] **Step 7: Final verification checkpoint**

Freshly rerun `npm test`, verify latest GitHub Actions run is green, verify live health endpoint, and verify final signed AAB hash/certificate before delivering the AAB.
