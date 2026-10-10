# Portföy Yönetimi Lab (Code43 / 2.5.9)

Branch: feature/portfolio-management-lab-20261010
Production branch \`main\` and original Code43 release remain unchanged.

## What's in the trial APK
- Android debug package \`com.innative.halkaarz.lab\` (separate data from production/test packages).
- A Lab section within Settings with a premium entitlement simulator. Modes: free / seven-day trial / simulated premium.
- The simulator does NOT use Google Play Billing and NEVER requests or charges a real payment. It validates presentation/feature gates, not a production subscription.
- Local JSON backup/export via Android Storage Access Framework, with SHA-256 integrity verification, explicit overwrite confirmation, and rollback attempt on restore errors. Not encrypted and not auto-synced to cloud.
- Separate accounting journal: buy, sell, dividend, split, and fees, with moving weighted-average book cost and net realized P/L. Includes targeted validation and Node regression tests.
- The journal intentionally does not rewrite the existing IPO cost basis or historical portfolio chart. Do not treat it as a completed broker-grade P/L reconciliation or tax reporting system.

## Before a production monetization release
- Configure Google Play Console subscription/base plans and products.
- Implement real Android Play Billing purchases and restore purchases.
- Verify purchase tokens using a trusted backend and Play Developer API, acknowledge purchases, handle refunds/expiries/renewals, and avoid device-local Pro decisions.
- Add user account / encrypted cloud sync only after privacy and retention controls are designed. Device-local JSON backup alone does not protect against stolen or lost backup files.
- Reconcile corporate actions, dividends, extra buys and commissions into a single canonical ledger before showing integrated net financial totals; verify tax and market-data licensing separately.

## Build
GitHub Actions workflow: \`.github/workflows/portfolio-management-lab.yml\`.
The workflow runs JS regression checks and assembles a debug APK using Android SDK on GitHub-hosted Ubuntu. It avoids backend deployment, Play uploads, release signing and real billing. No secrets are required.
