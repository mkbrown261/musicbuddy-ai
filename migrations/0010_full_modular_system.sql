-- ============================================================
-- Migration 0010: Full Modular AI Child Interaction System
-- Tables: adaptive_usage, voice_prefs, audio_cache,
--         engagement_state, personality_prefs, emotion_log
-- ============================================================

-- Adaptive usage tracking (persistent across sessions)
CREATE TABLE IF NOT EXISTS adaptive_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  child_id    INTEGER,
  feature_id  TEXT    NOT NULL,
  used_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  session_id  INTEGER,
  metadata    TEXT
);
CREATE INDEX IF NOT EXISTS idx_adaptive_usage_user ON adaptive_usage(user_id, feature_id, used_at);

-- Voice preferences per user/child (persistent)
CREATE TABLE IF NOT EXISTS voice_prefs_v2 (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              TEXT NOT NULL,
  child_id             INTEGER DEFAULT -1,
  preferred_provider   TEXT DEFAULT 'openai',
  openai_voice         TEXT DEFAULT 'nova',
  elevenlabs_voice_id  TEXT DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  elevenlabs_voice_name TEXT DEFAULT 'Luna',
  polly_voice          TEXT DEFAULT 'Joanna',
  speed                REAL DEFAULT 1.0,
  default_emotion      TEXT DEFAULT 'friendly',
  singing_mode         INTEGER DEFAULT 0,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_voice_prefs_v2_user ON voice_prefs_v2(user_id, child_id);

-- Audio cache (never regenerate unnecessarily)
CREATE TABLE IF NOT EXISTS audio_cache_v2 (
  cache_key   TEXT    PRIMARY KEY,
  text_hash   TEXT    NOT NULL,
  provider    TEXT    NOT NULL,
  voice_id    TEXT    NOT NULL,
  style       TEXT    NOT NULL DEFAULT 'children_host',
  emotion     TEXT    NOT NULL DEFAULT 'friendly',
  audio_data  TEXT    NOT NULL,
  char_count  INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  hit_count   INTEGER DEFAULT 0,
  created_at  TEXT    DEFAULT (datetime('now')),
  last_hit    TEXT
);
CREATE INDEX IF NOT EXISTS idx_audio_cache_v2_hash ON audio_cache_v2(text_hash);

-- Engagement state (survive restarts)
CREATE TABLE IF NOT EXISTS engagement_state (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  child_id     INTEGER DEFAULT -1,
  session_id   INTEGER,
  emotion      TEXT DEFAULT 'neutral',
  personality  TEXT DEFAULT 'playful',
  smile_count  INTEGER DEFAULT 0,
  laugh_count  INTEGER DEFAULT 0,
  attention_loss INTEGER DEFAULT 0,
  eng_score    INTEGER DEFAULT 0,
  voice_detected INTEGER DEFAULT 0,
  current_song TEXT,
  current_game TEXT,
  last_response TEXT,
  updated_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, child_id)
);

-- Personality preferences per user/child
CREATE TABLE IF NOT EXISTS personality_prefs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  child_id        INTEGER DEFAULT -1,
  personality     TEXT NOT NULL DEFAULT 'playful',
  updated_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, child_id)
);

-- Emotion log (for tracking over time)
CREATE TABLE IF NOT EXISTS emotion_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  child_id     INTEGER,
  session_id   INTEGER,
  emotion      TEXT NOT NULL,
  trigger      TEXT,
  eng_score    INTEGER,
  logged_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_emotion_log_user ON emotion_log(user_id, logged_at);
