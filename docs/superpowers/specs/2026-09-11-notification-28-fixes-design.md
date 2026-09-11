# Notification Reliability — 28-Part Design

**Scope:** Fix the 26 notification root causes identified in the 2026-09-11 audit plus the two platform/architecture limitations that constrain notification guarantees. Work stays on `fix/code25-notification-28-20260911` until verified; release branches remain untouched.

**Operating rule:** Each numbered item is an independent RED → minimal GREEN → focused verification cycle. No production behavior change may precede its failing regression test. Every cycle must remain small enough to fit inside the user's ~25-minute work-session limit; checkpoint and report before continuing if necessary.

## Delivery architecture

The notification subsystem has four producers/paths that must converge on one semantic event identity: foreground JavaScript, Android WorkManager, Firebase/FCM, and the optional Node push backend. `NotificationHelper` is the final on-device delivery boundary. Semantic identity must be canonical before final delivery, and producer-specific display wording must never define identity.

Market notifications use verified, sufficiently fresh BIST-session data. A portfolio-threshold event is only valid when portfolio coverage is complete enough to truthfully describe the whole portfolio; missing quotes must not silently turn a partial basket into “Toplam portföy”. Tavan/taban detection uses the full intraday candle range when available and an exchange-valid reference/basis price rather than assuming ordinary previous close is always the BIST base price.

IPO notifications use a canonical offering identity shared by JavaScript, native worker, and backend. Dual-source reads distinguish valid-empty calendars from parser/source failures. Source enrichment or formatting changes must not replay the same offering.

FCM is considered production-capable only when Firebase client configuration, Google Services build integration, a non-empty HTTPS push-backend endpoint, registration retry semantics, a concrete server route/sender/scheduler, and a data-only message contract all exist and are tested. Until then the system must not imply instant push guarantees.

## 28 numbered fixes

1. Preserve portfolio `level` through the JS → Android bridge.
2. Canonicalize portfolio threshold identities (`3`, `3.0`, locale variants) before dedupe.
3. Prevent incomplete quote coverage from being described as total-portfolio movement.
4. Detect intraday tavan/taban touches from candle high/low, not only sampled close/current.
5. Reduce WorkManager sampling blind spots with event-history-aware quote evaluation and explicit best-effort semantics.
6. Add quote-age/session freshness validation; same calendar date alone is insufficient.
7. Support BIST reference/base-price overrides for corporate-action sessions instead of always deriving ±10% from `previousClose`.
8. Bring native Gedik IPO parsing semantics into parity with the foreground parser.
9. Merge native Gedik/Ahlatcı entries field-by-field instead of destructive ticker overwrite.
10. Validate calendar payload semantics so HTTP 200 + anti-bot/changed markup is a source failure, not a valid empty result.
11. Close the first-baseline IPO miss window by recording installation/baseline timing and comparing safely before seeding.
12. Use one canonical IPO event identity at producer and final-delivery layers, including meaningful same-day updates.
13. Canonicalize IPO date ranges so formatting/enrichment changes do not replay an offering.
14. Harden corrupt dedupe-state recovery without silently resetting to an empty delivered set.
15. Check durable delivery-state persistence result and make failure observable/retryable.
16. Replace raw Java `String.hashCode()` notification IDs with deterministic collision-resistant allocation/persistence.
17. Make notification-tap routing wait for portfolio hydration and retry deterministically on cold start.
18. Report real Android notification availability in UI, including app-level and channel-level disablement.
19. Bound/parallelize native quote fetching so a slow ticker cannot serially delay the whole worker.
20. Classify semantically transient 200-response/parse failures for controlled retry, not only IOException/HTTP codes.
21. Make Firebase client configuration an explicit release prerequisite instead of a dormant optional path.
22. Wire the Node push service into concrete `/v1/installations`, market-check, and IPO-check runtime paths with an actual sender abstraction.
23. Persist pending/dirty registration state and retry failed backend registration even when token/config values do not change.
24. Enforce a data-only FCM contract so all remote notifications pass through `NotificationHelper` and the same dedupe layer.
25. Make backend event claim/send/state transitions concurrency-safe to prevent duplicate sends from overlapping checks.
26. Add backend IPO identity migration so ticker-only → ticker+dates enrichment does not replay the same IPO.
27. Treat WorkManager cadence as best-effort: expose last successful background check / delayed-state diagnostics and never promise exact 15-minute delivery.
28. Treat Force Stop / OEM battery restrictions as platform constraints: surface diagnostic guidance and, where permitted, detect optimization state; do not claim delivery while Android has suspended the app.

## Verification contract

For every item: focused RED evidence, minimal production change, focused GREEN evidence, then full Node regression. At stable checkpoints also require Android asset sync/diff, release Java compile with deprecation lint, and unsigned AAB build. Physical-device behavior is reported only after a real device run; CI/source inspection never counts as physical-device PASS.
