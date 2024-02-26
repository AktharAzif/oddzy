CREATE SCHEMA IF NOT EXISTS "wallet";

--TYPES
CREATE TYPE "wallet".transaction_for AS ENUM ('deposit', 'withdraw', 'bet', 'bet_win', 'bet_cancel');

CREATE TYPE "wallet".transaction_status AS ENUM ('pending', 'completed');

CREATE TYPE "wallet".token AS ENUM ('gone', 'toshi', 'myro', 'eth');

CREATE TYPE "wallet".chain AS ENUM ('polygon', 'base', 'solana', 'polygon_zkevm');

CREATE TYPE "wallet".chain_type AS ENUM ('evm', 'solana');

--TABLES
CREATE TABLE
    IF NOT EXISTS "wallet".transaction
(
    "id"            CHAR(24) PRIMARY KEY,
    "user_id"       CHAR(24)                    NOT NULL REFERENCES "user".user (id),
    "amount"        DECIMAL                     NOT NULL,
    "reward_amount" DECIMAL                     NOT NULL,
    "tx_for"        "wallet".transaction_for    NOT NULL,
    "tx_status"     "wallet".transaction_status NOT NULL,
    "tx_hash"       VARCHAR(255),
    "token"         "wallet".token              NOT NULL,
    "chain"         "wallet".chain              NOT NULL,
    "bet_id"        CHAR(24), --Added reference in 03_event.sql
    "bet_quantity"  INTEGER,
    "created_at"    TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE TABLE
    IF NOT EXISTS "wallet".linked_wallet
(
    "id"         CHAR(24) PRIMARY KEY,
    "user_id"    CHAR(24)            NOT NULL REFERENCES "user".user (id),
    "chain_type" "wallet".chain_type NOT NULL,
    "address"    VARCHAR(255)        NOT NULL UNIQUE,
    "created_at" TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);