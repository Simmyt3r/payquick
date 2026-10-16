# Standard VTU fallback: permanent product contract

**Normal VTU is the default, not a degraded emergency mode.** Payquick should work when PQ-AI, voice recognition, smart meters, automated recharging or recommendations are switched off.

| Service | Standard customer path | Fallback |
|---|---|---|
| Airtime | Select MTN/Airtel/Glo/9mobile, enter phone and amount, confirm, receive receipt | Check original order status; never blindly retry |
| Data | Select network, fetch current fixed-price bundles, choose recipient, confirm, receive receipt | Provider requery, original reference and customer support |
| Cable TV | Choose DStv/GOtv/StarTimes, verify IUC/smartcard, choose provider bouquet, confirm | Pending/manual review, not a second purchase |
| Electricity | Add meter, verify account name, select amount, confirm | Show real issued 20-digit STS token for manual keypad input |
| Wallet | Authorized hosted Paystack checkout with verified provider settlement | No unverified client-side credit |
| History | Standard order status, reference and receipt | Remains usable without AI |

## Implementation

The React customer interface has a persistent **Airtime, data & TV** navigation entry and a conventional form-based checkout alongside electricity and wallet. PQ-AI remains optional and is not imported by these flows.

The Python backend exposes catalog, fresh provider-priced bundle variations, quote, order, history and receipt endpoints. It validates provider service IDs from an allowlist and requests TV account verification before creating a fixed-price quote.

All purchases require an authenticated session and explicit password authorization, use immutable double-entry wallet journals and an idempotency key, and are queued to an independently hosted worker. Provider delivery evidence must match beneficiary, original request and principal amount. On timeout, the worker requeries the same reference, not another purchase. Confirmed provider failure is refunded once. Unclear responses are investigated, not claimed successful.

The migration 0006_standard_vtu.sql creates separate standard VTU quote and order tables. The same VTpass suspense reconciliation includes standard VTU and electricity reservations.

## Independent feature switches

- PAYMENTS_ENABLED=false until financial certification.
- VTU_VENDING_ENABLED=false until normal VTU sandbox pilot is certified.
- ELECTRICITY_VENDING_ENABLED=false until electricity vending has passed its own gates.
- REMOTE_METER_LOADING_ENABLED=false until authorized utility partnership and real meter evidence.
- PQ-AI/voice/automation requires no configuration for standard checkout.
- VTPASS_PUBLIC_KEY is required for fetching the current data and TV catalogue.

Turning off remote meter loading must not hide issued electricity tokens. Turning off AI must not hide manual purchase forms. Turning off electricity vending must not disable unrelated airtime/data/TV dispatch. Provider inability to confirm a transaction must not create a second debit.

## Readiness

The source and mocked/PostgreSQL-backed tests can pass without actual merchant credentials. That is not permission to take live money. Real sandbox validation, provider settlement reconciliation, payment regulations, strong authentication, production rate limiting, account recovery, secure monitoring and Android testing are still required. See PROVIDER_CERTIFICATION.md and REMOTE_METER_PILOT.md.
