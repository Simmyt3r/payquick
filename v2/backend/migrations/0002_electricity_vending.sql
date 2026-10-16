-- Apply after 0001_initial.sql. Keep vending disabled until provider sandbox checks pass.
BEGIN;
ALTER TABLE meter_profiles
    ADD COLUMN IF NOT EXISTS verified_customer_name text,
    ADD COLUMN IF NOT EXISTS verified_service_band text,
    ADD COLUMN IF NOT EXISTS minimum_purchase_kobo bigint,
    ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE electricity_quotes
    ADD COLUMN IF NOT EXISTS verified_customer_name text,
    ADD COLUMN IF NOT EXISTS service_band text,
    ADD COLUMN IF NOT EXISTS total_kobo bigint,
    ADD COLUMN IF NOT EXISTS verified_at timestamptz;
INSERT INTO ledger_accounts(code,kind) VALUES ('vtpass:clearing','clearing')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS electricity_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    meter_id uuid NOT NULL REFERENCES meter_profiles(id),
    quote_id uuid NOT NULL UNIQUE REFERENCES electricity_quotes(id),
    idempotency_key text NOT NULL,
    amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
    total_kobo bigint NOT NULL CHECK (total_kobo > 0),
    phone text NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK
        (status IN ('queued','submitting','pending','delivered','failed','manual_review')),
    provider_request_id text UNIQUE,
    provider_transaction_id text,
    provider_code text,
    token_ciphertext text,
    last_checked_at timestamptz,
    next_check_at timestamptz DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS electricity_orders_schedule_idx
    ON electricity_orders(status,next_check_at,created_at);
CREATE INDEX IF NOT EXISTS electricity_orders_user_idx
    ON electricity_orders(user_id,created_at DESC);
COMMIT;
