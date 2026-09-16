# Premium Mini App Design

## Purpose

Build the Premium area as a distinct mini application inside the existing Halka Arz Portföyüm product. Premium must not feel like a restyled tab or a long overlay. Entering Premium should switch the user into a separate product experience with its own navigation, screen hierarchy, interaction patterns, and visual language while preserving the existing Production and Test applications.

## Product Principle

Premium should feel calmer, denser in value, and lighter in copy.

- Less explanatory text.
- Fewer cards per screen.
- Bigger information hierarchy without oversized controls.
- More generous spacing.
- Stronger contrast and more saturated purple/electric-blue accents.
- Dark navy/near-black surfaces.
- Controlled glow used only for emphasis, not around every component.
- Real data where available; no invented portfolio or market data.
- One primary purpose per screen.
- 3–5 high-priority elements above the fold on a typical phone.

The experience should communicate “premium” through clarity, hierarchy, responsiveness, and useful functionality rather than visual noise.

## Isolation Requirements

The Premium Test application remains isolated from the two existing applications:

- Production package: `com.innative.halkaarz`
- Existing Test package: `com.innative.halkaarz.test`
- Premium Test package: `com.innative.halkaarz.premiumtest`
- Premium Test label: `Halka Arz Premium Test`

Production and existing Test behavior must not change. Premium work must remain on `feature/premium-demo-20260915` and must not modify `main`.

Premium implementation must not reuse the current `premium-demo.js` / `premium-demo.css` UI as its primary rendering layer. The new Premium mini application will be implemented in new files and wired into the existing application through a narrow entry/exit bridge.

## Experience Model

### Entry

The normal application exposes one visible but non-intrusive Premium entry point in the upper area: `👑 Premium` or `Premium’u Keşfet`.

Selecting it transitions to the Premium mini application.

### Premium Mode

When Premium mode is active:

- Normal application bottom navigation is hidden.
- Normal application content is not visible behind the Premium shell.
- Premium gets its own top bar and bottom navigation.
- The user can return to the normal application through one explicit back/close control in the Premium header.
- Android back first exits the current Premium sub-screen, then exits Premium mode, then falls back to the normal app’s existing back handling.

This should feel like switching into a second application, not opening a modal.

## Navigation

Premium bottom navigation has five primary destinations:

1. `Ana Sayfa`
2. `Analiz`
3. `Alarmlar`
4. `Pro`
5. `Menü`

Secondary features live under `Menü`:

- Takip Listesi
- Yedekleme & Aktarım
- Üyelik
- Premium Takvim
- Hakkında / sürüm bilgisi where useful

No horizontal tab strip with eight Premium sections is used as the primary navigation.

## Screen Design

### 1. Premium Home

Purpose: show the user the most important portfolio state and four clear Premium actions.

Above the fold:

- Small Premium crown identity / status.
- Large current portfolio value when real portfolio data exists; otherwise a clean empty state.
- Daily and total performance in compact chips or one line.
- One compact visual summary, preferably allocation or short trend, only if real data exists.
- Four large action cards:
  - Analiz
  - Akıllı Alarmlar
  - Halka Arz Pro
  - Takip

Secondary links such as Backup and Membership are not placed in the main action grid.

Copy should stay short. Avoid marketing paragraphs.

### 2. Portfolio Analysis

Purpose: let the user understand portfolio performance without scrolling through many explanatory cards.

Top area:

- Large value.
- Metric selector: `Portföy Değeri`, `Getiri`, `K/Z`, `Drawdown`.
- Range selector: `1H`, `1A`, `3A`, `1Y`, `Tümü`.
- Large interactive chart.

Below chart:

- Distribution / allocation section.
- `En çok katkı` and `En çok geri çeken` summary.
- Realized / unrealized profit where available.
- Concentration indicator where useful.

Avoid multiple dense KPI grids. Prefer two or three strong summary tiles.

### 3. Smart Alerts

Purpose: make creating and managing alerts feel simple.

Initial screen:

- One strong `+ Alarm Oluştur` action.
- Existing active alerts displayed as large touch-friendly cards.
- Toggle, short rule summary, and edit/remove affordances.
- `Test Bildirimi Gönder` action.

Alert creation uses a step flow rather than a large form:

1. Select target: Hisse or Portföy.
2. Select rule.
3. Select or enter threshold.
4. Review and save.

Supported rules:

- Price above.
- Price below.
- Daily percentage rise.
- Daily percentage fall.
- Limit up.
- Limit down.
- Total portfolio rise.
- Total portfolio fall.

Existing real notification plumbing should be reused. Premium must not invent a separate fake notification path if the app already has one.

### 4. Halka Arz Pro

Purpose: present IPO information as a focused research screen.

Home view:

- Compact list or cards for available IPOs using real calendar/backend data.
- Search or filter only if current data volume justifies it.

Detail view:

- Company identity and status.
- Offer price.
- Distribution / lot information when available.
- Public float when available.
- Demand-collection dates.
- Listing or expected dates when present.
- Theoretical ceiling table only when values can be computed from real known inputs.
- No made-up demand forecasts or unsupported predictions.

The interface must label computed scenarios as scenario data, not factual future outcomes.

### 5. Watchlist

Purpose: keep selected tickers and IPOs easy to revisit.

- Large concise rows/cards.
- Add/remove interactions.
- Current price or market information only when the existing app has a valid real source.
- No placeholder market numbers.

### 6. Premium Calendar

Purpose: focus on upcoming IPO-related dates.

- Upcoming / followed / completed segmentation if useful.
- Large date hierarchy.
- Follow action.
- Short status badges.

This can live under Menu rather than the primary bottom bar.

### 7. Backup & Transfer

Purpose: provide a genuinely useful local backup feature.

Backup must export/import supported application data in JSON:

- Portfolio data.
- Premium alert rules.
- Premium watchlist.
- Supported Premium settings.

Requirements:

- Versioned backup schema.
- Validation before import.
- Invalid or corrupt files are rejected with a clear error.
- Existing valid data is not overwritten until validation passes.
- Import result confirms what was restored.
- Cloud backup is shown only as `Yakında` unless a real cloud implementation exists.

### 8. Membership

Purpose: show Premium positioning without pretending Play Billing exists.

The test screen may display example plans:

- Monthly: `₺49,99`
- Annual: `₺299,99`
- Annual advantage: `%40`

The screen must clearly state `Premium Test Aktif` and must not perform or imitate a real purchase.

Keep the screen short:

- Premium title.
- 4–5 core benefits.
- Monthly / annual plan cards.
- One primary CTA indicating the test state.

## Visual System

### Colors

- Background: near-black / deep navy.
- Raised surfaces: dark blue-gray.
- Primary accent: saturated violet.
- Secondary accent: electric blue.
- Positive financial values: green.
- Negative financial values: red.
- Neutral text: blue-gray.

Avoid applying purple borders to every card. Use accent borders/glow only on selected, active, or high-value elements.

### Typography

- Large numerical values are the strongest hierarchy.
- Screen title is secondary.
- Supporting copy is short and subdued.
- Button labels are direct, generally 1–3 words.
- Avoid all-caps paragraphs and long descriptions.

### Sizing

- Touch targets remain at least comfortably tappable on Android.
- Primary actions are larger than current compact controls, but should not dominate the entire screen.
- Card radius and spacing should be consistent and generous.
- Dense financial tables should be replaced with focused rows where possible.

## Data and State Architecture

The Premium mini application reads the same real application state through an adapter rather than directly reaching into unrelated app internals.

Proposed boundary:

```js
createPremiumApp({
  root,
  getPortfolio,
  getPortfolioHistory,
  getCalendar,
  getMarketSnapshot,
  notificationBridge,
  storageBridge,
  onExit,
})
```

The Premium app owns:

- Current Premium route.
- Premium UI state.
- Alert editor state.
- Watchlist state.
- Premium-local settings.
- Backup serialization/deserialization orchestration.

The main app owns:

- Existing portfolio state.
- Existing market/backend feeds.
- Existing notification engine.
- Existing normal app routing and UI.

Premium communicates with the main app only through explicit bridge functions.

## File Structure

Create a new isolated Premium application tree:

```text
public/premium-app/
  index.js
  router.js
  state.js
  bridge.js
  premium.css
  components/
    header.js
    bottom-nav.js
    chart.js
    empty-state.js
    stock-logo.js
  screens/
    home.js
    analytics.js
    alerts.js
    alert-editor.js
    ipo-pro.js
    ipo-detail.js
    watchlist.js
    calendar.js
    backup.js
    membership.js
  core/
    analytics.js
    alerts.js
    backup.js
    watchlist.js
```

Existing main application files should receive only minimal integration changes needed to mount/unmount the Premium mini application and supply bridge data.

## Error and Empty States

Premium must never fill missing data with fabricated values.

Examples:

- No holdings → `Henüz portföy verisi yok` with one clear next action.
- No history → chart area shows a concise insufficient-data state.
- No IPO data → `Gösterilecek halka arz bulunamadı`.
- Market source unavailable → price omitted or marked unavailable.
- Invalid backup → import stops before state mutation.
- Notification permission unavailable → clear actionable explanation.

## Performance

- Premium shell should open without a full page reload.
- Only the current Premium screen should be rendered where practical.
- Heavy chart work should run only when its screen is visible.
- Event listeners must be disposed when Premium exits or screens change.
- Avoid global mutation of normal app styling.

## Testing Strategy

### Unit tests

Cover:

- Premium router behavior.
- Analytics calculations.
- Alert rule validation.
- Watchlist persistence.
- Backup schema/version validation.
- Import rejection for corrupt data.
- Membership copy remains test-only and does not trigger billing.

### Integration tests

Cover:

- Premium entry hides normal navigation.
- Premium exit restores normal navigation.
- Android back behavior.
- Premium bottom navigation.
- Alert create/edit/toggle/delete flow.
- Test notification bridge invocation.
- Backup export/import round trip.
- Empty-state rendering without fake numbers.

### Regression tests

Existing Production/Test behavior must remain unchanged. Full existing `npm test` suite must pass after Premium tests.

### Android verification

Before delivery verify:

- Package: `com.innative.halkaarz.premiumtest`
- Label: `Halka Arz Premium Test`
- Production and current Test IDs remain unchanged in source.
- APK builds successfully.
- APK signature verifies.
- ZIP integrity passes.
- SHA-256 is recorded.

## Acceptance Criteria

The redesign is complete when:

1. Premium is a full-screen mini application, not a long overlay/tab.
2. Premium has its own header, bottom navigation, routes, and screen hierarchy.
3. The new UI is implemented from new Premium files rather than reshaping the previous Premium demo UI.
4. Screens use less copy, fewer cards, larger information hierarchy, and saturated but controlled visuals.
5. Analytics, alerts, IPO Pro, watchlist, backup, calendar, and membership work as specified.
6. Missing data never produces invented financial values.
7. Backup export/import genuinely works and validates input.
8. Real notification infrastructure is reused where available.
9. Existing Production and Test applications are not regressed.
10. A newly built, verified `com.innative.halkaarz.premiumtest` APK is produced from the feature branch.
