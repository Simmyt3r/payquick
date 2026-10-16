-- Restricted meter remote-loading pilot. No public execution route exists.
BEGIN;
CREATE TABLE IF NOT EXISTS meter_remote_pilots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_id uuid NOT NULL UNIQUE REFERENCES meter_profiles(id),
    partner_name text NOT NULL,
    meter_model text NOT NULL,
    partner_agreement_reference text NOT NULL,
    capability_reference text NOT NULL,
    consented_at timestamptz NOT NULL,
    agreement_expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'proposed'
      CHECK (status IN ('proposed','authorized','suspended','closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (agreement_expires_at > consented_at)
);
CREATE TABLE IF NOT EXISTS meter_load_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pilot_id uuid NOT NULL REFERENCES meter_remote_pilots(id),
    order_id uuid NOT NULL UNIQUE REFERENCES electricity_orders(id),
    provider_load_reference text UNIQUE,
    state text NOT NULL DEFAULT 'not_attempted'
      CHECK (state IN ('not_attempted','submitted','loaded','rejected','unknown')),
    verified_acceptance_reference text,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (state <> 'loaded' OR
      (verified_acceptance_reference IS NOT NULL AND verified_at IS NOT NULL))
);
COMMIT;
