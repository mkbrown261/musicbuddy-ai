-- ============================================================
-- Migration 0004: Modular TTS System
-- Tables: tts_audio_cache, tts_usage_log (replaces old one),
--         tts_voice_preferences, tts_billing_events
-- ============================================================

-- ── TTS Audio Cache ──────────────────────────────────────────
-- Stores generated audio so identical requests never re-generate.
-- Cache key = SHA-256 hex of (text + voiceId + style + emotion)
CREATE TABLE IF NOT EXISTS tts_audio_cache (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key       TEXT    NOT NULL UNIQUE,   -- hash(text+voiceId+style+emotion)
  text_hash       TEXT    NOT NULL,           -- hash of raw text only (for search)
  provider        TEXT    NOT NULL,           -- openai | elevenlabs | polly
  voice_id        TEXT    NOT NULL,
  style           TEXT    NOT NULL DEFAULT 'neutral',
  emotion         TEXT    NOT NULL DEFAULT 'friendly',
  audio_data      TEXT    NOT NULL,           -- base64 data URL
  char_count      INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER,                    -- estimated audio length
  hit_count       INTEGER NOT NULL DEFAULT 0, -- how many times reused
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME                    -- NULL = never expire
);

CREATE INDEX IF NOT EXISTS idx_tts_cache_key       ON tts_audio_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_tts_cache_text_hash ON tts_audio_cache(text_hash);
CREATE INDEX IF NOT EXISTS idx_tts_cache_provider  ON tts_audio_cache(provider);
CREATE INDEX IF NOT EXISTS idx_tts_cache_expires   ON tts_audio_cache(expires_at);

-- ── TTS Usage Log ────────────────────────────────────────────
-- One row per generation (cache hits do NOT insert here)
CREATE TABLE IF NOT EXISTS tts_usage_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL DEFAULT 'demo',
  child_id        INTEGER,
  session_id      INTEGER,
  provider        TEXT    NOT NULL,
  voice_id        TEXT    NOT NULL,
  char_count      INTEGER NOT NULL DEFAULT 0,
  tier            TEXT    NOT NULL DEFAULT 'free',  -- free|trial|premium|fallback
  cache_hit       INTEGER NOT NULL DEFAULT 0,       -- 1 if served from cache
  cost_units      REAL    NOT NULL DEFAULT 0,       -- provider cost units
  latency_ms      INTEGER,                          -- generation time
  error           TEXT,                             -- NULL if success
  used_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tts_usage_user      ON tts_usage_log(user_id, used_at);
CREATE INDEX IF NOT EXISTS idx_tts_usage_provider  ON tts_usage_log(provider, used_at);
CREATE INDEX IF NOT EXISTS idx_tts_usage_date      ON tts_usage_log(DATE(used_at));

-- ── TTS Voice Preferences ─────────────────────────────────────
-- Per-user persistent voice configuration
CREATE TABLE IF NOT EXISTS tts_voice_preferences (
  user_id         TEXT    PRIMARY KEY,
  preferred_provider TEXT NOT NULL DEFAULT 'openai',
  openai_voice    TEXT    NOT NULL DEFAULT 'shimmer',
  elevenlabs_voice TEXT   NOT NULL DEFAULT '21m00Tcm4TlvDq8ikWAM',
  polly_voice     TEXT    NOT NULL DEFAULT 'Joanna',
  speed           REAL    NOT NULL DEFAULT 0.92,
  pitch           REAL    NOT NULL DEFAULT 1.0,
  default_emotion TEXT    NOT NULL DEFAULT 'friendly',
  singing_mode    INTEGER NOT NULL DEFAULT 0,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── TTS Billing Events ────────────────────────────────────────
-- Tracks trial exhaustion and billing trigger moments
CREATE TABLE IF NOT EXISTS tts_billing_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL,
  event_type      TEXT    NOT NULL,  -- trial_exhausted|quota_exceeded|upgrade_prompted
  provider        TEXT,
  tier_before     TEXT,
  tier_after      TEXT,
  detail          TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tts_billing_user ON tts_billing_events(user_id, created_at);

-- ── Premium Trial Counters ────────────────────────────────────
-- Tracks lifetime premium trial usage (separate from daily log)
CREATE TABLE IF NOT EXISTS tts_trial_usage (
  user_id         TEXT    PRIMARY KEY,
  elevenlabs_total INTEGER NOT NULL DEFAULT 0,  -- lifetime ElevenLabs uses
  trial_limit     INTEGER NOT NULL DEFAULT 15,  -- configurable limit
  trial_active    INTEGER NOT NULL DEFAULT 1,   -- 0 = trial ended
  trial_started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  trial_ended_at  DATETIME
);
