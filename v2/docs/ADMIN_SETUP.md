# Payquick administrator bootstrap and UI-managed migrations

**Status:** Implemented in the Payquick v2 feature branch. This is a privileged, maintenance-only setup feature; it is not a payment launch.

## 1. Configure the new Vercel unified project

Open Vercel → project `payquick-unified` → Settings → Environment Variables. Add these as **server-side Vercel variables**, preferably scoped to the environment you are deploying. Never configure setup secrets with `VITE_` prefixes, commit them to Git, or paste them into chat.

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | TLS PostgreSQL URL with `sslmode=require` or `sslmode=verify-full` | A new, dedicated Aiven database; the temporary setup role must have DDL permissions. Do **not** point at an unrelated database. |
| `JWT_SECRET` | At least 48 cryptographically random characters | Server-only. Required for administrator login and access tokens. |
| `PAYQUICK_SETUP_ENABLED` | `true` | Opens one-time setup API during initial installation only. Disable once complete. |
| `PAYQUICK_SETUP_TOKEN` | 48+ random characters | Independent high-entropy secret; enter it manually on `/setup`. Never a link query parameter. |
| `PAYQUICK_ADMIN_EMAIL` | Email address for the *new* first administrator | Must not be an existing Payquick account. |
| `PAYQUICK_ADMIN_PASSWORD` | New administrator password of 16–200 characters | Used once to create an Argon2 password hash; remove from Vercel after success. |
| `PAYQUICK_ADMIN_MIGRATIONS_ENABLED` | `false` | Keep later schema-write operations closed except during explicitly authorized maintenance. |
| `PAYMENTS_ENABLED` | `false` | Keep financial operations disabled. |
| `VTU_VENDING_ENABLED` | `false` | Keep ordinary vending execution disabled pending provider certification. |
| `ELECTRICITY_VENDING_ENABLED` | `false` | Keep electricity execution disabled. |
| `REMOTE_METER_LOADING_ENABLED` | `false` | No meter commands without written provider approval. |
| `VTPASS_LIVE_ENABLED` | `false` | Never enable for database setup. |

Create two **different** random strings for `JWT_SECRET` and `PAYQUICK_SETUP_TOKEN` locally with `python -c "import secrets; print(secrets.token_urlsafe(64))"`, running it separately for each. Store the resulting strings directly in Vercel.

Redeploy the reviewed Payquick v2 commit after setting environment variables. The public homepage is still independent of these variables. The existing `/api/health` measures liveness; `/api/ready` checks authentication, database connectivity and required schema.

## 2. Run first-time setup at `/setup`

Navigate to **https://YOUR-DEPLOYMENT-DOMAIN/setup** over HTTPS. This page is a frontend and requires no existing database user.

1. Paste the setup token, then select **Check setup status**. The token is submitted using the `X-Payquick-Setup-Token` request header; it is not saved to browser storage.
2. Inspect the pending migration list and back up your dedicated database before each operation.
3. Click **Apply next migration** to apply only the next committed SQL migration. The backend serializes requests with a PostgreSQL advisory lock, runs DDL plus the history record in one transaction, and stops on error.
4. Repeat for migrations `0001` through `0007`. If any step fails, do **not** manually mark it successful or apply later migrations: resolve the issue and retry the same step.
5. Once all are recorded, click **Create administrator from Vercel variables**. The backend hashes the initial password with Argon2 and creates the account and its wallet in one transaction. It also marks initial setup permanently completed.
6. Change `PAYQUICK_SETUP_ENABLED` to `false`, remove `PAYQUICK_SETUP_TOKEN` and `PAYQUICK_ADMIN_PASSWORD` from Vercel, and redeploy. Removing the bootstrap password **does not delete the admin account** or change the stored password hash.
7. Sign in at `/login` using the original admin email/password, then open the **Admin dashboard** link to access `/admin`.

**Important:** If a `users` table exists but no `payquick_schema_migrations` ledger does, the setup refuses to blindly replay migrations. This may indicate a legacy or partially configured database requiring manual review. Do not bypass this by dropping tables.

## 3. Apply future migrations from the administrator dashboard

The `/admin` page shows the applied/pending history and each migration's status. The backend authorizes **every request** using the administrator role read freshly from PostgreSQL, not a JWT role claim. Normal customer and operator accounts cannot open this panel.

For an approved maintenance window:

1. Verify a restorable database backup.
2. Temporarily set `PAYQUICK_ADMIN_MIGRATIONS_ENABLED=true` in Vercel and redeploy.
3. Open `/admin` while signed in as an administrator.
4. Review the **next** committed migration. Enter your *current admin login password* again, check the backup/approval acknowledgement, and apply one migration.
5. Review the new migration status and audit record before proceeding to the next.
6. Set `PAYQUICK_ADMIN_MIGRATIONS_ENABLED=false` and redeploy once finished.

The API does not accept user-supplied SQL, filenames or migration IDs. Applied SQL files are checked using SHA-256 checksums; missing or reordered history, changed old migrations and unknown migration records require human intervention. The runner cannot be used as a SQL console.

**Security limit:** Password re-entry and role checks reduce risk, but strong MFA and an independent approval workflow remain future requirements before a high-risk financial production rollout. Keep migrations disabled between maintenance windows.

## 4. Routes and security

| API or page | Authorized actor | Function |
| --- | --- | --- |
| `GET /setup` | Public page | Loads form; displays no database details without token |
| `POST /api/setup/status` | Valid token, setup enabled, not completed | Lists allowlisted migrations |
| `POST /api/setup/apply-next` | Same | Applies one pending migration |
| `POST /api/setup/create-admin` | Same, all migrations applied | Creates and seals the first administrator account |
| `GET /admin` | UI loaded; API access requires administrator login | Migration dashboard |
| `GET /api/admin/migrations` | Current `admin` role | Reads verified migration history |
| `POST /api/admin/migrations/apply-next` | Admin JWT + password confirmation + write gate | Applies one audited migration |
| `GET /api/ready` | Public read-only | JSON operational readiness, no credentials revealed |

No one-time setup secrets are logged or returned in response bodies. Setup is disabled by default and permanently blocked after the bootstrap state is committed.

## 5. Verification and deployment caveats

Run `pytest -q` from `v2/backend`; CI uses disposable PostgreSQL for the complete first-setup lifecycle, authentication checks and migration history. Run `npm run build` in `v2/frontend` and `npm run test:services` for frontend routing checks.

Vercel serverless functions are short-lived: exactly **one migration per request**. The database applies each migration transactionally, and concurrent invocations cannot race. Do not run expensive data backfills through this UI; perform separately reviewed and observed maintenance instead.

The backend's setup database user requires temporary DDL privileges. After the first setup, use a limited runtime role for the API and a separately approved DDL role during migration windows. This deployment does not provision PostgreSQL, run scheduled VTU workers, or automatically approve payment providers.

Never enable live Paystack, VTpass vending or remote meter loading merely because `/api/ready` returns HTTP 200.
