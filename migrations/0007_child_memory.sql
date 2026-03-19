-- ============================================================
-- Migration 0007: Child Memory Engine
-- Creates child_memory table for Phase 2 "Alive System"
-- Stores per-child emotional history, milestones, and
-- favorite phrases so MusicBuddy remembers every child.
-- ============================================================

CREATE TABLE IF NOT EXISTS child_memory (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id          INTEGER NOT NULL UNIQUE,
  last_emotion      TEXT,                       -- EmotionLabel: excited/happy/calm/comfort/curious/surprised/singing
  dominant_emotion  TEXT,                       -- Most frequent emotion across all sessions
  emotion_counts    TEXT DEFAULT '{}',          -- JSON: { "excited": 12, "happy": 8, ... }
  interaction_count INTEGER DEFAULT 0,          -- Total TTS/speak interactions
  session_count     INTEGER DEFAULT 0,          -- Total sessions (mirrors adaptive_profiles)
  favorite_phrases  TEXT DEFAULT '[]',          -- JSON: ["La la LA!", "More more!", ...]  (last 10)
  milestones        TEXT DEFAULT '[]',          -- JSON: ["first_hello", "five_sessions", ...]
  energy_pattern    TEXT DEFAULT 'unknown',     -- morning_high | evening_calm | consistent | unknown
  notes             TEXT DEFAULT '',            -- Free-text memory notes (max 500 chars)
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_child_memory_child_id ON child_memory(child_id);
CREATE INDEX IF NOT EXISTS idx_child_memory_last_emotion ON child_memory(last_emotion);

-- ── Also ensure personality_cache has the ambient_vibe column ──
-- (0006 created personality_cache; this adds the vibe field)
ALTER TABLE personality_cache ADD COLUMN ambient_vibe TEXT DEFAULT 'playful';
ALTER TABLE personality_cache ADD COLUMN emotion_label TEXT DEFAULT 'happy';
