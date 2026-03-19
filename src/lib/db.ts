// ============================================================
// Database Helper Library
// Logic Layer - DB access utilities for all routes
// ============================================================

import type { Bindings, ChildProfile, FavoriteSong, MusicSnippet, 
              Session, EngagementEvent, AdaptiveProfile } from '../types';

export class DB {
  constructor(private db: D1Database) {}

  // ── Child Profiles ────────────────────────────────────────
  async getProfiles(): Promise<ChildProfile[]> {
    const r = await this.db.prepare('SELECT * FROM child_profiles ORDER BY created_at DESC').all<ChildProfile>();
    return r.results;
  }

  async getProfile(id: number): Promise<ChildProfile | null> {
    return await this.db.prepare('SELECT * FROM child_profiles WHERE id = ?').bind(id).first<ChildProfile>();
  }

  async createProfile(data: Partial<ChildProfile>): Promise<number> {
    const r = await this.db.prepare(
      `INSERT INTO child_profiles (name, age, avatar, preferred_style, engagement_mode, screen_time_limit)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      data.name, data.age, data.avatar ?? 'default',
      data.preferred_style ?? 'playful', data.engagement_mode ?? 'auto',
      data.screen_time_limit ?? 30
    ).run();
    return r.meta.last_row_id as number;
  }

  async updateProfile(id: number, data: Partial<ChildProfile>): Promise<void> {
    await this.db.prepare(
      `UPDATE child_profiles SET name=?, age=?, avatar=?, preferred_style=?, 
       engagement_mode=?, screen_time_limit=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(data.name, data.age, data.avatar, data.preferred_style,
           data.engagement_mode, data.screen_time_limit, id).run();
  }

  async deleteProfile(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM child_profiles WHERE id = ?').bind(id).run();
  }

  // ── Favorite Songs ────────────────────────────────────────
  async getFavoriteSongs(childId: number): Promise<FavoriteSong[]> {
    const r = await this.db.prepare(
      'SELECT * FROM favorite_songs WHERE child_id = ? ORDER BY priority DESC, play_count DESC'
    ).bind(childId).all<FavoriteSong>();
    return r.results;
  }

  async addFavoriteSong(childId: number, data: Partial<FavoriteSong>): Promise<number> {
    const r = await this.db.prepare(
      `INSERT INTO favorite_songs (child_id, song_title, artist, genre, bpm, mood, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(childId, data.song_title, data.artist ?? null, data.genre ?? null,
           data.bpm ?? null, data.mood ?? 'happy', data.priority ?? 5).run();
    return r.meta.last_row_id as number;
  }

  async incrementSongPlayCount(id: number): Promise<void> {
    await this.db.prepare('UPDATE favorite_songs SET play_count = play_count + 1 WHERE id = ?').bind(id).run();
  }

  // ── Sessions ──────────────────────────────────────────────
  async startSession(childId: number, mode: string = 'auto'): Promise<number> {
    const r = await this.db.prepare(
      `INSERT INTO sessions (child_id, session_mode) VALUES (?, ?)`
    ).bind(childId, mode).run();
    return r.meta.last_row_id as number;
  }

  async endSession(sessionId: number): Promise<void> {
    await this.db.prepare(
      `UPDATE sessions SET ended_at = CURRENT_TIMESTAMP,
       total_duration_seconds = CAST((JULIANDAY(CURRENT_TIMESTAMP) - JULIANDAY(started_at)) * 86400 AS INTEGER)
       WHERE id = ?`
    ).bind(sessionId).run();
  }

  async getSession(sessionId: number): Promise<Session | null> {
    return await this.db.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<Session>();
  }

  async getActiveSessions(childId: number): Promise<Session[]> {
    const r = await this.db.prepare(
      'SELECT * FROM sessions WHERE child_id = ? AND ended_at IS NULL ORDER BY started_at DESC'
    ).bind(childId).all<Session>();
    return r.results;
  }

  async getSessionsToday(childId: number): Promise<Session[]> {
    const r = await this.db.prepare(
      `SELECT * FROM sessions WHERE child_id = ? AND DATE(started_at) = DATE('now') ORDER BY started_at DESC`
    ).bind(childId).all<Session>();
    return r.results;
  }

  // ── Music Snippets ────────────────────────────────────────
  async saveSnippet(data: Partial<MusicSnippet>): Promise<number> {
    const r = await this.db.prepare(
      `INSERT INTO music_snippets (child_id, source_song, style, tempo, duration_seconds, 
       prompt_used, audio_url, generation_hash, engagement_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.child_id, data.source_song ?? null, data.style ?? 'playful',
      data.tempo ?? 'medium', data.duration_seconds ?? 25,
      data.prompt_used ?? null, data.audio_url ?? null,
      data.generation_hash ?? null, data.engagement_score ?? 0.0
    ).run();
    return r.meta.last_row_id as number;
  }

  async getSnippetsByChild(childId: number, limit: number = 20): Promise<MusicSnippet[]> {
    const r = await this.db.prepare(
      'SELECT * FROM music_snippets WHERE child_id = ? ORDER BY created_at DESC LIMIT ?'
    ).bind(childId, limit).all<MusicSnippet>();
    return r.results;
  }

  async getTopSnippets(childId: number, limit: number = 5): Promise<MusicSnippet[]> {
    const r = await this.db.prepare(
      'SELECT * FROM music_snippets WHERE child_id = ? ORDER BY engagement_score DESC, play_count DESC LIMIT ?'
    ).bind(childId, limit).all<MusicSnippet>();
    return r.results;
  }

  async updateSnippetEngagement(id: number, score: number): Promise<void> {
    await this.db.prepare(
      `UPDATE music_snippets SET engagement_score = ?, play_count = play_count + 1 WHERE id = ?`
    ).bind(score, id).run();
  }

  async snippetHashExists(hash: string): Promise<boolean> {
    const r = await this.db.prepare(
      'SELECT id FROM music_snippets WHERE generation_hash = ?'
    ).bind(hash).first();
    return r !== null;
  }

  // ── Engagement Events ─────────────────────────────────────
  async logEvent(data: Partial<EngagementEvent>): Promise<number> {
    const r = await this.db.prepare(
      `INSERT INTO engagement_events 
       (session_id, child_id, event_type, intensity, duration_ms, snippet_id, gaze_x, gaze_y)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.session_id, data.child_id, data.event_type,
      data.intensity ?? 0.5, data.duration_ms ?? 0,
      data.snippet_id ?? null, data.gaze_x ?? null, data.gaze_y ?? null
    ).run();
    return r.meta.last_row_id as number;
  }

  async getSessionEvents(sessionId: number): Promise<EngagementEvent[]> {
    const r = await this.db.prepare(
      'SELECT * FROM engagement_events WHERE session_id = ? ORDER BY timestamp DESC'
    ).bind(sessionId).all<EngagementEvent>();
    return r.results;
  }

  async getEngagementSummary(childId: number, sessionId?: number): Promise<{
    smile_count: number; laughter_count: number;
    avg_fixation_ms: number; engagement_score: number;
  }> {
    const whereClause = sessionId
      ? 'WHERE child_id = ? AND session_id = ?'
      : 'WHERE child_id = ?';
    const binds = sessionId ? [childId, sessionId] : [childId];

    const smiles = await this.db.prepare(
      `SELECT COUNT(*) as cnt FROM engagement_events ${whereClause} AND event_type='smile'`
    ).bind(...binds).first<{ cnt: number }>();

    const laughs = await this.db.prepare(
      `SELECT COUNT(*) as cnt FROM engagement_events ${whereClause} AND event_type='laughter'`
    ).bind(...binds).first<{ cnt: number }>();

    const fixation = await this.db.prepare(
      `SELECT AVG(duration_ms) as avg_ms FROM engagement_events ${whereClause} AND event_type='fixation'`
    ).bind(...binds).first<{ avg_ms: number }>();

    const totalPositive = (smiles?.cnt ?? 0) + (laughs?.cnt ?? 0);
    const total = await this.db.prepare(
      `SELECT COUNT(*) as cnt FROM engagement_events ${whereClause}`
    ).bind(...binds).first<{ cnt: number }>();

    const score = total?.cnt ? Math.min(1.0, totalPositive / Math.max(1, total.cnt)) : 0;

    return {
      smile_count: smiles?.cnt ?? 0,
      laughter_count: laughs?.cnt ?? 0,
      avg_fixation_ms: fixation?.avg_ms ?? 0,
      engagement_score: parseFloat(score.toFixed(2))
    };
  }

  // ── Interaction Log ───────────────────────────────────────
  async logInteraction(data: {
    session_id: number; child_id: number; interaction_type: string;
    content?: string; snippet_id?: number; trigger?: string; duration_ms?: number;
  }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO interaction_log (session_id, child_id, interaction_type, content, snippet_id, trigger, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.session_id, data.child_id, data.interaction_type,
      data.content ?? null, data.snippet_id ?? null,
      data.trigger ?? null, data.duration_ms ?? 0
    ).run();
  }

  // ── Adaptive Profile ──────────────────────────────────────
  async getAdaptiveProfile(childId: number): Promise<AdaptiveProfile | null> {
    return await this.db.prepare(
      'SELECT * FROM adaptive_profiles WHERE child_id = ?'
    ).bind(childId).first<AdaptiveProfile>();
  }

  async upsertAdaptiveProfile(childId: number, data: Partial<AdaptiveProfile>): Promise<void> {
    await this.db.prepare(
      `INSERT INTO adaptive_profiles (child_id, favorite_styles, favorite_tempos, 
       peak_attention_time, avg_engagement_score, total_sessions, total_songs_played)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(child_id) DO UPDATE SET
         favorite_styles = excluded.favorite_styles,
         favorite_tempos = excluded.favorite_tempos,
         avg_engagement_score = excluded.avg_engagement_score,
         total_sessions = excluded.total_sessions,
         total_songs_played = excluded.total_songs_played,
         last_updated = CURRENT_TIMESTAMP`
    ).bind(
      childId,
      data.favorite_styles ?? '[]',
      data.favorite_tempos ?? '[]',
      data.peak_attention_time ?? '[]',
      data.avg_engagement_score ?? 0.0,
      data.total_sessions ?? 0,
      data.total_songs_played ?? 0
    ).run();
  }

  // ── Background Detections ─────────────────────────────────
  async logBackgroundDetection(data: {
    child_id: number; session_id?: number; detected_song?: string;
    detected_artist?: string; detected_genre?: string; confidence?: number;
  }): Promise<number> {
    const r = await this.db.prepare(
      `INSERT INTO background_detections 
       (child_id, session_id, detected_song, detected_artist, detected_genre, confidence)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      data.child_id, data.session_id ?? null, data.detected_song ?? null,
      data.detected_artist ?? null, data.detected_genre ?? null, data.confidence ?? 0.5
    ).run();
    return r.meta.last_row_id as number;
  }

  // ── Dashboard Stats ───────────────────────────────────────
  async getScreenTimeToday(childId: number): Promise<number> {
    const sessions = await this.getSessionsToday(childId);
    return sessions.reduce((sum, s) => sum + (s.total_duration_seconds ?? 0), 0) / 60;
  }

  async getParentalRules(childId: number): Promise<Array<{ rule_type: string; rule_value: string }>> {
    const r = await this.db.prepare(
      'SELECT rule_type, rule_value FROM parental_rules WHERE child_id = ? AND is_active = 1'
    ).bind(childId).all<{ rule_type: string; rule_value: string }>();
    return r.results;
  }
}
