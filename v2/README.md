# Payquick v2: Additive Foundation

A non-production architecture migration toward React + TypeScript + Tailwind, Capacitor 8 (Android), Flask, Aiven PostgreSQL and Vercel.

The original React Native/Expo/Firebase application remains unchanged in the repository root. No Firebase customer records have been migrated and no live financial transactions have been tested.

## Implemented in this branch

- Registration and login via Argon2 password hashes and short-lived JWT access tokens.
- Read-only wallet balance and a PostgreSQL double-entry transaction journal.
- Paystack checkout initialization and a signed, independently verified funding webhook, **disabled by default**.
- Meter registration, explicit capability status and quote preparation.
- React customer UI and a buildable PWA/Capacitor project.
- GitHub Actions jobs for backend unit tests, web build and Android debug APK build.

## Not implemented yet

VTPass purchase execution, meter auto-load transports, provider customer validation, refunds/reconciliation, admin panel, transaction history API, MFA/PIN, rate limiting, secure session refresh, account recovery, production KYC/AML, signing of Play release bundles, and PQ-AI. **Do not accept actual customer funds yet.**

## Backend setup

1. Provision a **new** PostgreSQL database on Aiven. Do not run the migration on the legacy Firebase data or an unrelated database.
2. In the backend directory, configure variables from .env.example, including TLS-enforced DATABASE_URL, a random JWT_SECRET of at least 48 characters and FRONTEND_ORIGINS.
3. Run migration 0001_initial.sql using a privileged migration role; use separate least-privileged credentials for runtime.
4. Install Python 3.12 dependencies from requirements.txt and run Flask from v2/backend with: flask --app app run --port 5000
5. Check GET /api/health and run pytest -q.

Financial settlement is disabled unless PAYMENTS_ENABLED=true. Do not enable that flag until provider integration, reconciliation and security gates have passed.

## Frontend development

1. Install Node 22.
2. In v2/frontend run: npm install
3. For local Flask development, leave VITE_API_URL unset and use: npm run dev
4. For a public web deployment, set VITE_API_URL to your **HTTPS API origin** and run: npm run build

## Android APK and Google Play

Capacitor 8 shares the same React client, but uses Android tooling to package it.

1. Install Android Studio, SDK, Node 22 and Java 21.
2. Configure a real HTTPS VITE_API_URL (Android cannot use localhost for the remote API).
3. From v2/frontend: npm install; npx cap add android; npm run android:sync
4. Debug APK: run assembleDebug in the generated android folder.
5. Signed Play Store AAB: set up secure keystore and release signing in Android Studio/Gradle; then generate a signed bundleRelease. Never commit signing credentials.

GitHub Actions generates a debug APK artifact, not a Play release. Configure repository variable PAYQUICK_API_URL for usable installed debug builds. A committed native project, lockfile, PNG/adaptive icons and verified signing/release pipeline remain release requirements.

## Vercel projects

Import the same GitHub repo twice with separate root directories:
- Backend: v2/backend (Flask autodetection from app.py).
- Web: v2/frontend (Vite output dist).

Vercel does not create the Aiven database or perform financial reconciliation automatically. Migrations must be applied with privileged operator approval.

## Next development

1. Harden registration, session lifecycle, rate limits and payment onboarding.
2. Build server-authoritative VTPass catalogue and vending with an idempotent outbox and status requery.
3. Add customer receipts, financial reconciliation and administrative controls.
4. Pilot a fully authorized remote meter-loading adapter.
5. Add PQ-AI only after the transaction APIs are tested and secure.

See docs/METER_AUTOMATION.md and docs/PQ_AI.md.
