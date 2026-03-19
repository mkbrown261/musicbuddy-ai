// ============================================================
// MODULE 3: Gaze & Camera — src/lib/modules/gaze-tracker.ts
// ============================================================
// Intent Layer Intents handled:
//   TRACK_GAZE         — record a gaze event with coordinates
//   PROCESS_FACE_EVENT — process a face detection event (smile, look-away, etc.)
//   GET_GAZE_SUMMARY   — return engagement summary from gaze data
//
// ARCHITECTURAL RULE: no Action Layer changes.
// Gaze data is never transmitted to external services — stored only in D1.
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';

export interface GazeEvent {
  child_id: number;
  session_id?: number;
  gaze_x: number;          // 0–1 normalized screen X
  gaze_y: number;          // 0–1 normalized screen Y
  confidence: number;      // 0–1 detection confidence
  on_screen: boolean;      // is child looking at screen?
  dwell_ms: number;        // how long at this position
}

export interface FaceEvent {
  child_id: number;
  session_id?: number;
  snippet_id?: number;
  event_type: 'smile' | 'laughter' | 'neutral' | 'attention_loss' | 'fixation' | 'distracted';
  intensity: number;       // 0–1
  duration_ms?: number;
}

// Heatmap cell size (10x10 grid)
const HEATMAP_COLS = 10;
const HEATMAP_ROWS = 10;

function gazeToCell(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.min(HEATMAP_COLS - 1, Math.floor(x * HEATMAP_COLS)),
    row: Math.min(HEATMAP_ROWS - 1, Math.floor(y * HEATMAP_ROWS)),
  };
}

export class GazeTrackerModule implements IntentModule {
  handles = ['TRACK_GAZE', 'PROCESS_FACE_EVENT', 'GET_GAZE_SUMMARY'] as any[];

  async handle(payload: IntentPayload, _env: any, db: any): Promise<IntentResult> {
    switch (payload.intent) {

      // ── TRACK_GAZE ──────────────────────────────────────────
      case 'TRACK_GAZE': {
        const d = payload.data as GazeEvent;
        const cell = gazeToCell(d.gaze_x, d.gaze_y);

        await db.prepare(
          `INSERT INTO gaze_events
             (child_id, session_id, gaze_x, gaze_y, confidence,
              on_screen, dwell_ms, heatmap_col, heatmap_row)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          d.child_id, d.session_id ?? null,
          d.gaze_x, d.gaze_y, d.confidence,
          d.on_screen ? 1 : 0, d.dwell_ms,
          cell.col, cell.row
        ).run();

        // Derive engagement event if meaningful fixation
        if (d.on_screen && d.dwell_ms > 800 && d.confidence > 0.6) {
          await db.prepare(
            `INSERT INTO engagement_events
               (child_id, session_id, event_type, intensity, duration_ms, gaze_x, gaze_y)
             VALUES (?, ?, 'fixation', ?, ?, ?, ?)`
          ).bind(d.child_id, d.session_id ?? null, d.confidence, d.dwell_ms, d.gaze_x, d.gaze_y).run();
        }

        return { success: true, intent: 'TRACK_GAZE', data: { recorded: true, cell } };
      }

      // ── PROCESS_FACE_EVENT ──────────────────────────────────
      case 'PROCESS_FACE_EVENT': {
        const d = payload.data as FaceEvent;

        // Always write to engagement_events (existing table)
        await db.prepare(
          `INSERT INTO engagement_events
             (child_id, session_id, event_type, intensity, duration_ms, snippet_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          d.child_id, d.session_id ?? null, d.event_type,
          d.intensity, d.duration_ms ?? 0, d.snippet_id ?? null
        ).run();

        // Derive engagement score delta
        const delta = d.event_type === 'smile' ? 0.15
                    : d.event_type === 'laughter' ? 0.25
                    : d.event_type === 'fixation' ? 0.10
                    : d.event_type === 'attention_loss' ? -0.20
                    : d.event_type === 'distracted' ? -0.10
                    : 0;

        return {
          success: true, intent: 'PROCESS_FACE_EVENT',
          data: { recorded: true, event_type: d.event_type, score_delta: delta }
        };
      }

      // ── GET_GAZE_SUMMARY ────────────────────────────────────
      case 'GET_GAZE_SUMMARY': {
        const { child_id, session_id } = payload.data as { child_id: number; session_id?: number };

        const whereClause = session_id
          ? 'WHERE child_id = ? AND session_id = ?'
          : 'WHERE child_id = ?';
        const binds = session_id ? [child_id, session_id] : [child_id];

        const totalGaze = await db.prepare(
          `SELECT COUNT(*) as cnt, AVG(dwell_ms) as avg_dwell,
                  SUM(CASE WHEN on_screen = 1 THEN 1 ELSE 0 END) as on_screen_count
           FROM gaze_events ${whereClause}`
        ).bind(...binds).first();

        const heatmap = await db.prepare(
          `SELECT heatmap_col, heatmap_row, COUNT(*) as weight
           FROM gaze_events ${whereClause} AND on_screen = 1
           GROUP BY heatmap_col, heatmap_row ORDER BY weight DESC LIMIT 20`
        ).bind(...binds).all();

        const engagement = await db.prepare(
          `SELECT event_type, COUNT(*) as cnt, AVG(intensity) as avg_intensity
           FROM engagement_events ${whereClause}
           GROUP BY event_type`
        ).bind(...binds).all();

        const total = totalGaze?.cnt ?? 0;
        const onScreen = totalGaze?.on_screen_count ?? 0;
        const attentionRate = total > 0 ? onScreen / total : 0;

        const evMap: Record<string, { cnt: number; avg_intensity: number }> = {};
        for (const e of (engagement.results ?? [])) {
          evMap[(e as any).event_type] = { cnt: (e as any).cnt, avg_intensity: (e as any).avg_intensity };
        }

        return {
          success: true, intent: 'GET_GAZE_SUMMARY',
          data: {
            total_gaze_events: total,
            attention_rate: parseFloat(attentionRate.toFixed(2)),
            avg_dwell_ms: totalGaze?.avg_dwell ?? 0,
            heatmap: heatmap.results ?? [],
            engagement_breakdown: evMap,
            score: parseFloat(Math.min(1, attentionRate * 0.4 +
              ((evMap.smile?.cnt ?? 0) * 0.15 +
               (evMap.laughter?.cnt ?? 0) * 0.20 +
               (evMap.fixation?.cnt ?? 0) * 0.05) / Math.max(1, total) * 0.6
            ).toFixed(2)),
          }
        };
      }

      default:
        return { success: false, intent: payload.intent as any, error: 'Unknown intent' };
    }
  }
}
