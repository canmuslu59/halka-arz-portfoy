# Halka Arz Premium Test — Fullscreen Premium Design

Date: 2026-09-16
Base branch: `feature/premium-demo-20260915`
Target package: `com.innative.halkaarz.premiumtest`
Visible app name: `Halka Arz Premium Test`

## Goal

Turn the existing functional Premium demo into a separate Premium Test app whose Premium experience opens as a large full-screen layer from a visible `Premium’u Keşfet` / `Pro’ya Geç` entry point, while preserving every working portfolio, stock-add, keyboard, notification, calendar, Cloudflare and production/test package behavior.

## Isolation

Production remains `com.innative.halkaarz` and the existing test remains `com.innative.halkaarz.test`. Premium Test is built only as `com.innative.halkaarz.premiumtest`. Base Gradle production identity is not permanently changed for this demo; the Premium APK workflow applies the release suffix, label and demo version in the build workspace only. The app must coexist with both existing apps.

## Full-screen Premium shell

The ordinary Portfolio screen gains a visible but non-intrusive Premium entry card/button near the main portfolio summary. Activating it opens a fixed, viewport-sized Premium layer above the existing application chrome. The layer owns its own close/back control, safe-area padding and vertical scrolling. Existing bottom navigation remains in the DOM and unchanged; the Premium layer simply covers it while open.

The existing `Gelişmiş` entry remains compatible, but in Premium Test it opens the same full-screen Premium experience instead of squeezing Premium content into the normal page body. Closing Premium returns the user to the exact normal app state.

## Premium landing experience

The landing page starts with a spacious hero headed `Premium’u Keşfet` and the copy `Gelişmiş grafikler, akıllı alarmlar, Halka Arz Pro ve portföy analizleri.` A restrained crown/financial accent and small stock identity chips for ASELS, THYAO, TUPRS, BIMAS and KCHOL reinforce the premium theme. Missing logos use the existing monogram fallback.

Primary large cards:
- Gelişmiş Grafikler
- Akıllı Alarmlar
- Halka Arz Pro
- Portföy Analizi
- Takip Listesi
- Yedekleme & Aktarım

Existing real portfolio summary and insight cards stay available below the value proposition so the landing screen combines marketing clarity with real data.

## Existing Premium functionality retained

The current Premium modules remain the source of truth: analytics, interactive performance chart, local alert CRUD/test notification, IPO Pro source-aware detail, watchlist, backup/import validation and demo entitlement. No production notification engine, Cloudflare path or core portfolio calculation is refactored for this change.

The analytics view gains a clear allocation donut visualization when holdings exist, alongside the already implemented contribution analysis. Data is derived from the real portfolio model only.

Membership presentation uses demo-only example prices `₺49,99 / ay` and `₺299,99 / yıl`, shows `%40 avantaj`, and the CTA states `Premium Test Aktif`. No Play Billing, paid trial or cloud backup success is simulated.

## Visual language

Dark navy/black fintech base, restrained violet-to-blue accents, soft glow only on high-value controls, large headings, wide cards and generous spacing. Minimum interactive targets remain phone-friendly. Premium content must avoid dense small typography and horizontal overflow.

## Back and state behavior

Opening Premium must not change portfolio data or root navigation state. Closing Premium restores the previous normal screen. Android/browser back closes the Premium layer first when it is open; only after it is closed does existing back behavior continue.

## Testing and release

A dedicated contract test must prove the main Premium entry, full-screen overlay container, full-screen CSS contract, Premium hero/cards, demo membership copy and separate `.premiumtest` workflow identity. Existing Premium tests and the full regression suite must remain green. Web assets are mirrored byte-for-byte into Android assets. The APK workflow is capped below 25 minutes, compiles Java, assembles release APK, signs with the pinned AOSP test signer, verifies package/version/label/signature and uploads the finished APK artifact.

## Acceptance criteria

- Premium opens from the normal application through a visible `Premium’u Keşfet` / `Pro’ya Geç` entry.
- Premium fills the usable screen and is not embedded as a small `Gelişmiş` page section.
- Existing Premium analytics, charts, alerts, IPO Pro, watchlist and backup continue to work.
- Allocation analysis includes a readable donut when portfolio data exists.
- Membership clearly stays a test/demo flow with the requested example prices.
- Production and existing Test identities, signing and working behavior are unchanged.
- Final APK package is exactly `com.innative.halkaarz.premiumtest`, app label is `Halka Arz Premium Test`, signature verifies, ZIP integrity verifies and all automated tests pass.
