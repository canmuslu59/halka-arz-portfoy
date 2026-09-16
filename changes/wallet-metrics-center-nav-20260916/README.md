# Wallet metrics + centered home navigation (test-only)

Date: 2026-09-16
Branch: `feature/test-wallet-metrics-center-nav-20260916`

## Scope

This package records only the UI changes requested for the isolated Android test APK. It is intentionally separate from production/live source behavior.

### Wallet card

Visible wallet metrics are reduced to:

- `Bugün` -> existing `dailyProfit`
- `Günlük Değişim` -> existing `dailyPct`
- `Yatırılan` -> existing `invested`

`activeValue` and `salesProceeds` are **not deleted from the data model or render pipeline**. Their DOM targets remain present but hidden in the test overlay so existing `setMetric()` calls continue to work without changing calculation code.

The Today amount removes ellipsis clipping so the complete amount remains visible on normal phone widths.

### Bottom navigation

The existing four navigation buttons remain intact. A fifth, emphasized circular wallet button is inserted between Calendar and Pro:

`Portföy | Takvim | Cüzdan | Pro | Ayarlar`

The center wallet button uses the existing `data-view="portfolio"` navigation contract, so it routes to the existing portfolio/home view without a new navigation subsystem.

The original Portfolio button remains functional. Its active visual treatment is muted when the center wallet button is present so the circular Home control is the dominant home indicator.

## Implementation isolation

The change is applied by:

- `scripts/apply-test-wallet-metrics-nav.mjs`

It runs after the previously recorded test-only wallet/comparison/image-share overlay. No portfolio calculation, notification, market-data, storage, add/sale, or image-share logic is modified by this layer.

## Live migration notes

Do not blindly merge the test workflow into production. When moving this UI to live, port only:

1. the hero-grid markup structure for the three visible metrics;
2. the hidden compatibility targets for `activeValue` and `salesProceeds` unless production render code is deliberately made null-safe;
3. the center wallet navigation button markup;
4. the related CSS rules from `apply-test-wallet-metrics-nav.mjs`.

Retest existing navigation, portfolio rendering, image sharing and small-screen widths after adapting to the live branch.
