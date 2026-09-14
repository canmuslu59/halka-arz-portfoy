# Halka Arz Portföyüm — code28 continuation record

Requested: fix the notification findings from 2026-09-14 and deliver a Play update AAB.

Base: 78b2b42fddbbdf589a82daf6179d7de580b5952c (2.4.5/code27).
Working branch: fix/code28-signed-portfolio-alerts-20260914.
New version: 2.4.6/code28; package com.innative.halkaarz.

Changes:
- Positive and negative portfolio thresholds, each deduplicated independently per Istanbul date.
- Correct decline messages and a separate Android decline channel using the existing decline sound.
- Mixed current-day/stale daily prices suppress incomplete daily portfolio totals.
- Backend rejects undated, missing and stale quotes.
- Android worker replays aligned same-day five-minute closing samples since monitoring/configuration began; holdings/threshold changes reset the history boundary. Samples from different timestamps never combine.
- Current price still evaluates immediately when a worker runs. WorkManager remains a minimum 15-minute periodic mechanism. This does not promise instant notification delivery or recovery of unsampled sub-five-minute excursions.
- Local diagnostics report last check, incomplete quotes, permissions and blocked delivery.
- Test notification capability remains removed.
- Saved user threshold is preserved; default remains 3 percent.

Validation: see the Code28 Notification Fixes Actions run for this exact commit. New JS regressions and the real pure Java notification rules are included in npm test. No physical device or emulator run is claimed.

Signing:
Existing upload certificate SHA256 must be 02:D9:F2:98:A5:6B:63:EC:90:67:B9:11:FC:89:89:07:B6:FD:FC:4E:05:91:43:D8:8F:0B:9D:F2:40:22:A2:72.
The workflow uses existing upload-key secrets if configured. Otherwise its artifact is explicitly UNSIGNED and cannot be delivered as a Play-ready update.
The user's existing backup is google-play-upload-key-backup-v2.1.0.zip (Library identity libfile_37a67707833c81919f25a2d645ea2693). Key and passwords are not stored in the repository.
If the local environment remains unavailable, resume signing after its connection is restored; do not substitute a new key.

Artifacts: dist/BUILD_STATUS.json records signing state, exact commit and output hash.
Play Console upload is not part of this task and has not been performed.
