-- Administrator role for managed Payquick migrations.
-- Apply after 0004_operator_access.sql. Never grant it through public registration.
BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'operator', 'admin'));

CREATE TABLE IF NOT EXISTS payquick_setup_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    admin_user_id uuid NOT NULL REFERENCES users(id),
    completed_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
