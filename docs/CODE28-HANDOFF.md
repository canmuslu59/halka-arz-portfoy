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

## Verified result (2026-09-14)

- Tested/build source commit: 99a9cfd8504f70edf85060737cdc3965a18b8462
- Actions run: https://github.com/canmuslu59/halka-arz-portfoy/actions/runs/34823642888
- Job: 103910645473
- npm test: 260 tests, 260 pass, 0 fail.
- Android bundleRelease: BUILD SUCCESSFUL.
- Artifact ID: 10339029290 (code28-notification-release), retained until 2026-10-14.
- Output: halka-arz-portfoyum-v2.4.6-code28-unsigned.aab
- Unsigned AAB SHA256: 2e7c30b635352199e297669c774ea808f47b33cdd75b7985d1c0fbb4efeec993
- BUILD_STATUS.json signed=false: no upload-key secrets were available in this workflow.
- This is NOT a finished Play-ready delivery. Signing and final bundle verification remain.

Blocking condition: the selected local environment failed initialization with exec-server handshake timeout. There is no callable local execution tool in this turn.
Do not ask the user for another signing key while the existing authorized backup is retained. Restore normal local execution, download the exact artifact, sign with the existing halkaarz-upload key, verify all JAR entries and the expected certificate, validate with bundletool and check production manifest/version/packaged assets. Save the signed AAB persistently and return its download link.

Prior local workspace: /workspace/scratch/63b7c170c527.
Existing signing implementation: code27-work/sign_verify.py; existing key backup materialization: halka-signing/private/key/play-upload-key-backup. If these scratch files are missing, retrieve the known persistent backup by its Library identity.
Expected signed filename: halka-arz-portfoyum-v2.4.6-code28-play.aab.
The previous production certificate and package identity must be preserved.
