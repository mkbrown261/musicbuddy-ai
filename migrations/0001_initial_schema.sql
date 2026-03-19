-- ============================================================
-- AI Music Companion for Children - Initial Schema
-- Database Layer: All persistent state for the 5-layer system
-- ============================================================

-- Child Profiles
CREATE TABLE IF NOT EXISTS child_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK(age >= 0 AND age <= 12),
  avatar TEXT DEFAULT 'default',
  preferred_style TEXT DEFAULT 'playful',   -- playful, lullaby, upbeat, classical
  engagement_mode TEXT DEFAULT 'auto',      -- auto, manual
  screen_time_limit INTEGER DEFAULT 30,     -- minutes per session
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Favorite Songs per Child
CREATE TABLE IF NOT EXISTS favorite_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  song_title TEXT NOT NULL,
  artist TEXT,
  genre TEXT,
  bpm INTEGER,
  mood TEXT DEFAULT 'happy',               -- happy, calm, energetic, sleepy
  priority INTEGER DEFAULT 5,              -- 1-10 priority weighting
  play_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE
);

-- Generated Music Snippets (cache to avoid repetition)
CREATE TABLE IF NOT EXISTS music_snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  source_song TEXT,                        -- reference song used for generation
  style TEXT NOT NULL,
  tempo TEXT DEFAULT 'medium',             -- slow, medium, fast
  duration_seconds INTEGER DEFAULT 25,
  prompt_used TEXT,                        -- full Suno/Sodo API prompt
  audio_url TEXT,                          -- stored URL or blob reference
  generation_hash TEXT UNIQUE,             -- hash to detect duplicate prompts
  engagement_score REAL DEFAULT 0.0,       -- 0.0 to 1.0 based on child response
  play_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE
);

-- Engagement Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  total_duration_seconds INTEGER DEFAULT 0,
  session_mode TEXT DEFAULT 'auto',       -- auto, manual, background
  notes TEXT,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE
);

-- Engagement Events (per session: smiles, laughter, fixation)
CREATE TABLE IF NOT EXISTS engagement_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  child_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,               -- smile, laughter, fixation, attention_loss, boredom
  intensity REAL DEFAULT 0.5,             -- 0.0 to 1.0
  duration_ms INTEGER DEFAULT 0,
  snippet_id INTEGER,                     -- which snippet was playing (if any)
  gaze_x REAL,                            -- normalized gaze coordinates
  gaze_y REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (snippet_id) REFERENCES music_snippets(id) ON DELETE SET NULL
);

-- Interaction Log (conversation + song transitions)
CREATE TABLE IF NOT EXISTS interaction_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  child_id INTEGER NOT NULL,
  interaction_type TEXT NOT NULL,         -- greeting, conversation, song, transition, repeat
  content TEXT,                           -- TTS text or song title
  snippet_id INTEGER,
  trigger TEXT,                           -- what triggered this: smile, laughter, timer, manual
  duration_ms INTEGER DEFAULT 0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE
);

-- Parental Rules & Guidance
CREATE TABLE IF NOT EXISTS parental_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  rule_type TEXT NOT NULL,                -- screen_time, content_filter, volume_limit, bedtime
  rule_value TEXT NOT NULL,               -- JSON encoded rule value
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE
);

-- Background Listening Detections
CREATE TABLE IF NOT EXISTS background_detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  session_id INTEGER,
  detected_song TEXT,
  detected_artist TEXT,
  detected_genre TEXT,
  confidence REAL DEFAULT 0.0,            -- 0.0 to 1.0
  used_as_seed INTEGER DEFAULT 0,         -- whether this was used for generation
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE
);

-- Adaptive Learning Profile (aggregate preferences over time)
CREATE TABLE IF NOT EXISTS adaptive_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL UNIQUE,
  favorite_styles TEXT DEFAULT '[]',       -- JSON array of style scores
  favorite_tempos TEXT DEFAULT '[]',       -- JSON array of tempo preferences
  peak_attention_time TEXT DEFAULT '[]',   -- JSON: time-of-day patterns
  avg_engagement_score REAL DEFAULT 0.0,
  total_sessions INTEGER DEFAULT 0,
  total_songs_played INTEGER DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_favorite_songs_child ON favorite_songs(child_id);
CREATE INDEX IF NOT EXISTS idx_snippets_child ON music_snippets(child_id);
CREATE INDEX IF NOT EXISTS idx_snippets_hash ON music_snippets(generation_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_child ON sessions(child_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON engagement_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_child ON engagement_events(child_id);
CREATE INDEX IF NOT EXISTS idx_interaction_session ON interaction_log(session_id);
CREATE INDEX IF NOT EXISTS idx_bg_detections_child ON background_detections(child_id);
