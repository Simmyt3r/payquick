# Payquick Meter Auto-Loading: Integration Contract

**Status: technical design only. Not connected to any utility's remote meter network.**

## Separate operations

1. Vending: the licensed provider issues a legitimate meter-specific STS token.
2. Loading: an authorized DisCo, manufacturer or approved CIU transports the token to the meter.
3. Acknowledgement: the provider or meter confirms token acceptance.
4. Auto recharge: a new purchase authorized under spending limits and, if using unit thresholds, backed by verified meter telemetry.

## Capability labels

- Manual: token can be shown for normal CIU keypad entry.
- Provider remote: valid meter capability verified by an authorized partner.
- Approved CIU: compatible customer device has an authorized pairing/transport interface.
- Unverified: default state for every user-entered meter number.

A customer selecting "MOJEC" or "Ikeja" is not evidence of remote loading capability.

## Required provider adapter operations

- check_capability(meter_identifier)
- submit_token(meter_identifier, issued_token, existing_purchase_reference, idempotency_key)
- get_load_status(provider_load_reference)
- get_meter_balance(meter_identifier), optional and only if supported

Delivery states: not_supported, ready, submitted, accepted, rejected, unknown.

Never report "Loaded" on a submitted request. Require accepted evidence.
Keep the issued token accessible if remote delivery is delayed or fails.
Never purchase a second token merely because delivery confirmation times out.
Do not bypass any meter seal, manufacturer security or DisCo approval.

## Pilot

First obtain written authorization, partner API documentation, a verified supported meter model, meter owner consent, a controlled testing environment and independently verifiable meter-credit acknowledgment. Only then implement the first live loader adapter.
