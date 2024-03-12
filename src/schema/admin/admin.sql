CREATE SCHEMA IF NOT EXISTS "admin";


CREATE TABLE IF NOT EXISTS "admin".automation
(
    id              CHAR(24) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    data            JSONB        NOT NULL,
    data_point      JSONB        NOT NULL,
    description     TEXT         NOT NULL,
    sample_question JSONB        NOT NULL,
    run_at          TIMESTAMPTZ  NOT NULL,
    enabled         BOOLEAN      NOT NULL DEFAULT FALSE,
    last_ran_at     TIMESTAMPTZ,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
)