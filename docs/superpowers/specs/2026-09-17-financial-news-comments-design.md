# Financial News + Comments Design

## Goal
Replace the test app's `Piyasalar` tab with a finance-only `Haberler` experience, add per-news shared comments, and notify only source-designated breaking financial items.

## Scope
- Test package only during implementation: `com.innative.halkaarz.test`.
- Do not change `main` or production package behavior.
- Preserve Cüzdan, Hisselerim, Performans, calculations, repeated-purchase behavior, stock add flow, sharing, and existing portfolio notifications.
- The bottom navigation label becomes `Haberler`; the existing internal `markets` route may remain for compatibility.

## News UX
- Replace the market-summary / IPO-calendar content currently hosted under `marketsView` with a news feed.
- Header: `Haberler`.
- Filters: `Tümü`, `Borsa`, `Şirketler`, `Döviz`, `Altın`, `Ekonomi`, `Halka Arz`.
- Each card shows source, time, category, headline, optional short source snippet, `Kaynağa Git`, comment count, and an expandable comment area.
- Newest items sort first.
- Manual refresh is available. Opening the Haberler view refreshes stale content.
- Original article content is not copied into the app; cards only use metadata/headline/link and a short sanitized snippet when the source exposes one.

## Sources
Initial test backend sources:
1. Bloomberg HT `https://www.bloomberght.com/tumhaberler` for broad finance/economy headlines.
2. Bloomberg HT `https://www.bloomberght.com/sondakika` for source-designated breaking items.
3. TCMB official RSS / press-release feed for official monetary-policy and central-bank announcements.

The backend normalizes all sources to one contract and classifies items with deterministic keyword rules. Source fetch failures must not make the whole feed fail; healthy sources still return.

## News Contract
Normalized item:
```js
{
  id: string,              // stable sha256-like deterministic id
  source: 'Bloomberg HT' | 'TCMB',
  category: 'borsa' | 'sirketler' | 'doviz' | 'altin' | 'ekonomi' | 'halka-arz',
  title: string,
  summary: string,
  url: string,
  publishedAt: string,     // ISO 8601
  breaking: boolean,
  commentCount: number
}
```

API:
- `GET /v1/news?category=<optional>` -> `{items, fetchedAt}`
- `GET /v1/news/:id/comments` -> `{comments}`
- `POST /v1/news/:id/comments` body `{installId,userName,text}` -> `{comment}`
- `POST /v1/news/installations` body `{installId,fcmToken?}` -> registers a news installation when a token exists; absence of a token is valid for test builds.
- `GET /api/health` includes news source/runtime status.

## Comments
- No account creation.
- UI fields: `Kullanıcı adı` and `Yorum`.
- Username is remembered locally on device.
- Comments are shared through the test news backend.
- Limits: username 2-24 visible characters; comment 1-400 characters.
- Server rejects empty values, control-character abuse, and exact duplicate text from the same install/news within five minutes.
- Per-install comment cooldown: 20 seconds.
- Response/public comment shape exposes `id`, `userName`, `text`, `createdAt`; install id is never returned.
- First version has no replies, likes, editing, or user profiles.

## Breaking News
- The app does not infer importance from normal headlines.
- Only items originating from the Bloomberg HT `/sondakika` stream are `breaking:true` in v1.
- TCMB regular RSS items are not automatically breaking.
- Backend keeps a stable seen-set so the same breaking item is notified once.
- Production-ready contract uses notification type `financial_breaking`.
- Because the separate `.test` APK CI does not configure Firebase for `com.innative.halkaarz.test`, test APK uses the existing Android background worker as a fallback poller and locally posts unseen `financial_breaking` notifications. This has Android background scheduling latency.
- When the feature is later reproduced in the production package, the same backend contract can use the existing Firebase push path for immediate delivery.

## Backend Isolation
- Add a separate Cloudflare Worker target named `halka-arz-portfoy-news-test`.
- It must not deploy over `halka-arz-portfoy-push`.
- Use a separate Durable Object class/binding for news state, comments, installations, cached items, and breaking seen ids.
- Test worker URL: `https://halka-arz-portfoy-news-test.grass-airboat.workers.dev`.

## Android / Web App Integration
- Add a test-only `NEWS_BACKEND_URL` BuildConfig value in the test APK workflow.
- Web assets read a test-injected backend URL and call news/comment APIs through the existing HTTP bridge/fetch policy.
- Native network allow-list must permit only HTTPS and the exact test news worker host for news calls.
- Background news polling stores the last notified breaking id set locally so reinstall-independent backend dedupe and device-local dedupe both exist.

## Failure States
- Feed unavailable: show `Haberler şu anda alınamıyor` and retry button; do not break other tabs.
- One source unavailable: return remaining sources and mark partial status internally.
- Comments unavailable: news remains readable; comment area shows retry state.
- Comment POST rate limited: show a short wait message without losing typed text.
- External source opening failure: keep user in app and show a lightweight error.

## Testing
- Parser fixtures for Bloomberg HT latest, Bloomberg HT breaking, and TCMB RSS.
- Unit tests for normalization, finance-only filtering, category classification, dedupe, breaking-only semantics, and comment validation/rate limits.
- Worker route tests for news, comments, installations, and health.
- Overlay tests proving bottom nav says `Haberler`, old market summary/calendar are absent from the test view, filters exist, comment UI exists, and source links are external.
- Android regression tests proving background breaking dedupe and that existing portfolio notification behavior remains unchanged.
- Full `npm test`, Android asset sync, JS syntax check, Java compile, release APK build, signing, package identity, backend marker, and final APK SHA verification.
