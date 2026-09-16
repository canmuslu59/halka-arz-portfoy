# Wallet + Comparison Home — Test Changeset

Branch: `feature/test-wallet-comparison-home-20260916`

This changeset is intentionally isolated from `main` and from the production app. It is meant to preserve the tested UI work so it can later be adapted to the live branch without rewriting the feature from scratch.

## Scope

- Keep the real Android launcher artwork in the topbar.
- Keep the existing native PNG share flow for the wallet card.
- Replace the full-viewport hero layout with a compact first card.
- Add `Cüzdan` as the first-card title above the balance area.
- Keep `Toplam portföy büyüklüğü` and the last-market-data timestamp removed from this test UI.
- Add a compact `Günlük karşılaştırma` card immediately below the wallet card.
- Show four display-only daily metrics: Portföy, Altın (TL), BIST 100 and Dolar.
- Keep the existing Performance card and all following screens/flows unchanged below these two cards.

## Comparison references

The comparison overlay uses the existing Yahoo HTTP path and the Android host allow-list already used by the app:

- Gold futures: `GC=F`
- BIST 100: `XU100.IS`
- USD/TRY: `TRY=X`

`Altın (TL)` is a daily percentage approximation derived from the compounded daily move of gold in USD and USD/TRY:

`((1 + goldUsdPct / 100) * (1 + usdTryPct / 100) - 1) * 100`

The comparison values are presentation-only. They do not mutate holdings, portfolio totals, notifications, alert thresholds, persistence, sales, IPO data or background workers. Missing reference data is rendered as `—` rather than zero.

## Portable implementation files

- `scripts/apply-test-share-ui.mjs` — test-only Android asset/native overlay containing the wallet layout, comparison card, reference loading and preserved native image sharing.
- `test/wallet-comparison-home-overlay.test.js` — scope/regression tests for the wallet/comparison feature.
- `test/hero-card-image-share-overlay.test.js` — preserved native image-share regression coverage, updated for the compact wallet layout.
- `.github/workflows/code29-separate-test-apk.yml` — isolated test APK build/verification path.

## Production migration rule

Do **not** blindly merge this branch into production because the test and live branches are not identical. When promoting later, port only the relevant wallet/comparison/share sections into the then-current live files, run the live regression suite, then build/sign with the production release identity.

`main` is intentionally untouched by this changeset.
