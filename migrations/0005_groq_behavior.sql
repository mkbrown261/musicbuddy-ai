-- ============================================================
-- Migration 0005: Groq Behavior Engine + Real-Time Interaction
-- Tables: groq_behavior_log, interaction_loop_state,
--         engagement_stream, behavior_cache
-- Also: removes demo seed children (they block real profiles)
-- ============================================================

-- ── Remove demo seed children (inserted by seed.sql) ─────────
-- Only deletes if they have no real session data attached,
-- so real children are never affected.
DELETE FROM child_profiles
WHERE id IN (1, 2, 3)
  AND name IN ('Emma', 'Liam', 'Mia')
  AND NOT EXISTS (
    SELECT 1 FROM sessions WHERE child_id = child_profiles.id
  );

-- Clean up orphaned seed data
DELETE FROM favorite_songs
WHERE child_id IN (1, 2, 3)
  AND NOT EXISTS (SELECT 1 FROM child_profiles WHERE id = child_id);

DELETE FROM adaptive_profiles
WHERE child_id IN (1, 2, 3)
  AND NOT EXISTS (SELECT 1 FROM child_profiles WHERE id = child_id);

DELETE FROM parental_rules
WHERE child_id IN (1, 2, 3)
  AND NOT EXISTS (SELECT 1 FROM child_profiles WHERE id = child_id);

-- Reset the auto-increment so new profiles start at a clean ID
-- (SQLite: delete from sqlite_sequence is the way)
DELETE FROM sqlite_sequence WHERE name = 'child_profiles'
  AND NOT EXISTS (SELECT 1 FROM child_profiles WHERE id > 3);

-- ── Groq Behavior Log ────────────────────────────────────────
-- Stores every Groq decision for analytics + replay
CREATE TABLE IF NOT EXISTS groq_behavior_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL DEFAULT 'demo',
  child_id        INTEGER,
  session_id      INTEGER,
  -- Input context
  trigger_type    TEXT    NOT NULL,   -- voice|gaze|smile|auto|manual|skip
  engagement_json TEXT,               -- JSON: { smile, laugh, attention, intensity }
  context_json    TEXT,               -- JSON: style, tempo, mood, energy, lastMode
  -- Groq output
  mode            TEXT    NOT NULL,   -- sing|talk|encourage|pause|celebrate|reengage
  tone            TEXT    NOT NULL DEFAULT 'friendly',
  text_output     TEXT    NOT NULL,   -- the generated speech text
  follow_up       TEXT,               -- encourage_participation|sing_along|wait|etc
  timing          TEXT    DEFAULT 'immediate',
  -- Metadata
  groq_model      TEXT    DEFAULT 'llama3-8b-8192',
  latency_ms      INTEGER,
  tokens_used     INTEGER,
  cache_hit       INTEGER DEFAULT 0,
  error           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_groq_log_child   ON groq_behavior_log(child_id, created_at);
CREATE INDEX IF NOT EXISTS idx_groq_log_session ON groq_behavior_log(session_id);
CREATE INDEX IF NOT EXISTS idx_groq_log_mode    ON groq_behavior_log(mode, created_at);

-- ── Behavior Cache ────────────────────────────────────────────
-- Cache Groq responses so identical context → instant reply
-- Cache key = SHA-256(trigger + engagement_summary + context)
CREATE TABLE IF NOT EXISTS behavior_cache (
  cache_key       TEXT    PRIMARY KEY,
  mode            TEXT    NOT NULL,
  tone            TEXT    NOT NULL,
  text_output     TEXT    NOT NULL,
  follow_up       TEXT,
  timing          TEXT    DEFAULT 'immediate',
  hit_count       INTEGER DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME
);

CREATE INDEX IF NOT EXISTS idx_behavior_cache_expires ON behavior_cache(expires_at);

-- ── Real-Time Engagement Stream ───────────────────────────────
-- High-frequency engagement events from camera/mic
CREATE TABLE IF NOT EXISTS engagement_stream (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL,
  child_id        INTEGER NOT NULL,
  event_type      TEXT    NOT NULL,  -- face_detected|smile|laugh|look_away|voice_detected|clap
  confidence      REAL    DEFAULT 0.8,
  value           REAL,              -- intensity / volume / gaze_x etc
  meta_json       TEXT,              -- extra data (gaze coords, frequency, etc.)
  captured_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eng_stream_session ON engagement_stream(session_id, captured_at);

-- ── Interaction Loop State ────────────────────────────────────
-- Persistent state for the behavior engine loop
CREATE TABLE IF NOT EXISTS interaction_loop_state (
  session_id      INTEGER PRIMARY KEY,
  child_id        INTEGER NOT NULL,
  current_mode    TEXT    DEFAULT 'talk',
  energy_level    TEXT    DEFAULT 'medium',
  last_mode       TEXT,
  last_behavior_at DATETIME,
  behavior_count  INTEGER DEFAULT 0,
  song_count      INTEGER DEFAULT 0,
  talk_count      INTEGER DEFAULT 0,
  pause_count     INTEGER DEFAULT 0,
  consecutive_songs INTEGER DEFAULT 0,
  groq_calls_today INTEGER DEFAULT 0,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
