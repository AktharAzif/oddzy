CREATE SCHEMA IF NOT EXISTS "user";

--TABLES
CREATE TABLE IF NOT EXISTS "user".user (
    "id" CHAR(24) PRIMARY KEY,
    "name" VARCHAR(127) NOT NULL,
    "email" TEXT UNIQUE,
    "phone" VARCHAR(15) UNIQUE,
    "avatar" TEXT,
    "about" VARCHAR(255),
    "access" BOOLEAN NOT NULL DEFAULT FALSE,
    "privy_id" VARCHAR(255) NOT NULL UNIQUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user".referral_code (
    "id" CHAR(24) PRIMARY KEY,
    "code" CHAR(10) UNIQUE,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "user_id" CHAR(24) REFERENCES "user".user(id),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user".referral (
    "id" CHAR(24) PRIMARY KEY,
    "user_id" CHAR(24) UNIQUE REFERENCES "user".user(id),
    "referral_code_id" CHAR(24) UNIQUE REFERENCES "user".referral_code(id),
    "completed" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user".twitter (
    "id" VARCHAR(127) PRIMARY KEY,
    "username" VARCHAR(127) UNIQUE,
    "name" VARCHAR(127),
    "avatar" TEXT,
    "refresh_token" TEXT UNIQUE,
    "user_id" CHAR(24) UNIQUE REFERENCES "user".user(id),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user".discord (
    "id" VARCHAR(127) PRIMARY KEY,
    "username" VARCHAR(127) UNIQUE,
    "name" VARCHAR(127),
    "avatar" TEXT,
    "email" TEXT,
    "refresh_token" TEXT UNIQUE,
    "user_id" CHAR(24) UNIQUE REFERENCES "user".user(id),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);