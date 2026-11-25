CREATE TABLE wallets (
  id          uuid          PRIMARY KEY,
  player_id   uuid          NOT NULL,
  currency    char(3)       NOT NULL,
  balance     numeric(19,2) NOT NULL,
  version     integer       NOT NULL DEFAULT 1,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0),
  CONSTRAINT wallets_player_currency_unique UNIQUE (player_id, currency)
);

CREATE TABLE wager_transactions (
  id                               uuid          PRIMARY KEY,
  provider_id                      text          NOT NULL,
  external_transaction_id          text          NOT NULL,
  idempotency_key                  text          NOT NULL,
  payload_hash                     text          NOT NULL,
  wallet_id                        uuid          NOT NULL REFERENCES wallets (id),
  player_id                        uuid          NOT NULL,
  round_id                         text          NOT NULL,
  game_id                          text          NOT NULL,
  kind                             text          NOT NULL,
  amount                           numeric(19,2) NOT NULL,
  currency                         char(3)       NOT NULL,
  reference_external_transaction_id text,
  reference_transaction_id         uuid          REFERENCES wager_transactions (id),
  status                           text          NOT NULL DEFAULT 'PENDING',
  failure_code                     text,
  balance_after                    numeric(19,2),
  created_at                       timestamptz   NOT NULL DEFAULT now(),
  processed_at                     timestamptz,
  CONSTRAINT wager_tx_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT wager_tx_provider_external_unique UNIQUE (provider_id, external_transaction_id),
  CONSTRAINT wager_tx_amount_positive CHECK (amount > 0),
  CONSTRAINT wager_tx_kind_valid CHECK (kind IN ('OPENING','BET','WIN','LOSS','REFUND','ROLLBACK')),
  CONSTRAINT wager_tx_status_valid CHECK (status IN ('PENDING','PENDING_REFERENCE','PROCESSED','REJECTED','FAILED'))
);

CREATE TABLE wallet_ledger_entries (
  id             uuid          PRIMARY KEY,
  wallet_id      uuid          NOT NULL REFERENCES wallets (id),
  transaction_id uuid          NOT NULL REFERENCES wager_transactions (id),
  direction      text          NOT NULL,
  amount         numeric(19,2) NOT NULL,
  balance_before numeric(19,2) NOT NULL,
  balance_after  numeric(19,2) NOT NULL,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ledger_direction_valid CHECK (direction IN ('DEBIT','CREDIT')),
  CONSTRAINT ledger_amount_positive CHECK (amount > 0),
  CONSTRAINT ledger_one_entry_per_wallet_tx UNIQUE (wallet_id, transaction_id),
  CONSTRAINT ledger_balanced CHECK (
    (direction = 'DEBIT'  AND balance_before - amount = balance_after) OR
    (direction = 'CREDIT' AND balance_before + amount = balance_after)
  )
);

CREATE FUNCTION prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger_entries is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON wallet_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();