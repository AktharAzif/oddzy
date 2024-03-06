CREATE SCHEMA IF NOT EXISTS "user";

CREATE TYPE "user".platform AS ENUM ( 'twitter', 'discord');

CREATE TYPE "user".notification_type AS ENUM ( 'bet', 'bet_cancel', 'bet_win', 'bet_exit', 'point');

--TABLES
CREATE TABLE IF NOT EXISTS "user".user
(
    "id"         CHAR(24) PRIMARY KEY,
    "about"      TEXT,
    "instagram"  TEXT,
    "access"     BOOLEAN     NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user".referral_code
(
    "id"         CHAR(24) PRIMARY KEY,
    "code"       CHAR(10) UNIQUE,
    "used"       BOOLEAN     NOT NULL DEFAULT false,
    "user_id"    CHAR(24) REFERENCES "user".user (id),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user".referral
(
    "id"               CHAR(24) PRIMARY KEY,
    "user_id"          CHAR(24) UNIQUE REFERENCES "user".user (id),
    "referral_code_id" CHAR(24) UNIQUE REFERENCES "user".referral_code (id),
    "completed"        BOOLEAN     NOT NULL DEFAULT FALSE,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user".social
(
    "id"            CHAR(24) PRIMARY KEY,
    "social_id"     VARCHAR(127)    NOT NULL,
    "username"      VARCHAR(127)    NOT NULL,
    "name"          VARCHAR(127)    NOT NULL,
    "avatar"        TEXT,
    "email"         TEXT,
    "refresh_token" TEXT UNIQUE     NOT NULL,
    "platform"      "user".platform NOT NULL,
    "user_id"       CHAR(24)        NOT NULL REFERENCES "user".user (id),
    "created_at"    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS "user".notification
(
    "id"         CHAR(24) PRIMARY KEY,
    "user_id"    CHAR(24) REFERENCES "user".user (id),
    "title"      TEXT                     NOT NULL,
    "message"    TEXT                     NOT NULL,
    "read"       BOOLEAN                  NOT NULL DEFAULT FALSE,
    "type"       "user".notification_type NOT NULL,
    "bet_id"     CHAR(24),
    "created_at" TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);