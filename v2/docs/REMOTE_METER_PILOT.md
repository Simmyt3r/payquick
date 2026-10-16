# Authorized Remote Meter Loading: First Pilot

**Status:** Protocol and database schema prepared. No physical meter or utility network has been contacted.

VTpass delivers legitimate electricity tokens but does not generally push them to a customer's meter. Ikeja Electric documents remote token loading for certain MOJEC meters, but its public customer page is not a developer API:
https://www.ikejaelectric.com/remote-token-loading/

## Pilot protocol

1. Obtain written pilot and API agreement from the DisCo, metering manufacturer or authorized system integrator. Record the models and geographical coverage it explicitly permits.
2. Obtain customer consent, meter ownership evidence, compatible model and connectivity verification, power availability, a technician and a signed communication protocol.
3. Record the partner agreement, meter identifier, consent and expiration under migration 0005 in a restricted operational workflow. User submission alone must not set meter remote_loading_verified.
4. Purchase ONE ordinary authorized token. If remote delivery is eligible, submit this EXISTING token through the approved partner API with an idempotency reference; never vend a second token to fix a timeout.
5. Treat transport submitted, provider pending, rejected and meter accepted as distinct states.
6. Show Loaded only when a verified and correlated provider/meter acceptance report proves the credit. Reject unsigned acknowledgement, mismatched meter, request ID or unsupported model.
7. Keep manual keypad fallback, especially when the network is down or the premises lacks supply.
8. Confirm before/after kWh balance with the customer and technician and retain non-sensitive pilot evidence.

The backend file v2/backend/meter_pilot.py implements a partner-neutral adapter interface and a fail-closed NoPartnerAdapter that performs no network actions. A future actual partner adapter must implement check_capability, submit_existing_token and requery_loading, plus signature verification under the partner's official protocol. The test verifier is a simulated dependency, not a production cryptographic implementation.

The database migration 0005_meter_pilot.sql introduces restricted pilot authorizations and unique token load attempts. No public API can insert approvals or dispatch meter commands.

## Acceptance criteria

- Valid documented partner authorization and customer consent.
- Meter identity and model compatibility independently verified.
- Exactly one purchased token for the order, with controlled load retries using the same token.
- Positive provider-signed acknowledgement for that meter and request plus on-site kWh check.
- Safe recovery from connection loss or power failure without money duplication.
- Audit record, pilot support owner and rollback/fallback.

**Still required from partner:** approved meter models, API specification, authentication/signature protocol, real status callback/requery schema, test credentials and a permitted installed pilot meter. Do not attempt to reverse engineer proprietary meter protocols.
