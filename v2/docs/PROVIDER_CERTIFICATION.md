# Payquick Provider Sandbox Certification

**Status:** CI simulation complete; no merchant sandbox credentials were available in this session. Provider certification remains pending.

## VTpass sandbox procedure

Official references:
- https://vtpass.com/documentation/authentication/
- https://vtpass.com/documentation/ibadan-electric/
- https://vtpass.com/documentation/re-query-services/
- https://vtpass.com/documentation/response-codes/

Use VTpass sandbox API key, secret key and optional public key from its developer portal. Set VTPASS_ENV=sandbox. Keep PAYMENTS_ENABLED=false, ELECTRICITY_VENDING_ENABLED=false, VTPASS_LIVE_ENABLED=false and REMOTE_METER_LOADING_ENABLED=false.

From v2/backend:
1. Read-only meter verification: python sandbox_certification.py --probe verify
2. Read-only requery of a known sandbox ID: python sandbox_certification.py --probe requery --request-id REFERENCE
3. Optional provider SANDBOX purchase (only after an operator expressly approves spending sandbox balance): set VTPASS_SANDBOX_SPEND_APPROVED=true and run python sandbox_certification.py --probe purchase --phone 08012345678 --amount-naira 2000 --approve-sandbox-vend.

Uses documented prepaid IBEDC sandbox meter 1111111111111. That number is a provider test fixture, NOT proof of any physically installed meter. The purchase probe spends sandbox merchant balance only when both explicit gates are enabled. It does not remotely load a meter.

Acceptable provider evidence: real sandbox response for valid/invalid meter, exact min-amount, successful token, timeout/pending/requery, failed/reversal, duplicate request and server-side reference/meter/amount matching. Retain redacted traces privately, never secrets or full tokens in logs/issues.

## Paystack test procedure

References:
- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/api/settlement/

Configure PAYSTACK_MODE=test and PAYSTACK_SECRET_KEY with an authorized sk_test_ credential. Run python paystack_certification.py in v2/backend. This performs a read-only provider connectivity check: it does not initiate a checkout or charge a customer.

Before certification, complete a real provider TEST payment and signed webhook replay under an approved private sandbox setup. Confirm correct currency, integer kobo amount, reference, domain and exactly one credit.

## External financial reconciliation

Three distinct reports are provided. None updates money automatically.

- Paystack external gross funding and payout records: python paystack_settlement.py --from-date 2026-10-10 --to-date 2026-10-11
- VTpass external order requery: enable VTPASS_RECON_READ_ENABLED=true then run python vtpass_external_audit.py --hours 24 --max-orders 100
- Internal double-entry ledger, wallet balances and suspense liability: python reconciliation.py

Paystack report pages through GET /transaction, /settlement and /settlement/{id}/transactions. It checks gross funding amounts against local funding intents and identifies whether each record appears in a successful settlement. Net payout must NOT be treated as equivalent to gross customer funding. Missing settlements may be pending and are warnings, not automatic refunds.

VTpass requery validates original request ID, meter and vending amount. It confirms token vending, not bank settlement and not remote meter loading. Live read access requires a separate opt-in gate. Reports avoid customer personal information and token contents.

The external comparison accepts historical completed UTC dates only (at most eight calendar days) and fails closed on incomplete pagination. Store certification evidence and report digests in private operational storage.

## Environment readiness

The connected Vercel account did not show a Payquick-named project; connected Aiven project search did not reveal a Payquick-named database service. These were discovery checks only. No cloud service was provisioned or modified.

Next deployment requires an isolated new PostgreSQL database and migrations 0001 through 0005, separately deployed Vercel backend/frontend, and a durable scheduled worker outside the request lifecycle. Provider secrets must remain server-side.

**Production NO-GO:** Actual sandbox access, external merchant settlement evidence, licensed operating arrangements, rate limiting, MFA, monitoring and user support remain mandatory before live funds.
