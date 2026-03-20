-- ============================================================
-- Migration 0000: Authentication System
-- Must run BEFORE all other migrations.
-- Creates auth_users and auth_sessions tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'parent',
  password_hash TEXT    NOT NULL,
  salt          TEXT    NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login    DATETIME,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token      ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user       ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires    ON auth_sessions(expires_at);
