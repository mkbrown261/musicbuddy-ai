-- ============================================================
-- Seed Data - Demo Child Profiles & Sample Preferences
-- ============================================================

-- Demo child profiles
INSERT OR IGNORE INTO child_profiles (id, name, age, avatar, preferred_style, engagement_mode, screen_time_limit)
VALUES 
  (1, 'Emma', 4, 'bunny', 'playful', 'auto', 30),
  (2, 'Liam', 6, 'lion', 'upbeat', 'auto', 25),
  (3, 'Mia',  3, 'star',  'lullaby', 'manual', 20);

-- Demo favorite songs
INSERT OR IGNORE INTO favorite_songs (child_id, song_title, artist, genre, bpm, mood, priority)
VALUES
  (1, 'Twinkle Twinkle Little Star', 'Traditional', 'nursery', 72, 'calm', 9),
  (1, 'Baby Shark', 'Pinkfong', 'kids', 130, 'energetic', 10),
  (1, 'Old MacDonald Had a Farm', 'Traditional', 'nursery', 88, 'happy', 8),
  (2, 'Wheels on the Bus', 'Traditional', 'nursery', 95, 'happy', 9),
  (2, 'Five Little Monkeys', 'Traditional', 'kids', 110, 'energetic', 8),
  (2, 'Row Row Row Your Boat', 'Traditional', 'nursery', 70, 'calm', 7),
  (3, 'Brahms Lullaby', 'Brahms', 'classical', 55, 'sleepy', 10),
  (3, 'Hush Little Baby', 'Traditional', 'lullaby', 60, 'calm', 9),
  (3, 'Twinkle Twinkle Little Star', 'Traditional', 'nursery', 72, 'calm', 8);

-- Parental rules
INSERT OR IGNORE INTO parental_rules (child_id, rule_type, rule_value, is_active)
VALUES
  (1, 'screen_time', '{"maxMinutes": 30, "alertAt": 25}', 1),
  (1, 'content_filter', '{"allowedGenres": ["nursery","kids","classical"], "blockedContent": []}', 1),
  (1, 'volume_limit', '{"maxVolume": 70}', 1),
  (2, 'screen_time', '{"maxMinutes": 25, "alertAt": 20}', 1),
  (2, 'volume_limit', '{"maxVolume": 75}', 1),
  (3, 'screen_time', '{"maxMinutes": 20, "alertAt": 15}', 1),
  (3, 'volume_limit', '{"maxVolume": 60}', 1);

-- Initialize adaptive profiles (JSON objects {style: score} for weighted learning)
INSERT OR IGNORE INTO adaptive_profiles (child_id, favorite_styles, favorite_tempos, avg_engagement_score)
VALUES
  (1, '{"playful":2.0,"upbeat":1.0}', '{"medium":2.0,"fast":1.0}', 0.0),
  (2, '{"upbeat":2.0,"energetic":1.0}', '{"fast":2.0,"medium":1.0}', 0.0),
  (3, '{"lullaby":2.0,"calm":1.0}', '{"slow":2.0,"medium":1.0}', 0.0);
