-- Migration 0009: Adaptive Child Engine
-- Persistent usage tracking across ALL sessions

CREATE TABLE IF NOT EXISTS adaptive_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  child_id    INTEGER,
  feature_id  TEXT    NOT NULL,
  used_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adaptive_usage_user_feature
  ON adaptive_usage(user_id, feature_id, used_at);

-- Persist child personality + emotion preferences
CREATE TABLE IF NOT EXISTS child_adaptive_prefs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id        INTEGER UNIQUE NOT NULL,
  age_group       TEXT    DEFAULT 'toddler',
  personality     TEXT    DEFAULT 'playful',
  emotion_state   TEXT    DEFAULT 'neutral',
  last_game_id    TEXT,
  session_count   INTEGER DEFAULT 0,
  total_songs     INTEGER DEFAULT 0,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_child_adaptive_prefs_child
  ON child_adaptive_prefs(child_id);
