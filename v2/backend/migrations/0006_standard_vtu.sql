-- Conventional VTU purchases, independent of AI, smart meters and automation.
-- Deploy only after migrations 0001–0005. No live provider flag changes.
BEGIN;
CREATE TABLE IF NOT EXISTS vtu_quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    category text NOT NULL CHECK (category IN ('airtime','data','tv')),
    service_id text NOT NULL,
    beneficiary text NOT NULL,
    contact_phone text NOT NULL,
    variation_code text,
    verified_customer_name text,
    amount_kobo bigint NOT NULL CHECK(amount_kobo BETWEEN 10000 AND 20000000),
    fee_kobo bigint NOT NULL DEFAULT 0 CHECK(fee_kobo>=0),
    total_kobo bigint GENERATED ALWAYS AS (amount_kobo+fee_kobo) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS vtu_quotes_user_created ON vtu_quotes(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS vtu_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    quote_id uuid NOT NULL UNIQUE REFERENCES vtu_quotes(id),
    idempotency_key text NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK
      (status IN ('queued','submitting','pending','delivered','failed','manual_review')),
    provider_request_id text UNIQUE,
    provider_transaction_id text UNIQUE,
    provider_code text,
    attempts int NOT NULL DEFAULT 0,
    next_check_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS vtu_orders_worker ON vtu_orders(status,next_check_at,created_at);
CREATE INDEX IF NOT EXISTS vtu_orders_user ON vtu_orders(user_id,created_at DESC);
COMMIT;
