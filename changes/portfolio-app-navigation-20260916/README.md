# Portfolio App Navigation — Test → Live Migration Notes

> **Do not merge/cherry-pick the test overlay into `main`.** This folder is the manual migration record for applying the accepted UI changes later on top of the then-current live source.

## Scope

Test branch only: `feature/test-portfolio-app-navigation-20260916`

Test build order:

1. `scripts/apply-test-share-ui.mjs`
2. `scripts/apply-test-wallet-metrics-nav.mjs`
3. `scripts/apply-test-portfolio-app-navigation.mjs`

The third script is intentionally an isolated test overlay. The live rollout must re-apply the accepted changes directly to the current `public/` source after re-running production regressions.

## 1. Bottom navigation

Target order:

`Performans — Piyasalar — [Cüzdan] — Gelişmiş — Ayarlar`

Test overlay changes the two old left tabs only:

```html
<button id="performanceTab" class="nav-tab" data-view="performance" type="button"><span>↗</span><b>Performans</b></button>
<button id="marketsTab" class="nav-tab" data-view="markets" type="button"><span>⌁</span><b>Piyasalar</b></button>
```

The centered `walletHomeTab` from the earlier wallet overlay remains the `portfolio` route and must stay the home route. `Gelişmiş` and `Ayarlar` are not redesigned here.

## 2. Cüzdan home

Keep the existing wallet/share card and the existing holdings list. The old analytics blocks are removed from the home flow and placed in `performanceView` without changing their IDs or calculation logic.

The second home card is replaced with the focused comparison card:

```html
<section id="comparisonCard" class="comparison-card portfolio-comparison-card" aria-label="Portföy karşılaştırması">
  <div class="comparison-head"><span class="eyebrow">KARŞILAŞTIRMA</span></div>
  <div class="comparison-range" role="tablist" aria-label="Karşılaştırma dönemi">
    <button id="comparisonRangeDaily" class="comparison-range-btn active" data-comparison-range="daily" type="button">Günlük</button>
    <button id="comparisonRangeWeekly" class="comparison-range-btn" data-comparison-range="weekly" type="button">Haftalık</button>
    <button id="comparisonRangeMonthly" class="comparison-range-btn" data-comparison-range="monthly" type="button">Aylık</button>
  </div>
  <!-- Existing comparison metric IDs remain: comparisonPortfolio, comparisonGold, comparisonBist, comparisonUsd. -->
</section>
```

The previous comparison explanatory/status text is deliberately not carried forward.

## 3. Comparison periods

The test implementation uses session counts rather than calendar-day subtraction:

```js
const comparisonRangeSessions = { daily: 1, weekly: 5, monthly: 22 };
```

Market references remain display-only and use the existing Yahoo-based symbols:

- Gold USD: `GC=F`
- BIST 100: `XU100.IS`
- USD/TRY: `TRY=X`
- Gold TL is derived by combining Gold-USD and USD/TRY percentage changes.

For the portfolio side:

- Daily uses the existing `state.portfolio.totals.dailyPct`.
- Weekly/monthly use existing `state.portfolio.history` values.
- No new portfolio profit/loss formula is introduced.
- Missing/insufficient data renders `—`, never a fabricated zero.

## 4. Performans view

Move these existing blocks as-is from the home view into a new `performanceView`:

- `.chart-card` / `portfolioChart`
- `dailyHistory`
- `sectorAllocation`

The existing `drawChart`, `renderDailyHistory`, `renderSectorAllocation`, portfolio service and analytics module remain the calculation/render sources. When Performans becomes visible, call `requestAnimationFrame(drawChart)` so the canvas gets a real visible width.

## 5. Piyasalar view

Rename the old top-level calendar route/view to `markets` / `marketsView`, preserving the IPO calendar DOM contracts:

- `calendarRefreshBtn`
- `calendarStatus`
- `calendarFilter`
- `calendarList`
- existing `loadIpoCalendar()` / `renderIpoCalendar()` behavior

Add a compact daily market summary above the IPO calendar using:

- `marketSummaryBist`
- `marketSummaryGold`
- `marketSummaryUsd`

Old `calendar` navigation state is normalized to `markets` in `switchView` for compatibility with existing history/push routes.

## 6. Navigation event binding

Do not keep the old hard-coded four-tab listener list after introducing the new tabs. Bind the current navigation controls generically:

```js
$$('.nav-tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));
```

This is also what makes the existing centered Cüzdan control participate in the same route handling.

## 7. Explicitly unchanged areas

Do **not** change these when migrating this UI work live:

- portfolio totals/calculation service
- alert thresholds and notification rules
- background notification worker/backend
- stock add/edit/sale flows
- Android keyboard/inset fixes
- Cloudflare backend
- PNG wallet-card sharing bridge / `FileProvider`
- test/live package identities and production signing
- Watchlist (deferred to the next independent change)

## 8. Live rollout procedure later

When this test UI is approved:

1. Start from the latest live branch, not this test branch.
2. Re-open this README and the final diff of `scripts/apply-test-portfolio-app-navigation.mjs`.
3. Re-implement only the accepted HTML/CSS/JS changes directly in the then-current `public/` files.
4. Keep package/signing/version changes separate from the UI migration.
5. Run focused navigation/UI tests, then the complete regression suite, Android sync, release compile/build and signature/package verification.
6. Compare the live migration against this scope and confirm no test-only overlay/build identity code was copied.
