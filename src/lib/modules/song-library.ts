// ============================================================
// MODULE 1: Song Library — src/lib/modules/song-library.ts
// ============================================================
// Intent Layer Intents handled:
//   PERSIST_SONG  — save a generated song to the library
//   PLAY_SONG     — fetch a song record for replay (no re-gen charge)
//   GET_SONG_LIBRARY — list the full library for a child
//   REPLAY_SONG   — mark a replay event (increments play_count)
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';

export interface SongRecord {
  id: number;
  child_id: number;
  title: string;
  style: string;
  tempo: string;
  mood: string;
  audio_url: string | null;
  provider: string;
  prompt_used: string | null;
  lyrics: string | null;
  duration_seconds: number;
  engagement_score: number;
  play_count: number;
  is_favorite: boolean;
  tags: string;          // JSON array string
  created_at: string;
  last_played_at: string | null;
}

export class SongLibraryModule implements IntentModule {
  handles = ['PERSIST_SONG', 'PLAY_SONG', 'GET_SONG_LIBRARY', 'REPLAY_SONG'] as any[];

  async handle(payload: IntentPayload, _env: any, db: any): Promise<IntentResult> {
    switch (payload.intent) {

      // ── PERSIST_SONG ────────────────────────────────────────
      case 'PERSIST_SONG': {
        const d = payload.data as {
          child_id: number;
          title: string;
          style: string;
          tempo: string;
          mood: string;
          audio_url?: string;
          provider: string;
          prompt_used?: string;
          lyrics?: string;
          duration_seconds: number;
          engagement_score?: number;
          tags?: string[];
        };

        // Upsert: if same audio_url already stored, just update score
        const existing = d.audio_url
          ? await db.prepare(
              'SELECT id FROM song_library WHERE child_id = ? AND audio_url = ?'
            ).bind(d.child_id, d.audio_url).first()
          : null;

        let songId: number;

        if (existing) {
          await db.prepare(
            `UPDATE song_library SET engagement_score = MAX(engagement_score, ?),
             play_count = play_count + 1, last_played_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(d.engagement_score ?? 0, existing.id).run();
          songId = existing.id;
        } else {
          const r = await db.prepare(
            `INSERT INTO song_library
               (child_id, title, style, tempo, mood, audio_url, provider,
                prompt_used, lyrics, duration_seconds, engagement_score, tags)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            d.child_id, d.title, d.style, d.tempo, d.mood,
            d.audio_url ?? null, d.provider,
            d.prompt_used ?? null, d.lyrics ?? null,
            d.duration_seconds, d.engagement_score ?? 0,
            JSON.stringify(d.tags ?? [])
          ).run();
          songId = r.meta.last_row_id as number;
        }

        return {
          success: true,
          intent: 'PERSIST_SONG',
          data: { song_id: songId, persisted: !existing }
        };
      }

      // ── PLAY_SONG ───────────────────────────────────────────
      case 'PLAY_SONG': {
        const { song_id, child_id } = payload.data as { song_id: number; child_id: number };
        const song = await db.prepare(
          'SELECT * FROM song_library WHERE id = ? AND child_id = ?'
        ).bind(song_id, child_id).first();

        if (!song) {
          return { success: false, intent: 'PLAY_SONG', error: 'Song not found' };
        }

        // Increment play on fetch
        await db.prepare(
          'UPDATE song_library SET play_count = play_count + 1, last_played_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(song_id).run();

        return { success: true, intent: 'PLAY_SONG', data: { song, replay: true } };
      }

      // ── GET_SONG_LIBRARY ────────────────────────────────────
      case 'GET_SONG_LIBRARY': {
        const { child_id, limit = 50, favorites_only = false } = payload.data as {
          child_id: number; limit?: number; favorites_only?: boolean;
        };

        const whereExtra = favorites_only ? ' AND is_favorite = 1' : '';
        const songs = await db.prepare(
          `SELECT * FROM song_library WHERE child_id = ?${whereExtra}
           ORDER BY engagement_score DESC, play_count DESC, created_at DESC LIMIT ?`
        ).bind(child_id, limit).all();

        const stats = await db.prepare(
          `SELECT COUNT(*) as total,
                  SUM(play_count) as total_plays,
                  AVG(engagement_score) as avg_score,
                  MAX(created_at) as last_generated
           FROM song_library WHERE child_id = ?`
        ).bind(child_id).first();

        return {
          success: true,
          intent: 'GET_SONG_LIBRARY',
          data: {
            songs: songs.results ?? [],
            stats: {
              total: stats?.total ?? 0,
              total_plays: stats?.total_plays ?? 0,
              avg_score: stats?.avg_score ?? 0,
              last_generated: stats?.last_generated ?? null,
            }
          }
        };
      }

      // ── REPLAY_SONG ─────────────────────────────────────────
      case 'REPLAY_SONG': {
        const { song_id, child_id, session_id } = payload.data as {
          song_id: number; child_id: number; session_id?: number;
        };
        const song = await db.prepare(
          'SELECT * FROM song_library WHERE id = ? AND child_id = ?'
        ).bind(song_id, child_id).first();

        if (!song) {
          return { success: false, intent: 'REPLAY_SONG', error: 'Song not found' };
        }

        await db.prepare(
          `UPDATE song_library SET
             play_count = play_count + 1,
             last_played_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(song_id).run();

        if (session_id) {
          await db.prepare(
            `INSERT INTO song_replay_log (song_id, child_id, session_id)
             VALUES (?, ?, ?)`
          ).bind(song_id, child_id, session_id).run();
        }

        return {
          success: true,
          intent: 'REPLAY_SONG',
          data: {
            song,
            cost_tokens: 0,   // replay is always free
            replay: true,
            message: 'Replaying from library — no generation charge'
          }
        };
      }

      default:
        return { success: false, intent: payload.intent as any, error: 'Unknown intent' };
    }
  }
}
