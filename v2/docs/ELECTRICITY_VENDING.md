# Electricity vending runbook (phase 2)

**Feature state:** Source is implemented but both customer purchase dispatch and remote token loading are OFF by default. No provider credentials, customer funds or production meters were used while building this feature.

## Workflow

1. Customer saves a prepaid meter; new records default to *remote loading unverified*.
2. With METER_VERIFICATION_ENABLED=true and VTpass sandbox credentials configured, the customer verifies their meter via POST /api/meters/<uuid>/verify. The server obtains the provider customer name, meter type, band and purchase minimum.
3. Within 15 minutes of successful verification, the customer creates an electricity quote via POST /api/electricity/quotes with {meter_id,amount_naira}. Quotes expire in 10 minutes and use integer kobo. IBEDC Band A minimum is ₦5,000; other IBEDC bands ₦2,000, subject to the provider's returned minimum.
4. POST /api/electricity/orders accepts {quote_id,idempotency_key,phone,confirmation_password} and requires separate operator feature gates. The backend reserves the exact quoted wallet total through a two-entry journal. A repeated idempotency key for that quote returns the original order, without another debit.
5. A separately hosted \`python worker.py\` process claims one queued order, saves the VTpass request ID in the database *before* network dispatch, then sends POST /pay **once**.
6. VTpass `delivered` is accepted for settlement only when the request ID, meter number and electricity principal match the original order and a legitimate 20-digit token is available. Merchant commission or vendor `total_amount` is not confused with the vended amount.
7. On timeout, pending, missing, malformed or confusing responses, Payquick does **not** resend /pay. It schedules POST /requery with the same ID.
8. An explicitly negative *requery* with the original matching request ID refunds the reserved amount exactly once. Provider ID, meter and amount mismatches go to `manual_review`, not automatic refund. Missing token keeps an otherwise delivered order pending rather than manufacturing a successful receipt.
9. Unresolved requests are requeried no more than 24 times before escalation to `manual_review`. Escalation preserves the reservation and demands a human settlement decision.
10. GET /api/electricity/orders and GET /api/electricity/orders/<uuid> expose customer-owned history and receipts. A token returned by vending remains **manual entry**, not a remote-loaded meter confirmation.

### Transaction states

| State | Wallet treatment | Next action |
| --- | --- | --- |
| queued | Reserved (not available to spend) | Single dispatch |
| submitting | Reserved | Await /pay response; requery if lease expires |
| pending | Reserved | Requery original request ID |
| delivered | Settled to provider clearing | Deliver legitimate token to the owner |
| failed | Returned to customer once | Display confirmed failure |
| manual_review | Reserved, not refunded | Operator investigates discrepancy |

VTpass request IDs must start with the current YYYYMMDDHHmm date and time in Africa/Lagos. Request IDs are created at dispatch, never at quote creation.

## Configuration (operator only)

Configure the backend variables below. NEVER add real credentials to frontend code or GitHub:

- DATABASE_URL: new Aiven PostgreSQL database using TLS; run migrations 0001, 0002, 0003, 0004 in that order.
- JWT_SECRET: strong, random secret of at least 48 characters.
- VTPASS_ENV=sandbox, VTPASS_API_KEY and VTPASS_SECRET_KEY from sandbox account.
- TOKEN_ENCRYPTION_KEY: generate with \`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"\` and retain securely, with backups and a key-rotation plan.
- METER_VERIFICATION_ENABLED=false initially; may be enabled for controlled sandbox checks.
- PAYMENTS_ENABLED=false and ELECTRICITY_VENDING_ENABLED=false until the full security and reconciliation gate passes.
- VTPASS_LIVE_ENABLED=false. Live requires explicitly setting VTPASS_ENV=live and a separately approved gate.
- REMOTE_METER_LOADING_ENABLED=false: this release has NO approved remote-loading adapter.

### Read-only reconciliation

`cd v2/backend && python reconciliation.py` performs a non-mutating inspection of ledger journal balance, wallet cache parity, suspense liabilities versus unresolved purchases, absent successful tokens, repeated provider transaction IDs, aged orders and unreferenced funding credits.

- Exit code 0: no detected anomalies. Any warning/critical report returns exit code 1.
- Findings **must not** trigger an automatic refund or ledger adjustment.
- Outputs contain counts, aggregate kobo and statuses only, not token values or user identities.
- Authenticated operators with a trusted database-assigned `operator` role can also inspect the same aggregate report at `GET /api/operator/reconciliation`. No API allows customer self-promotion, provider refunds or ledger edits.
- This is internal accounting consistency. It **does not replace** independently matching VTpass/Paystack merchant statements or bank settlements.

### Run worker

The worker must run outside Vercel's request lifecycle, once per minute initially. Configure a single instance with the same database and provider secrets. Each invocation processes at most one queued order or one due requery. No public HTTP endpoint is exposed for this worker.

For pilot verification, use the documented VTpass sandbox scenarios for success, pending, timeout, no-response and failed validation; never test with a real meter or live money without authorization.

### Provider documentation

- https://vtpass.com/documentation/authentication/
- https://vtpass.com/documentation/ibadan-electric/
- https://vtpass.com/documentation/how-to-generate-request-id/
- https://vtpass.com/documentation/re-query-services/
- https://vtpass.com/documentation/response-codes/

## Release blockers

- Actual provider sandbox tests with credentials (CI uses mocked VTpass responses).
- Per-user and per-IP rate limits; device-bound step-up authorization and account recovery.
- Payment/merchant settlement reconciliation against external provider records.
- Refund policy and adjudication of 015/unknown outcomes after process crash.
- Audit logs, operational alerts, dual-control review panel, stable worker hosting.
- Nigerian payment compliance, provider agreements, and customer communication.
- Real meter auto-loading needs a documented, authorized DisCo or manufacturer/CIU adapter. Generating an STS token does **not** remotely load the meter.

Do not enable live vending until all items are satisfied.
