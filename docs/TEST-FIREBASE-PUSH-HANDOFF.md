# Test Firebase Closed-App Push Handoff

## Symptom
The live app receives market/portfolio push notifications while the app is not open, but the separate test package only produces notifications after the app has been opened.

## Root cause
The market notification engine itself is not the difference. The test branch preserves the live Code29 market/background logic, including PushConfigSync, PushMessagingService, BackgroundAlertScheduler and BackgroundAlertWorker behavior.

The separate test APK is built as `com.innative.halkaarz.test`, while its historical CI deliberately shipped without Firebase Android client configuration. The old Code29 separate-test workflow even recorded `firebase=not configured for separate test package`.

Without valid Firebase options, `FirebaseMessaging.getToken()` cannot produce the FCM registration path used by the Cloudflare push backend. The local WorkManager fallback can still run after the app has initialized, explaining the observed difference.

## Correct fix
Register a dedicated Android app in the existing Firebase project:
- Firebase project: `halka-arz-portfoyum`
- Android package: `com.innative.halkaarz.test`
- Suggested nickname: `Halka Arz Portföyüm Test`

Download the resulting `google-services.json`.

Do not rewrite the production Firebase Android client to pretend that it belongs to the test package. Keep production and test Android app registrations distinct.

## CI contract added
`.github/workflows/popular-finance-news-test-apk.yml` now has a push-capable manual-build path.

For `workflow_dispatch` it:
1. Requires `GOOGLE_SERVICES_TEST_JSON_BASE64`.
2. Decodes it to `android/app/google-services.json`.
3. Verifies project id `halka-arz-portfoyum`.
4. Verifies an Android client with package `com.innative.halkaarz.test`.
5. Requires `mobilesdk_app_id`, project number and API key.
6. Builds the same isolated `.test` APK.
7. Verifies the final APK contains `google_app_id`, `gcm_defaultSenderId` and `project_id` resources.

Normal push-triggered preview builds do not require the Firebase test config. They must not be treated as proof that closed-app FCM is fixed.

## Secret / credential audit
A dedicated CI probe checked only presence/missing status (never values) for:
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_ADMIN_JSON`
- `FIREBASE_ADMIN_SDK_JSON`
- `GOOGLE_SERVICES_JSON_BASE64`
- `GOOGLE_SERVICES_TEST_JSON_BASE64`

All are currently missing in the repository Actions environment, so ChatGPT cannot programmatically register the Firebase Android app from CI with the current credentials.

## Final acceptance after config is supplied
Before a combined final test APK is delivered:
1. Add the real test Firebase config.
2. Run the push-capable manual workflow.
3. Confirm APK package is still `com.innative.halkaarz.test`.
4. Confirm Firebase resources exist in the packaged APK.
5. Install/update on the physical test phone.
6. Open once to grant notification permission and sync the portfolio config/token.
7. Fully close the app and verify a backend-triggered notification is delivered without opening it.
8. Keep live `com.innative.halkaarz` installed in parallel and verify no cross-package regression.

## Current limitation
No final APK should be created or claimed fixed until a real Firebase Android registration/config for `com.innative.halkaarz.test` is available.
