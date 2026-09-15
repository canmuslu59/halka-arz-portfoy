# Halka Arz Portföyüm — Full Premium Demo Design

Date: 2026-09-15
Base: `release/v2.4.7-code30`
Demo branch: `feature/premium-demo-20260915`
Target test package: `com.innative.halkaarz.test`
Planned demo identity: `2.4.7-premium-demo`, versionCode `30001`

## Goal

Build a fully interactive Premium demo APK that lets the product owner judge whether the paid tier feels substantial enough to charge for. This is a product/UX prototype, not a live-billing release. Existing working portfolio, stock-add, keyboard inset, notification and Cloudflare production behavior must not be disturbed.

The demo must install over the existing separate Test app by preserving the same `.test` package and fixed test signing identity.

## Product principle

Free remains useful for core portfolio tracking. Premium must feel meaningfully better through deeper analysis, more control, richer visualization and automation rather than by arbitrarily blocking basic portfolio usage.

Premium visual language stays consistent with the existing dark glass/financial UI. Premium emphasis uses restrained violet/blue accents, `✦ Premium` badges, denser analysis cards and clear hierarchy; it must not look like a different app or rely on gaudy gold styling.

## Premium demo access model

For this APK only, Premium is force-enabled through a demo entitlement provider. No Google Play Billing, merchant profile or real purchase is required.

The entitlement boundary must be isolated so a future production build can replace `demo entitlement = true` with Google Play Billing/backend entitlement without rewriting feature screens.

The demo membership screen still shows monthly/yearly plan presentation and value comparison, but purchase actions clearly state that Premium is unlocked in the test build. No fake successful payment flow is shown.

## Navigation

Keep the current four-tab structure. The existing `Gelişmiş` tab becomes the Premium hub rather than adding a fifth bottom-navigation item.

Premium hub sections:
1. Premium overview / membership status
2. Advanced portfolio analytics
3. Advanced charts
4. Smart alerts
5. IPO Pro
6. Premium calendar/watchlist
7. Backup & transfer
8. Membership/value screen

The existing Portfolio, Calendar, Settings and stock-add flows remain intact unless a Premium entry point is required.

## Premium hub

The landing view should immediately communicate value, not act as a menu-only page.

Top area:
- `✦ Premium aktif — Demo` status
- total portfolio value
- today P/L
- total realized + unrealized P/L
- one short contextual insight, derived only from known portfolio data

Quick-action cards:
- Advanced analysis
- Charts
- Smart alerts
- IPO Pro
- Backup

Insight cards may include: strongest contributor, weakest contributor, concentration warning, current drawdown, best day, worst day. They are descriptive calculations only; no investment recommendation or buy/sell language.

## Advanced portfolio analytics

Create a dedicated analytics model rather than putting all calculations directly into rendering code.

Metrics:
- total invested capital
- active market value
- sales proceeds
- realized profit/loss
- unrealized profit/loss
- combined total profit/loss
- daily P/L
- 7-day and 30-day performance where data exists
- highest observed portfolio value
- current drawdown from peak
- maximum historical drawdown
- best/worst recorded day
- win/loss contribution by holding
- allocation by holding and sector
- concentration: top holding share and top-three share

Holdings analytics table/card list:
- current weight
- invested amount
- active value
- realized P/L
- unrealized P/L
- total contribution to portfolio P/L
- daily contribution
- return since IPO purchase basis

Missing historical data must display an explicit unavailable state rather than fabricated values.

## Advanced chart system

This area is a priority. It must be visibly and functionally more sophisticated than the current single basic portfolio-history chart.

### Main interactive performance chart

Range controls: `1H`, `1A`, `3A`, `1Y`, `Tümü` where enough data exists. Unsupported ranges gracefully show the available period.

Selectable metric modes:
- Portfolio value (TRY)
- Total return (%)
- Profit/loss (TRY)
- Drawdown (%)

Chart behavior:
- touch/drag crosshair
- tooltip with date, portfolio value, daily change, cumulative P/L and drawdown
- visible min/max markers
- zero/reference line where relevant
- positive/negative fill treatment for P/L
- responsive rendering on Android WebView without horizontal overflow
- reduced-motion compatibility

### Comparison overlays

Where source data is genuinely available:
- invested-capital/reference line
- realized vs unrealized profit comparison
- optional BIST 100 normalized comparison only if a trustworthy source is available in the existing data layer. If no trustworthy benchmark is available, do not fabricate it; present the control as unavailable or omit it.

### Secondary Premium charts

1. Drawdown chart: peak-to-current percentage over time.
2. Realized vs unrealized P/L: compact bars or stacked representation.
3. Holding contribution chart: ranked positive/negative contribution.
4. Allocation chart: holding and sector views with switchable mode; avoid unreadable many-slice pie charts.
5. Daily P/L calendar/heatmap-style view using recorded daily history where feasible in WebView; otherwise use a dense day-by-day bar strip.

Charts should use the app's existing canvas/data architecture where practical. Avoid a large third-party chart dependency unless the existing canvas renderer cannot provide the required interaction reliably.

## Smart alerts

Premium demo provides a real local rule-management UI. Rules persist locally in the test app.

Supported rule types:
- per-stock price above target
- per-stock price below target
- per-stock daily percentage move threshold
- portfolio daily positive threshold
- portfolio daily negative threshold
- verified ceiling reached
- verified floor reached

Features:
- create, edit, enable/disable and delete rules
- rule summary cards
- test notification action for local Android notification verification
- validation that prevents invalid ticker, zero/negative prices or nonsensical percentages

Because `com.innative.halkaarz.test` is not a separately registered production Firebase package, the demo must not claim true closed-app FCM delivery. UI should distinguish `local demo` from future server-backed Premium alerts.

The existing production notification engine must not be modified simply to make this demo work.

## IPO Pro

Expand the existing advanced IPO detail instead of replacing it.

Display cleanly grouped sections for:
- offering dates/status
- offering price
- distribution method
- offered lots
- offer size
- participation index
- first trading date
- market
- free-float ratio
- discount where available
- company summary
- consortium leaders
- use of proceeds
- offering results / participant counts
- actual ceiling streak history
- theoretical ceiling ladder

Add compact visual summaries for ceiling streak/performance when actual history exists. Every field must keep the current source-aware unavailable states.

## Premium calendar and watchlist

Current calendar remains free. Premium adds:
- follow/star IPOs locally
- `Takip ettiklerim` filter
- watchlist cards
- reminder preferences UI
- quick link to IPO Pro detail

No server reminder is claimed in this demo unless actually supported by the `.test` package.

## Backup & transfer

Implement real local export/import for the test build.

Export payload includes portfolio records, sales, selected settings, Premium smart-alert rules and watchlist. It must include a schema version.

Import must validate schema and reject invalid/corrupted payloads without overwriting current data. User confirmation is required before replacement/merge behavior.

Do not pretend cloud backup exists. A disabled/future card may explain that account-based cloud sync can be added later.

## Membership/value screen

Purpose: evaluate whether the value proposition feels purchase-worthy.

Include:
- Premium hero
- monthly and yearly plan cards with placeholder/demo prices clearly marked as examples, not live Play prices
- annual-saving presentation
- comparison of Free vs Premium
- Premium feature checklist
- restore-purchase placeholder disabled in demo
- primary CTA: `Test sürümünde Premium açık`

Do not make claims about trial terms or live prices that are not configured in Play Console.

## Data and architecture boundaries

New logical modules should be kept independent where practical:
- `premium-entitlement` — demo/current access state boundary
- `premium-analytics` — portfolio metrics and chart-series calculations
- `premium-alerts` — local premium rule validation/storage/evaluation helpers
- `premium-backup` — export/import schema and validation
- UI/rendering stays in the application layer

Mirror every changed `public/` web asset into `android/app/src/main/assets/www/` exactly, preserving the project's source/bundled-asset parity convention.

Do not refactor unrelated portfolio, quote, Cloudflare, FCM or stock-add code.

## Demo packaging

Build a separate updateable test APK:
- application id: `com.innative.halkaarz.test`
- visible app: `Halka Arz Portföyüm Test`
- version name: `2.4.7-premium-demo`
- versionCode: `30001`
- same fixed test signing certificate used by the current separate Test app

Production release package `com.innative.halkaarz` and Play signing are not changed.

## Testing

Follow test-first implementation for new calculation/storage modules.

Required focused tests:
- demo entitlement is isolated from production entitlement behavior
- realized/unrealized/combined P/L calculations
- peak/drawdown/max-drawdown calculations
- contribution and concentration calculations
- chart range/series generation and missing-data behavior
- Premium alert rule validation/persistence/evaluation
- backup export/import schema validation and corrupt-input protection
- watchlist persistence
- public ↔ Android bundled asset parity
- test APK package/version/signing identity

Then run the complete existing regression suite. Android Java compile and APK assembly must succeed. Existing keyboard fix must remain covered and unchanged.

## Acceptance criteria

The APK is acceptable when:
- it installs as an update over the existing `Halka Arz Portföyüm Test` app;
- Premium is open immediately with no payment requirement;
- every advertised demo feature can actually be entered and interacted with;
- no fake external/server capability is presented as working;
- the advanced chart area is substantially richer than the current chart and remains usable on phone-sized WebViews;
- current Portfolio/Calendar/Add Stock/Settings behavior still works;
- all focused tests and the full regression suite pass;
- production package/signing/deployment are untouched.

## Out of scope for this demo

- real Google Play Billing purchase processing
- real subscription restore
- D-U-N-S / merchant setup
- account authentication
- true cloud backup/sync
- production entitlement enforcement
- server-backed Premium alert delivery for the `.test` package
- investment recommendations or predictive buy/sell scoring
