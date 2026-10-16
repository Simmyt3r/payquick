-- Enforce balanced journals at transaction commit.
BEGIN;
CREATE OR REPLACE FUNCTION enforce_balanced_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_total bigint;
BEGIN
  SELECT COALESCE(SUM(amount_kobo),0) INTO journal_total FROM ledger_entries
  WHERE transaction_id=NEW.transaction_id;
  IF journal_total <> 0 THEN
    RAISE EXCEPTION 'Unbalanced ledger journal %', NEW.transaction_id;
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS ledger_entries_balance_check ON ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_entries_balance_check
AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_balanced_ledger();
COMMIT;
