-- ============================================================
-- Migration 0008: Voice Personality Full Persistence
-- Adds character, voice_style, stability, style_boost,
-- similarity, groq_personality columns to tts_voice_preferences
-- Required for persistent Luna/Max/Bubbles character selection
-- ============================================================

-- Add character and full expressiveness columns
ALTER TABLE tts_voice_preferences ADD COLUMN voice_character TEXT DEFAULT 'luna';
ALTER TABLE tts_voice_preferences ADD COLUMN voice_style TEXT DEFAULT 'default';
ALTER TABLE tts_voice_preferences ADD COLUMN stability REAL DEFAULT 0.35;
ALTER TABLE tts_voice_preferences ADD COLUMN style_boost REAL DEFAULT 0.75;
ALTER TABLE tts_voice_preferences ADD COLUMN similarity REAL DEFAULT 0.60;
ALTER TABLE tts_voice_preferences ADD COLUMN groq_personality INTEGER DEFAULT 1;

-- Add snippet cache table with voice-aware cache key
-- This ensures switching voices generates a new song (correct behaviour)
CREATE TABLE IF NOT EXISTS snippet_audio_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key     TEXT NOT NULL UNIQUE,  -- SHA-256(childId + voiceId + style + lyricsHash)
  child_id      INTEGER NOT NULL,
  voice_id      TEXT NOT NULL,
  style         TEXT NOT NULL,
  lyrics_hash   TEXT,                  -- hash of lyrics if singing mode
  audio_url     TEXT NOT NULL,
  title         TEXT,
  duration_secs INTEGER DEFAULT 25,
  provider      TEXT DEFAULT 'demo',
  hit_count     INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME DEFAULT (datetime('now', '+7 days'))
);

CREATE INDEX IF NOT EXISTS idx_snippet_cache_key ON snippet_audio_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_snippet_cache_child ON snippet_audio_cache(child_id);
