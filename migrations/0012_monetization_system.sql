-- ============================================================
-- Migration 0012: Full Monetization System
-- Credits, Transactions, Lessons, Analytics Events
-- ============================================================

-- ── 1. Extend auth_users with credits + subscription tier ────
ALTER TABLE auth_users ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE auth_users ADD COLUMN credits           INTEGER NOT NULL DEFAULT 3;
ALTER TABLE auth_users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE auth_users ADD COLUMN trial_uses_remaining INTEGER NOT NULL DEFAULT 5;

-- ── 2. Transactions ledger ────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT    NOT NULL,
  type          TEXT    NOT NULL,   -- 'purchase'|'subscription'|'deduct'|'bonus'|'refund'
  amount_cents  INTEGER NOT NULL DEFAULT 0,  -- USD cents (0 for deductions)
  credits_delta INTEGER NOT NULL DEFAULT 0,  -- + add / - deduct
  description   TEXT    NOT NULL DEFAULT '',
  stripe_payment_intent TEXT,
  stripe_subscription_id TEXT,
  metadata      TEXT    DEFAULT '{}',  -- JSON
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe ON transactions(stripe_payment_intent);

-- ── 3. Credit usage log (per-action audit) ───────────────────
CREATE TABLE IF NOT EXISTS credit_usage_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  child_id    INTEGER,
  action      TEXT    NOT NULL,  -- 'song_gen'|'lesson'|'premium_tts'|'bonus'
  credits     INTEGER NOT NULL DEFAULT 1,
  metadata    TEXT    DEFAULT '{}',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_user ON credit_usage_log(user_id, created_at DESC);

-- ── 4. Lessons catalogue ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  topic        TEXT    NOT NULL,  -- 'animals'|'numbers'|'colors'|'letters'|'shapes'|'music'
  age_min      INTEGER NOT NULL DEFAULT 2,
  age_max      INTEGER NOT NULL DEFAULT 12,
  difficulty   TEXT    NOT NULL DEFAULT 'easy',  -- 'easy'|'medium'|'hard'
  tier_required TEXT   NOT NULL DEFAULT 'starter', -- 'free'|'starter'|'premium'
  steps        TEXT    NOT NULL DEFAULT '[]',  -- JSON array of step objects
  reward_type  TEXT    NOT NULL DEFAULT 'confetti',
  thumbnail_emoji TEXT NOT NULL DEFAULT '📚',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lessons_age ON lessons(age_min, age_max, tier_required);
CREATE INDEX IF NOT EXISTS idx_lessons_topic ON lessons(topic);

-- ── 5. Lesson progress ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_progress (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  child_id     INTEGER NOT NULL,
  lesson_id    INTEGER NOT NULL REFERENCES lessons(id),
  status       TEXT    NOT NULL DEFAULT 'started',  -- 'started'|'completed'|'abandoned'
  current_step INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  score        REAL    NOT NULL DEFAULT 0.0,
  completed_at DATETIME,
  started_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_child ON lesson_progress(child_id, lesson_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_progress_unique ON lesson_progress(user_id, child_id, lesson_id, started_at);

-- ── 6. Analytics events ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  child_id    INTEGER,
  event_type  TEXT    NOT NULL,
  -- lesson_started|lesson_completed|correct_answer|incorrect_answer
  -- credits_used|credits_purchased|upgrade_triggered|engagement_level
  -- song_played|game_started|game_completed|tts_used
  value       REAL    NOT NULL DEFAULT 1.0,
  metadata    TEXT    DEFAULT '{}',  -- JSON
  session_id  INTEGER,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_child ON analytics_events(child_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event_type, created_at DESC);

-- ── 7. Stripe webhook log (idempotency) ──────────────────────
CREATE TABLE IF NOT EXISTS stripe_webhook_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT    UNIQUE NOT NULL,
  event_type      TEXT    NOT NULL,
  processed       INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── 8. Seed: starter lessons ─────────────────────────────────
INSERT OR IGNORE INTO lessons (title, topic, age_min, age_max, difficulty, tier_required, thumbnail_emoji, steps) VALUES
('Meet the Animals!', 'animals', 2, 5, 'easy', 'free',  '🦁',
 '[{"type":"intro","text":"Let''s learn about animals today! Are you ready?","emoji":"🦁"},{"type":"question","text":"What sound does a dog make?","correct":"Woof!","options":["Woof!","Meow!","Moo!","Quack!"],"emoji":"🐶"},{"type":"question","text":"What sound does a cat make?","correct":"Meow!","options":["Woof!","Meow!","Oink!","Baa!"],"emoji":"🐱"},{"type":"question","text":"What does a cow say?","correct":"Moo!","options":["Neigh!","Moo!","Quack!","Roar!"],"emoji":"🐮"},{"type":"reward","text":"Amazing! You know all the animal sounds! You''re a superstar!","emoji":"⭐"}]'),

('Count with Me!', 'numbers', 2, 5, 'easy', 'free', '🔢',
 '[{"type":"intro","text":"Let''s count together! This is going to be so fun!","emoji":"🔢"},{"type":"question","text":"How many stars do you see? ⭐⭐⭐","correct":"3","options":["1","2","3","4"],"emoji":"⭐"},{"type":"question","text":"How many apples? 🍎🍎","correct":"2","options":["1","2","3","5"],"emoji":"🍎"},{"type":"question","text":"How many fingers am I holding up? ✋","correct":"5","options":["3","4","5","6"],"emoji":"✋"},{"type":"reward","text":"WOW! You can count so well! I''m SO proud of you!","emoji":"🎉"}]'),

('Rainbow Colors!', 'colors', 2, 6, 'easy', 'free', '🌈',
 '[{"type":"intro","text":"Colors make the world so beautiful! Let''s learn them!","emoji":"🌈"},{"type":"question","text":"What color is the sky?","correct":"Blue","options":["Red","Blue","Green","Yellow"],"emoji":"☁️"},{"type":"question","text":"What color is grass?","correct":"Green","options":["Blue","Purple","Green","Orange"],"emoji":"🌿"},{"type":"question","text":"What color is the sun?","correct":"Yellow","options":["Pink","White","Yellow","Red"],"emoji":"☀️"},{"type":"reward","text":"You know all your colors! You''re absolutely brilliant!","emoji":"🌈"}]'),

('The ABCs!', 'letters', 3, 7, 'easy', 'starter', '📝',
 '[{"type":"intro","text":"Letters are magical! They make words! Let''s learn some!","emoji":"📝"},{"type":"question","text":"Which letter comes first in the alphabet?","correct":"A","options":["B","A","C","D"],"emoji":"🔤"},{"type":"question","text":"What letter does APPLE start with?","correct":"A","options":["B","A","P","E"],"emoji":"🍎"},{"type":"question","text":"What letter does BALL start with?","correct":"B","options":["A","D","B","C"],"emoji":"⚽"},{"type":"question","text":"What letter does CAT start with?","correct":"C","options":["K","S","C","G"],"emoji":"🐱"},{"type":"reward","text":"Reading superstar in the making! You are AMAZING!","emoji":"📚"}]'),

('Shapes All Around!', 'shapes', 3, 7, 'easy', 'starter', '🔷',
 '[{"type":"intro","text":"Shapes are everywhere! Let''s find them together!","emoji":"🔷"},{"type":"question","text":"A pizza slice looks like a...","correct":"Triangle","options":["Circle","Square","Triangle","Rectangle"],"emoji":"🍕"},{"type":"question","text":"A window is usually a...","correct":"Square","options":["Triangle","Square","Circle","Star"],"emoji":"🏠"},{"type":"question","text":"A wheel is a...","correct":"Circle","options":["Square","Triangle","Circle","Diamond"],"emoji":"🎡"},{"type":"reward","text":"Shape master! You see shapes everywhere now! Incredible!","emoji":"🔷"}]'),

('Music Notes!', 'music', 4, 10, 'medium', 'starter', '🎵',
 '[{"type":"intro","text":"Music has special building blocks called notes! Let''s explore!","emoji":"🎵"},{"type":"question","text":"How many beats in a typical bar of music?","correct":"4","options":["2","3","4","8"],"emoji":"🥁"},{"type":"question","text":"Which instrument has black and white keys?","correct":"Piano","options":["Guitar","Drums","Piano","Trumpet"],"emoji":"🎹"},{"type":"question","text":"What is the name for a low, deep sound?","correct":"Bass","options":["Treble","Bass","Alto","Soprano"],"emoji":"🔊"},{"type":"reward","text":"You''re a music genius! Keep making beautiful music!","emoji":"🎼"}]'),

('Advanced Math!', 'numbers', 6, 12, 'medium', 'premium', '🔢',
 '[{"type":"intro","text":"Ready for some fun math challenges? Let''s go!","emoji":"🧮"},{"type":"question","text":"What is 5 + 7?","correct":"12","options":["10","11","12","13"],"emoji":"➕"},{"type":"question","text":"What is 15 - 8?","correct":"7","options":["5","6","7","8"],"emoji":"➖"},{"type":"question","text":"What is 3 × 4?","correct":"12","options":["7","10","12","14"],"emoji":"✖️"},{"type":"question","text":"What is 20 ÷ 4?","correct":"5","options":["4","5","6","8"],"emoji":"➗"},{"type":"reward","text":"Math wizard! You solved every single one! INCREDIBLE!","emoji":"🏆"}]');
