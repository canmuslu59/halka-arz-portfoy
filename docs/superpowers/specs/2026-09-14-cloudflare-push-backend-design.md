# Cloudflare Push Backend Design — Code28

Date: 2026-09-14
Branch: `fix/code28-signed-portfolio-alerts-20260914`
App: Halka Arz Portföyüm (`com.innative.halkaarz`)
Release target: `2.4.6 / versionCode 28`

## Goal

Replace the paid Render runtime with a Cloudflare Workers + D1 backend that checks market alerts every two minutes and sends Android notifications through the Firebase project `halka-arz-portfoyum`. Keep Android WorkManager's 15-minute local job as a fallback.

## Constraints

- Production backend should remain within Cloudflare Workers Free + D1 Free for the expected small installation base.
- Cron cadence is exactly every two minutes: `*/2 * * * *`.
- Cron runs in UTC, but market-open decisions continue to use `Europe/Istanbul`.
- Firebase client and server credentials must never be committed to Git.
- The existing Google Play upload-key chain must not change.
- Code28 has not been uploaded to Play, so `versionCode 28` can be reused for the rebuilt release.
- Existing alert semantics remain unchanged: positive portfolio thresholds, negative portfolio thresholds, ceiling, floor, and daily dedupe after successful delivery.

## Architecture

### Cloudflare Worker

A new Worker becomes the production push backend. It exposes:

- `POST /v1/installations` — register/update an Android installation, FCM token, threshold and holdings.
- `GET /api/health` — report deployment status, two-minute cadence, last scheduled result and registration count without exposing tokens or secrets.
- `scheduled()` — invoked by Cloudflare Cron every two minutes.

The scheduled handler first checks whether BIST should be open. When closed, it exits before quote and D1 work where possible. When open, it loads enabled registrations, deduplicates required tickers, fetches quotes, evaluates alerts, sends FCM messages, and persists delivery state only after a successful FCM send.

### D1

D1 replaces the Render JSON file/persistent disk. Initial schema:

`installations`
- `install_id TEXT PRIMARY KEY`
- `fcm_token TEXT NOT NULL`
- `enabled INTEGER NOT NULL`
- `threshold REAL NOT NULL`
- `ipo_enabled INTEGER NOT NULL`
- `holdings_json TEXT NOT NULL`
- `alert_state_json TEXT`
- `ipo_state_json TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

`runtime_state`
- one row containing last scheduled start/end/status/result for `/api/health`.

Registration upserts preserve existing alert/IPO state unless an explicit reset is required by future behavior.

### Firebase Cloud Messaging

The Worker uses Firebase HTTP v1. `FIREBASE_SERVICE_ACCOUNT_JSON` is stored as an encrypted Cloudflare Worker secret. OAuth JWT signing is implemented with Worker-compatible Web Crypto rather than depending on a long-running Node process.

Messages remain data-only and Android high priority. Payload fields include the existing notification contract (`title`, `body`, `kind`, and optional `ticker`, `level`, `dailyPct`). Android `PushMessagingService` continues to hand these to `NotificationHelper`, preserving Android channel and local dedupe behavior.

### Android

No one-minute/two-minute timer is added to Android. `BackgroundAlertScheduler` remains on the Android-supported 15-minute WorkManager cadence as fallback.

The release AAB receives a real HTTPS `PUSH_BACKEND_URL` pointing at the deployed Worker. `google-services.json` continues to be injected only during release build from a protected secret and remains ignored by Git.

## Market Data and Free-Plan Guardrails

The first production target is the current small installation base, not a public high-scale alert service.

Cloudflare Workers Free currently allows 50 subrequests per invocation. The scheduled run therefore must not blindly create unlimited per-ticker outbound requests. The implementation will:

1. Deduplicate tickers across registrations.
2. Keep an explicit safe ceiling below the platform subrequest limit for one scheduled run.
3. Record a partial/error status in health diagnostics instead of silently claiming a full check if the ceiling is exceeded.

This avoids hidden failure if the app later grows beyond the intended small-user deployment. If scale later exceeds this boundary, quote acquisition should be replaced with a true batch market-data source rather than raising limits ad hoc.

## Alert Semantics

The Worker reuses or ports the existing alert engine so results match the current Android/server tests.

- Positive and negative portfolio levels remain signed and independent; `+1` does not suppress `-1`.
- Aggregate portfolio alerts require valid fresh same-day quotes for every active holding, matching the existing safety gate.
- Ceiling and floor are independently deduped per ticker/day.
- Delivery state advances only after FCM returns success.
- A failed FCM send remains eligible for a later retry.
- Quote failure for one ticker must not crash processing for unrelated registrations, but an affected aggregate portfolio is not evaluated as complete.

The two-minute poll materially reduces missed transient limit events compared with the 15-minute Android fallback. It still does not guarantee exchange-real-time detection of a sub-two-minute touch. No stronger guarantee will be shown in the UI or release notes.

## Render Removal

The Render-specific production path will be removed after the Cloudflare path is working:

- delete `render.yaml`;
- retire `push-server.js` as a production runtime (shared pure logic may be retained/refactored if useful for tests);
- remove Render-only persistent-file assumptions.

No Render service needs to be created and no monthly Render plan is required.

## Cloudflare Configuration

Repository configuration will include a Wrangler configuration with:

- Worker name such as `halka-arz-portfoy-push`;
- D1 binding named `DB`;
- Cron trigger `*/2 * * * *`;
- current compatibility date;
- no plaintext Firebase private key.

Required Cloudflare secret:

- `FIREBASE_SERVICE_ACCOUNT_JSON`

Required release value after deployment:

- `PUSH_BACKEND_URL=https://<deployed-worker-host>`

The user-uploaded Admin SDK JSON is used only to populate the encrypted Worker secret; its private key is never written to repository files, test fixtures, logs or handoff documents.

## Deployment Flow

1. Create/login to Cloudflare account on Workers Free.
2. Create a D1 database for the push backend.
3. Apply schema/migrations.
4. Deploy the Worker.
5. Store `FIREBASE_SERVICE_ACCOUNT_JSON` as a Worker secret.
6. Verify `/api/health` over the real HTTPS Worker URL.
7. Put that URL into the release `PUSH_BACKEND_URL` secret/value.
8. Put the already downloaded Android Firebase configuration into `GOOGLE_SERVICES_JSON_BASE64` for release CI.
9. Build the same `2.4.6 / code28` release, sign with the existing Play upload key, and verify certificate continuity.

## Testing

Implementation follows TDD. Required automated coverage:

- D1 registration upsert and normalized holdings/threshold behavior.
- Registration update preserves prior alert state.
- Scheduled handler reports two-minute cadence.
- Market-closed scheduled invocation performs no quote fetch.
- Signed positive and negative portfolio levels remain independent.
- Ceiling/floor daily dedupe remains independent.
- Failed FCM delivery does not persist delivered state.
- Successful FCM delivery does persist delivered state.
- FCM HTTP v1 message is data-only/high-priority and uses Worker-compatible OAuth signing.
- Health endpoint does not leak FCM token or Firebase secret material.
- Subrequest guardrail is explicit and produces diagnostic partial/error state.
- Android still uses 15-minute WorkManager fallback.
- Release CI refuses a missing/non-HTTPS backend URL and missing Firebase Android config.
- Full existing regression suite remains green.

## Acceptance Criteria

The migration is complete only when all of the following are demonstrated with fresh evidence:

1. Worker is deployed on a real Cloudflare HTTPS URL.
2. D1 schema exists and an Android installation can register successfully.
3. `/api/health` reports a two-minute scheduler configuration and no secret material.
4. Firebase push can reach the Android app through the new backend path.
5. Positive, negative, ceiling and floor paths are covered by passing tests.
6. Android 15-minute fallback remains intact.
7. Render is no longer required for production.
8. A configured, signed `2.4.6 / code28` AAB is built with the real Worker URL and Firebase Android config.
9. Final AAB signer certificate SHA-256 remains `02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72`.
