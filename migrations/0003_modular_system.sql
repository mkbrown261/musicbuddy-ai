-- ============================================================
-- Migration 0003: Modular System Tables
-- Song Library, TTS Usage, Gaze Tracking, Behavior Loop,
-- Free Features, Billing & Key Provisioning
-- ============================================================

-- ── 1. Song Library (persistent replay, no re-gen cost) ──────
CREATE TABLE IF NOT EXISTS song_library (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id        INTEGER NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  style           TEXT    NOT NULL DEFAULT 'playful',
  tempo           TEXT    NOT NULL DEFAULT 'medium',
  mood            TEXT    NOT NULL DEFAULT 'happy',
  audio_url       TEXT,
  provider        TEXT    NOT NULL DEFAULT 'demo',
  prompt_used     TEXT,
  lyrics          TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 25,
  engagement_score REAL    NOT NULL DEFAULT 0.0,
  play_count      INTEGER NOT NULL DEFAULT 0,
  is_favorite     INTEGER NOT NULL DEFAULT 0,   -- boolean
  tags            TEXT    NOT NULL DEFAULT '[]', -- JSON array
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_played_at  DATETIME
);

CREATE INDEX IF NOT EXISTS idx_song_library_child ON song_library(child_id);
CREATE INDEX IF NOT EXISTS idx_song_library_score ON song_library(child_id, engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_song_library_audio  ON song_library(audio_url);

-- Song replay log (free replay tracking)
CREATE TABLE IF NOT EXISTS song_replay_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id    INTEGER NOT NULL REFERENCES song_library(id) ON DELETE CASCADE,
  child_id   INTEGER NOT NULL,
  session_id INTEGER,
  replayed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. TTS Usage Log (tracks premium & trial uses) ───────────
CREATE TABLE IF NOT EXISTS tts_usage_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL DEFAULT 'demo',
  child_id   INTEGER,
  provider   TEXT    NOT NULL,  -- 'openai' | 'elevenlabs'
  voice_id   TEXT    NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  tier       TEXT    NOT NULL DEFAULT 'free',  -- 'free'|'trial'|'premium'|'free_fallback'
  used_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tts_usage_user_date ON tts_usage_log(user_id, provider, used_at);

-- ── 3. Gaze Events (camera gaze tracking) ────────────────────
CREATE TABLE IF NOT EXISTS gaze_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id     INTEGER NOT NULL,
  session_id   INTEGER,
  gaze_x       REAL    NOT NULL DEFAULT 0.5,
  gaze_y       REAL    NOT NULL DEFAULT 0.5,
  confidence   REAL    NOT NULL DEFAULT 0.0,
  on_screen    INTEGER NOT NULL DEFAULT 0,   -- boolean
  dwell_ms     INTEGER NOT NULL DEFAULT 0,
  heatmap_col  INTEGER NOT NULL DEFAULT 5,
  heatmap_row  INTEGER NOT NULL DEFAULT 5,
  recorded_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gaze_child_session ON gaze_events(child_id, session_id);

-- ── 4. Behavior Loop (strategy persistence + outcomes) ───────
CREATE TABLE IF NOT EXISTS behavior_strategies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id      INTEGER NOT NULL UNIQUE,
  strategy_data TEXT    NOT NULL DEFAULT '{}',  -- JSON: strategy_key → score
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS behavior_loop_log (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id                    INTEGER NOT NULL,
  session_id                  INTEGER,
  strategy_key                TEXT    NOT NULL,
  action                      TEXT    NOT NULL,
  engagement_score_at_decision REAL   NOT NULL DEFAULT 0.0,
  post_engagement_score       REAL,
  improvement                 REAL,
  resolved_at                 DATETIME,
  created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_behavior_log_child ON behavior_loop_log(child_id);

-- ── 5. Feature Usage Log (free feature gating) ───────────────
CREATE TABLE IF NOT EXISTS feature_usage_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL DEFAULT 'demo',
  child_id   INTEGER,
  feature_id TEXT    NOT NULL,
  used_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feature_usage_date ON feature_usage_log(user_id, feature_id, used_at);

-- ── 6. Subscriptions (billing state) ─────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                 TEXT    NOT NULL UNIQUE,
  plan_id                 TEXT    NOT NULL DEFAULT 'free',
  stripe_subscription_id  TEXT,
  stripe_customer_id      TEXT,
  status                  TEXT    NOT NULL DEFAULT 'none',
  current_period_end      DATETIME,
  created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- ── 7. Key Provision Log (audit trail) ───────────────────────
CREATE TABLE IF NOT EXISTS key_provision_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  provider     TEXT    NOT NULL,   -- 'openai' | 'replicate' | 'elevenlabs' | 'suno'
  plan_id      TEXT    NOT NULL,
  provisioned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── 8. Error & Event Log (audit + admin alerts) ──────────────
CREATE TABLE IF NOT EXISTS system_event_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  level        TEXT    NOT NULL DEFAULT 'info',   -- 'info'|'warn'|'error'|'critical'
  module       TEXT    NOT NULL DEFAULT 'system',
  intent       TEXT,
  user_id      TEXT,
  child_id     INTEGER,
  message      TEXT    NOT NULL,
  data         TEXT,     -- JSON
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_syslog_level ON system_event_log(level, created_at);
