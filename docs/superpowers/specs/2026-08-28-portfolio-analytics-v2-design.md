# Halka Arz Portföy V2 Design

## Goal
Make the standalone Android portfolio app fast on launch and historically correct from each stock's first BIST trading day, while adding daily P/L history, interactive charts, sorting, sector allocation, market session status, and predictable Android back behavior.

## Root causes confirmed
- Startup refresh performs heavy per-holding network work and repeats static IPO lookups.
- Android `httpGet` is synchronous from JavaScript, so the WebView UI can stall while network requests run.
- Yahoo `chartPreviousClose` from a long-range request is not a reliable "previous trading day" baseline for today's P/L.
- Historical portfolio math uses today's `currentLots` on every past date, so sale dates and past ownership are represented incorrectly.
- A holding's local `addedAt` timestamp is mixed into behavior even though the economic start date must be the IPO first trading day.
- Modal sheets are not represented in WebView navigation history, so Android back can exit immediately.

## Data model
Each holding keeps `addedAt` only for audit. Economic history starts at `firstTradeDate` and `ipoPrice`.

Snapshots are split:
- `quoteSnapshot`: current price, previous trading-day close, latest market date/time, short quote rows.
- `historySnapshot`: daily close series beginning at or just before `firstTradeDate`.
- `ipoSnapshot`: static IPO company, IPO price, first trade date.
- `sectorSnapshot`: sector label, fetched once and cached.

Existing `marketSnapshot` data is migrated lazily and remains readable.

## Historical portfolio calculation
For each holding and each trading date on/after `firstTradeDate`:
- Start with `initialLots` and cost `initialLots * ipoPrice`.
- Apply sales on their actual sale date: reduce active lots and add sale proceeds to portfolio cash.
- Holding wealth on a date = active lots × that day's close + cumulative sale proceeds.
- Holding profit = holding wealth − original cost.
- Combined portfolio cost increases only when another IPO first starts trading.
- Combined portfolio daily P/L = cumulative profit today − cumulative profit on the previous portfolio trading date.
- Daily return % uses previous wealth plus any new capital introduced that day as the denominator, avoiding false gains when a new IPO enters the portfolio.

Today's P/L is separate from cumulative P/L. It is non-zero only when the latest market date is today's Istanbul date; otherwise it is 0 on weekends/holidays/before a new session begins.

## Market data strategy and startup performance
- Render device-cached portfolio immediately.
- Refresh only lightweight quotes on normal app open and every 60 seconds while visible.
- Refresh full daily history at most once per local trading day unless forced.
- IPO data is static after successfully found and is not re-fetched on every launch.
- Sector data is static after successfully found and is not re-fetched on every launch.
- Android network bridge becomes asynchronous using an executor and JavaScript callback IDs, so network calls cannot freeze the WebView UI.
- Multiple quote refreshes may run concurrently with a small bounded executor.

## Sector allocation
Sector is fetched automatically from a public company profile source and cached. Portfolio sector percentages use current active market value only; realized sale cash is not assigned to a sector. Missing sectors are grouped as `Bilinmiyor`. A manual sector override is allowed from holding detail as a fallback.

## UI
Home adds:
- BIST session badge in the top right: `AÇIK` or `KAPALI`, plus next open date/time when closed.
- Sort selector for holdings: Today TL, Today %, Total TL, Total %, Current Value, ticker.
- Interactive portfolio chart showing portfolio value; tooltip shows date, portfolio value, cumulative P/L TL/%, daily P/L TL/%.
- Daily history list showing day-by-day portfolio value, daily P/L, and cumulative P/L.
- Sector donut/list showing active portfolio allocation percentages.

## BIST session status
Use Europe/Istanbul time. Normal continuous-trading status is treated as open 10:00-18:00 on trading weekdays. 2026 Borsa İstanbul official closed and half-day dates are embedded; half-days close at 13:00. On weekends/closed holidays the app finds the next valid session and shows its date/time. The source basis is Borsa İstanbul's 2026 official holiday table and Pay Market trading-hours pages.

## Android navigation
Opening Add or Detail pushes a history state. Android back:
1. If a sheet/detail state is open, it navigates back and closes it.
2. From the root screen, first back shows `Çıkmak için tekrar geri basın.` and stays in app.
3. A second back within 2 seconds exits.

## Compatibility and privacy
- Android minSdk remains 26, target/compile SDK 35.
- Device-local SharedPreferences remains the storage source; Android backup stays disabled.
- No account or server is required.
- Existing portfolios migrate without deletion.
