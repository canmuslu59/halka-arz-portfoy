# Halka Arz Portföy V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct historical/daily portfolio analytics, make Android startup non-blocking, and add interactive analytics/navigation requested by the user.

**Architecture:** Split long history from lightweight quote refreshes, compute history from IPO date and dated sales, and cache static IPO/sector metadata. Use an asynchronous Android HTTPS bridge and keep all analytics/UI local in the bundled web app.

**Tech Stack:** ES modules, Node test runner, HTML/CSS/Canvas, Android Java WebView/SharedPreferences, Gradle Android plugin.

**Spec:** `docs/superpowers/specs/2026-08-28-portfolio-analytics-v2-design.md`

## Global Constraints
- Android minSdk 26; target/compile SDK 35.
- Device-local storage only; backups disabled.
- Existing stored portfolios must remain readable.
- User enters only ticker + lots for normal add flow.
- Economic history begins on IPO first trading date, not local add date.
- Normal launch must render cache before waiting on network.

---

### Task 1: Historical and daily P/L domain model
**Files:** Modify `public/core/domain.js`; test `test/domain.test.js`.
**Interfaces:** Produce `makePortfolioHistory(holdings)`, `calculateHolding(holding,{today})`, `calculateTotals(holdings)`, and per-history fields `value`, `cost`, `profit`, `profitPct`, `dailyProfit`, `dailyPct`, `capitalAdded`.
- [ ] Add failing tests for sale-aware history, staggered IPO dates, correct daily delta, and weekend/current-day P/L rules.
- [ ] Run domain tests and verify RED.
- [ ] Implement minimal date-aware calculations.
- [ ] Run domain tests and full suite GREEN.
- [ ] Commit.

### Task 2: Quote/history/sector data sources and parsers
**Files:** Modify `public/core/parsers.js`, `public/core/data-sources.js`; test `test/parsers.test.js`, `test/data-sources.test.js`.
**Interfaces:** Produce `getQuote(ticker)`, `getHistory(ticker,startDate)`, `getIpo(ticker)`, `getSector(ticker)` and parser outputs with `latestMarketDate` and correct `previousClose`.
- [ ] Add failing parser/source tests for same-day previous close, period1 history URL, and sector extraction.
- [ ] Verify RED.
- [ ] Implement split data sources and parsing.
- [ ] Verify GREEN/full suite.
- [ ] Commit.

### Task 3: Portfolio service caching/migration
**Files:** Modify `public/core/portfolio-service.js`, `public/core/repository.js`; test `test/portfolio-service.test.js`, `test/repository.test.js`.
**Interfaces:** Service returns `marketStatus` inputs, daily history, sector per holding; normal refresh updates quote only while daily/static data use longer TTLs.
- [ ] Add failing tests for legacy marketSnapshot migration, IPO-date history start, no repeated IPO/sector request, and history once/day.
- [ ] Verify RED.
- [ ] Implement caching and add-flow orchestration.
- [ ] Verify GREEN/full suite.
- [ ] Commit.

### Task 4: BIST market calendar
**Files:** Create `public/core/market-calendar.js`; test `test/market-calendar.test.js`.
**Interfaces:** `getBistMarketStatus(date)` -> `{isOpen,label,nextOpenAt,closesAt,reason}`.
- [ ] Add failing tests for weekday open, evening close, weekend, 2026 full holiday, and 2026 half-day.
- [ ] Verify RED.
- [ ] Implement Istanbul-time calendar logic.
- [ ] Verify GREEN/full suite.
- [ ] Commit.

### Task 5: Async Android HTTP bridge and back navigation
**Files:** Modify `public/core/http.js`, `android/app/src/main/java/com/innative/halkaarz/MainActivity.java`; test `test/http.test.js`, `test/android-contract.test.js`.
**Interfaces:** JS uses Promise-based `httpGetText`; Android exposes `httpGetAsync(url,requestId)` and callback `window.__nativeHttpResolve`/`window.__nativeHttpReject`. Root back requires two presses; WebView history handles sheets first.
- [ ] Add failing contract/tests for async callback bridge and double-back behavior.
- [ ] Verify RED.
- [ ] Implement bounded executor native requests and JS promise registry.
- [ ] Verify GREEN/full suite.
- [ ] Commit.

### Task 6: Analytics UI, chart interaction, sorting and sector allocation
**Files:** Modify `public/index.html`, `public/app.js`, `public/styles.css`; add `test/ui-contract.test.js`.
**Interfaces:** UI IDs: `marketStatus`, `holdingSort`, `chartTooltip`, `dailyHistory`, `sectorAllocation`; history states for Add/Detail sheets.
- [ ] Add failing UI contract tests for required controls, tooltip wiring, sort options, sector section, and history push/pop.
- [ ] Verify RED.
- [ ] Implement rendering, interactive canvas hit testing, daily history rows, donut allocation, sorting, and market status.
- [ ] Verify GREEN/full suite.
- [ ] Commit.

### Task 7: Sync Android assets, documentation and build workflow verification
**Files:** Regenerate `android/app/src/main/assets/www/**`; modify `README.md` if needed.
**Interfaces:** Android assets exactly mirror `public/`.
- [ ] Run `npm run android:sync`.
- [ ] Run full `npm test`.
- [ ] Verify source/static contract and Git diff.
- [ ] Commit final sync/docs.
