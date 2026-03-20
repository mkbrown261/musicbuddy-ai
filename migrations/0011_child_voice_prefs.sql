-- ============================================================
-- Migration 0011: Per-Child Voice Preferences
-- Adds child_id support to tts_voice_preferences so each child
-- can have their own voice selection that persists across restarts.
-- Falls back to user-level prefs (child_id = -1) if not set.
-- Also adds elevenlabs_voice_name for the full voice picker.
-- ============================================================

-- Add child_id column (default -1 = user-level / no child)
ALTER TABLE tts_voice_preferences ADD COLUMN child_id INTEGER DEFAULT -1;

-- Add ElevenLabs voice name (human-readable label for full picker)
ALTER TABLE tts_voice_preferences ADD COLUMN elevenlabs_voice_name TEXT DEFAULT 'Luna';

-- Add openai_voice_label for the voice picker UI
ALTER TABLE tts_voice_preferences ADD COLUMN openai_voice_label TEXT DEFAULT 'Nova (Warm female)';

-- Composite unique index: user + child (replaces single-column primary key)
-- The old PRIMARY KEY on user_id stays; we use this index for per-child lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_tts_prefs_user_child
  ON tts_voice_preferences(user_id, child_id);
