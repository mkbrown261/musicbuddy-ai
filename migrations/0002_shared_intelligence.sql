-- ============================================================
-- Migration 0002: Multi-Child Adaptive Intelligence
-- Shared Intelligence Model — anonymized cross-child learning
-- ============================================================

-- Shared Intelligence Model (anonymized, per age group)
-- Never stores child_id, name, or any PII
CREATE TABLE IF NOT EXISTS shared_intelligence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  age_group TEXT NOT NULL,           -- "0-2", "3-5", "6-8", "9-12"
  top_styles TEXT DEFAULT '{}',      -- JSON: { style: score } aggregated
  top_tempos TEXT DEFAULT '{}',      -- JSON: { tempo: score }
  top_songs TEXT DEFAULT '[]',       -- JSON: [{ title, score, playCount }] anonymized
  effective_strategies TEXT DEFAULT '{}', -- JSON: { strategyKey: successRate }
  engagement_patterns TEXT DEFAULT '{}',  -- JSON: { trigger: avgScore }
  total_sessions_aggregated INTEGER DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(age_group)
);

-- Trending Songs — aggregate popularity across all children (no PII)
CREATE TABLE IF NOT EXISTS trending_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  style TEXT NOT NULL,
  tempo TEXT NOT NULL,
  age_group TEXT NOT NULL,
  play_count INTEGER DEFAULT 0,
  avg_engagement REAL DEFAULT 0.0,
  trend_score REAL DEFAULT 0.0,      -- computed: recency × engagement × plays
  last_played DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Family Groups (optional: link profiles into a household)
CREATE TABLE IF NOT EXISTS family_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'My Family',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  child_id INTEGER NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE,
  UNIQUE(child_id)  -- one family per child
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_age_group ON shared_intelligence(age_group);
CREATE INDEX IF NOT EXISTS idx_trending_age ON trending_songs(age_group);
CREATE INDEX IF NOT EXISTS idx_trending_score ON trending_songs(trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
