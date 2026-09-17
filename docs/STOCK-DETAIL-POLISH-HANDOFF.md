# Stock Detail Polish Handoff

## Scope

This change belongs to test branch `feature/test-liked-rollback-20260917` only. It fixes two stock-detail UI issues without changing portfolio calculations, persistence, price sources, market notifications, news, or backend behavior.

## Root causes

1. The floating bottom dock is rendered at `z-index:72`, while the stock detail sheet/backdrop previously remained at `z-index:50/49`. As a result the dock could visually and interactively overlap the bottom of the detail sheet, including the final action buttons.
2. Holding deletion used the WebView/browser `confirm()` dialog, which exposed the `https://app.local` origin and did not match the application design.

## Test-only implementation

The isolated post-overlay is:

- `scripts/apply-test-stock-detail-polish.mjs`

It is applied last by:

- `scripts/apply-test-portfolio-app-navigation.mjs`

The overlay changes only packaged test assets after the other approved test overlays.

### Detail-sheet layering

- `.sheet-backdrop` -> `z-index:79`
- `.sheet` -> `z-index:80`
- floating dock remains below the modal layer
- detail sheet also receives a small safe-area-aware bottom breathing space

This fixes the overlap at the root instead of adding an arbitrary large spacer above the dock.

### Delete confirmation

The native/browser confirmation is replaced by an in-app modal:

- title: `Hisseyi sil`
- message: `<TICKER> portföyünden kaldırılsın mı?`
- actions: `Vazgeç` and `Sil`
- destructive action uses the existing red visual language
- dark and light themes are both covered
- tapping the modal backdrop cancels it
- closing the underlying sheet also closes the delete modal

The actual deletion flow is intentionally unchanged:

1. `service.deleteHolding(selected.id)`
2. close modal/sheets
3. `state.selected = null`
4. reload portfolio with `loadPortfolio({ quiet:true })`
5. show `Hisse silindi.` toast

No storage schema or portfolio data migration is introduced.

## Regression contract

`test/stock-detail-polish.test.js` verifies:

- the polish overlay runs last
- detail sheet/backdrop stay above the floating dock
- browser `confirm()` is absent from this delete flow
- custom modal title/message/actions exist
- selected ticker is included in the message
- existing delete/reload semantics are preserved
- cancel/confirm/backdrop behavior is wired
- dark/light modal styling is present

All pre-existing tests must remain green as well.

## Production migration

Do **not** merge or copy the whole historical test branch into production.

When this UI is approved for production:

1. start from the exact current live production commit
2. port the stock-detail layering delta and custom delete modal only
3. preserve the current production `service.deleteHolding` implementation and data model
4. preserve current live price, notification, Firebase/backend and portfolio calculation code
5. run the complete production regression suite
6. build a production-derived test APK first
7. only after device approval, create the production AAB with the existing application ID and Play signing path

## Explicitly out of scope

- market quote providers
- Foreks/OYAK trusted limit reference logic
- ceiling/floor notification state
- portfolio rise/fall alerts
- News UI or news notifications
- repeated-purchase calculations
- sale calculations
- storage schema
- production backend deployment
