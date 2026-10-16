-- Read-only financial operator access and duplicate-provider reference guard.
-- Apply as an authorized migration, never from public client input.
BEGIN;
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'operator'));

-- Two orders must never be marked settled with the same provider ID.
-- This migration deliberately fails rather than concealing historical duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS electricity_unique_provider_transaction
    ON electricity_orders(provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL
      AND provider_transaction_id <> '';

CREATE TABLE IF NOT EXISTS operator_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES users(id),
    action text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;

-- Bootstrap an operator only through privileged DB access after strong MFA
-- and access policy are configured. There is NO public operator elevation API.
