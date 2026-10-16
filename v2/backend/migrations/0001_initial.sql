-- Payquick v2 foundation (PostgreSQL 15+)
-- Apply on a new database, with a privileged migration role; use least-privileged
-- credentials for the runtime API. Immutable ledger protections enforced below.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    kind text NOT NULL CHECK (kind IN ('wallet','clearing','suspense')),
    user_id uuid UNIQUE REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wallets (
    user_id uuid PRIMARY KEY REFERENCES users(id),
    account_id uuid UNIQUE NOT NULL REFERENCES ledger_accounts(id),
    balance_kobo bigint NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0)
);
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference text NOT NULL UNIQUE,
    kind text NOT NULL CHECK (kind IN ('funding','purchase','refund','adjustment')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL REFERENCES ledger_transactions(id),
    account_id uuid NOT NULL REFERENCES ledger_accounts(id),
    amount_kobo bigint NOT NULL CHECK (amount_kobo <> 0)
);
-- Prevent accidental updates/deletions of historical postings.
CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Ledger journal is append-only'; END; $$;
DROP TRIGGER IF EXISTS ledger_entry_immutable ON ledger_entries;
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
DROP TRIGGER IF EXISTS ledger_transaction_immutable ON ledger_transactions;
CREATE TRIGGER ledger_transaction_immutable BEFORE UPDATE OR DELETE ON ledger_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
INSERT INTO ledger_accounts(code,kind) VALUES ('paystack:clearing','clearing')
ON CONFLICT (code) DO NOTHING;
INSERT INTO ledger_accounts(code,kind) VALUES ('vtpass:suspense','suspense')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS funding_intents (
    reference text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
    amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
    status text NOT NULL CHECK (status IN ('initiated','pending','credited','failed')),
    provider_transaction_id text UNIQUE,
    credited_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funding_user_idx ON funding_intents(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS meter_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    nickname text NOT NULL,
    disco text NOT NULL,
    meter_number text NOT NULL,
    meter_type text NOT NULL CHECK (meter_type IN ('prepaid','postpaid')),
    remote_loading_verified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,disco,meter_number)
);
CREATE TABLE IF NOT EXISTS electricity_quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    meter_id uuid NOT NULL REFERENCES meter_profiles(id),
    amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meter_user_idx ON meter_profiles(user_id);
CREATE INDEX IF NOT EXISTS electricity_quote_user_idx ON electricity_quotes(user_id,created_at DESC);
COMMIT;
