CREATE SCHEMA IF NOT EXISTS "event";

--TYPES
CREATE TYPE "event".event_status AS ENUM ('completed', 'live', 'scheduled');

CREATE TYPE "event".bet_type AS ENUM ('buy', 'sell');

--TABLES
CREATE TABLE
    IF NOT EXISTS "event".event
(
    "id"                       CHAR(24) PRIMARY KEY,
    "name"                     VARCHAR(255)         NOT NULL,
    "description"              TEXT,
    "info"                     TEXT,
    "image_url"                TEXT,
    "start_at"                 TIMESTAMPTZ          NOT NULL,
    "end_at"                   TIMESTAMPTZ          NOT NULL,
    "frozen"                   BOOLEAN              NOT NULL DEFAULT false,
    "freeze_at"                TIMESTAMPTZ,
    "status"                   "event".event_status NOT NULL DEFAULT 'scheduled',
    "option_won"               INTEGER,
    "platform_fees_percentage" FLOAT                NOT NULL,
    "platform_liquidity_left"  DECIMAL              NOT NULL,
    "min_liquidity_percentage" FLOAT                NOT NULL,
    "max_liquidity_percentage" FLOAT                NOT NULL,
    "liquidity_in_between"     BOOLEAN              NOT NULL,
    "win_price"                DECIMAL              NOT NULL,
    "token"                    "wallet".token       NOT NULL,
    "chain"                    "wallet".chain       NOT NULL,
    "slippage"                 DECIMAL              NOT NULL,
    "resolved"                 BOOLEAN              NOT NULL DEFAULT false,
    "resolved_at"              TIMESTAMPTZ,
    "created_at"               TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    "updated_at"               TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE TABLE
    IF NOT EXISTS "event".option
(
    "id"         SERIAL PRIMARY KEY,
    "event_id"   CHAR(24)     NOT NULL REFERENCES "event".event (id) ON DELETE CASCADE,
    "name"       VARCHAR(255) NOT NULL,
    "image_url"  TEXT,
    "odds"       FLOAT        NOT NULL,
    "price"      DECIMAL      NOT NULL,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE "event".event
    ADD FOREIGN KEY ("option_won") REFERENCES "event".option (id);



CREATE TABLE
    IF NOT EXISTS "event".source
(
    "id"         SERIAL PRIMARY KEY,
    "name"       VARCHAR(255) NOT NULL,
    "url"        TEXT         NOT NULL,
    "event_id"   CHAR(24)     NOT NULL REFERENCES "event".event (id) ON DELETE CASCADE,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE
    IF NOT EXISTS "event".option_odds_history
(
    "id"         SERIAL PRIMARY KEY,
    "option_id"  INTEGER     NOT NULL REFERENCES "event".option (id) ON DELETE CASCADE,
    "quantity"   INT         NOT NULL,
    "odds"       FLOAT       NOT NULL,
    "price"      DECIMAL     NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE
    IF NOT EXISTS "event".event_status_log
(
    "id"         SERIAL PRIMARY KEY,
    "event_id"   CHAR(24)             NOT NULL REFERENCES "event".event (id) ON DELETE CASCADE,
    "status"     "event".event_status NOT NULL,
    "created_at" TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE TABLE
    IF NOT EXISTS "event".category
(
    "id"          SERIAL PRIMARY KEY,
    "name"        VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image_url"   TEXT,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE
    IF NOT EXISTS "event".event_category
(
    "id"          SERIAL PRIMARY KEY,
    "event_id"    CHAR(24)    NOT NULL REFERENCES "event".event (id) ON DELETE CASCADE,
    "category_id" INTEGER     NOT NULL REFERENCES "event".category (id) ON DELETE CASCADE,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE
    IF NOT EXISTS "event".bet
(
    "id"                         CHAR(24) PRIMARY KEY,
    "event_id"                   CHAR(24)         NOT NULL REFERENCES "event".event (id),
    "user_id"                    CHAR(24)         NOT NULL REFERENCES "user".user (id),
    "option_id"                  INTEGER          NOT NULL REFERENCES "event".option (id),
    "quantity"                   INT              NOT NULL,
    "price_per_quantity"         DECIMAL          NOT NULL,
    "unmatched_reward_amount"    DECIMAL          NOT NULL,
    "matched_quantity"           INT              NOT NULL,
    "type"                       "event".bet_type NOT NULL,
    "buy_bet_id"                 CHAR(24) REFERENCES "event".bet (id),
    "buy_bet_price_per_quantity" DECIMAL, --Adding this column to avoid join for calculating profit.
    "reward_amount_used"         DECIMAL          NOT NULL,
    "profit"                     DECIMAL,
    "platform_commission"        DECIMAL,
    "sold_quantity"              INT,
    "limit_order"                BOOLEAN          NOT NULL DEFAULT false,
    "created_at"                 TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "updated_at"                 TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);


ALTER TABLE "wallet".transaction
    ADD FOREIGN KEY ("bet_id") REFERENCES "event".bet (id);

CREATE TABLE
    IF NOT EXISTS "event".matched
(
    "id"             SERIAL PRIMARY KEY,
    "bet_id"         CHAR(24)    NOT NULL REFERENCES "event".bet (id),
    "matched_bet_id" CHAR(24)    NOT NULL REFERENCES "event".bet (id),
    "quantity"       INT         NOT NULL,
    "liquidity_used" DECIMAL     NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS "event".bet_queue
(
    "bet_id"   CHAR(24) PRIMARY KEY REFERENCES "event".bet (id),
    "event_id" CHAR(24) REFERENCES "event".event (id),
    --created_at is duplicated from bet table to avoid join with bet table. This table is frequently queried. So, this is a performance optimization.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--FUNCTIONS
CREATE OR REPLACE FUNCTION "event".fn_update_event_status_log() RETURNS TRIGGER
    LANGUAGE PLPGSQL AS
$$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO "event".event_status_log (event_id, status)
        VALUES (NEW.id, NEW.status);
    ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
        INSERT INTO "event".event_status_log (event_id, status)
        VALUES (NEW.id, NEW.status);
    END IF;
    RETURN NEW;
END;
$$;

--TRIGGERS
CREATE
    OR REPLACE TRIGGER trg_update_event_status_log
    AFTER
        UPDATE
        OR INSERT
    ON "event".event
    FOR EACH ROW
EXECUTE PROCEDURE "event".fn_update_event_status_log();