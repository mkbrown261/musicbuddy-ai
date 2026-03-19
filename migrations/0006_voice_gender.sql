-- ============================================================
-- Migration 0006: Voice Gender + Personality Engine
-- Adds voice_gender column to tts_voice_preferences
-- Required for the 3-stage Groq Personality → Voice Select → ElevenLabs pipeline
-- ============================================================

-- Add voice_gender to tts_voice_preferences
ALTER TABLE tts_voice_preferences ADD COLUMN voice_gender TEXT DEFAULT 'female';

-- Add personality_cache table — stores Groq personality rewrites
-- so the same raw text + emotion never gets rewritten twice
CREATE TABLE IF NOT EXISTS personality_cache (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key   TEXT NOT NULL UNIQUE,   -- SHA-256(text + emotion + style)
  raw_text    TEXT NOT NULL,
  rewritten   TEXT NOT NULL,
  voice_style TEXT NOT NULL DEFAULT 'default',
  stability   REAL DEFAULT 0.35,
  style_boost REAL DEFAULT 0.75,
  from_groq   INTEGER DEFAULT 0,     -- 1 = Groq rewrote it, 0 = local enrichment
  hit_count   INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personality_cache_key ON personality_cache(cache_key);
