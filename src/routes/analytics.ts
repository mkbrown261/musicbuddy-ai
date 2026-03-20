// ============================================================
// Analytics Route — Full Tracking System
// Intent Layer: TrackEvent, GetAnalytics, GetChildAnalytics
// ============================================================

import { Hono } from 'hono';
import type { Bindings } from '../types';

const analytics = new Hono<{ Bindings: Bindings }>();

// ── Helper: resolve user from token ──────────────────────────
async function resolveUser(c: any) {
  const db  = c.env.DB;
  const tok = (c.req.header('Authorization') || '').replace('Bearer ', '').trim();
  if (!tok) return null;
  return db.prepare(
    `SELECT u.id, u.email, u.subscription_tier, u.credits
     FROM auth_sessions s JOIN auth_users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(tok).first<{ id: string; email: string; subscription_tier: string; credits: number }>();
}

// ─────────────────────────────────────────────────────────────
// POST /api/analytics/track
// Intent: TrackEvent
// Body: { event_type, value?, child_id?, session_id?, metadata? }
// ─────────────────────────────────────────────────────────────
analytics.post('/track', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const body = await c.req.json<{
    event_type: string;
    value?:     number;
    child_id?:  number;
    session_id?: number;
    metadata?:  object;
  }>();

  const { event_type, value = 1, child_id, session_id, metadata = {} } = body;
  if (!event_type) return c.json({ success: false, error: 'event_type required' }, 400);

  const db = c.env.DB;
  await db.prepare(
    `INSERT INTO analytics_events (user_id, child_id, event_type, value, metadata, session_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(user.id, child_id || null, event_type, value, JSON.stringify(metadata), session_id || null).run();

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// GET /api/analytics
// Intent: GetAnalytics (parent dashboard overview)
// Query: ?child_id=1&days=30
// ─────────────────────────────────────────────────────────────
analytics.get('/', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const db      = c.env.DB;
  const childId = parseInt(c.req.query('child_id') || '0', 10) || null;
  const days    = Math.min(parseInt(c.req.query('days') || '30', 10), 90);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Build base condition
  let userCond = 'user_id = ?';
  let baseParams: any[] = [user.id, since];

  // ── Event summary ─────────────────────────────────────────
  let evtQuery = `
    SELECT event_type, COUNT(*) as count, SUM(value) as total_value
    FROM analytics_events
    WHERE ${userCond} AND created_at >= ?`;
  if (childId) { evtQuery += ' AND child_id = ?'; baseParams.push(childId); }
  evtQuery += ' GROUP BY event_type ORDER BY count DESC';

  const evtRows = await db.prepare(evtQuery).bind(...baseParams).all();
  const eventSummary: Record<string, { count: number; total_value: number }> = {};
  for (const r of (evtRows.results || [])) {
    const row = r as any;
    eventSummary[row.event_type] = { count: row.count, total_value: row.total_value };
  }

  // ── Lesson stats ──────────────────────────────────────────
  let lessonParams: any[] = [user.id];
  let lessonCond = 'lp.user_id = ?';
  if (childId) { lessonCond += ' AND lp.child_id = ?'; lessonParams.push(childId); }

  const lessonStats = await db.prepare(
    `SELECT COUNT(*) as total_started,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as total_completed,
            AVG(CASE WHEN status = 'completed' THEN score ELSE NULL END) as avg_score,
            SUM(correct_count) as total_correct,
            SUM(incorrect_count) as total_incorrect
     FROM lesson_progress lp WHERE ${lessonCond}`
  ).bind(...lessonParams).first<any>();

  // ── Credit usage summary ──────────────────────────────────
  const creditStats = await db.prepare(
    `SELECT SUM(credits) as total_used, COUNT(*) as total_actions
     FROM credit_usage_log WHERE user_id = ? AND created_at >= ?`
  ).bind(user.id, since).first<any>();

  // ── Daily activity (last 7 days) ──────────────────────────
  let dailyParams: any[] = [user.id, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()];
  let dailyCond = 'user_id = ?';
  if (childId) { dailyCond += ' AND child_id = ?'; dailyParams.splice(1, 0, childId); dailyParams[0] = user.id; }

  const dailyActivity = await db.prepare(
    `SELECT date(created_at) as day, COUNT(*) as events, SUM(value) as total_value
     FROM analytics_events WHERE ${dailyCond} AND created_at >= ?
     GROUP BY date(created_at) ORDER BY day DESC LIMIT 7`
  ).bind(...dailyParams).all();

  // ── Top lessons ───────────────────────────────────────────
  let topLessonParams: any[] = [user.id];
  let topLessonCond = 'lp.user_id = ?';
  if (childId) { topLessonCond += ' AND lp.child_id = ?'; topLessonParams.push(childId); }

  const topLessons = await db.prepare(
    `SELECT l.title, l.topic, l.thumbnail_emoji,
            COUNT(*) as attempts, MAX(lp.score) as best_score,
            SUM(CASE WHEN lp.status='completed' THEN 1 ELSE 0 END) as completions
     FROM lesson_progress lp JOIN lessons l ON lp.lesson_id = l.id
     WHERE ${topLessonCond}
     GROUP BY lp.lesson_id ORDER BY completions DESC, best_score DESC LIMIT 5`
  ).bind(...topLessonParams).all();

  // ── Recent transactions ───────────────────────────────────
  const recentTxns = await db.prepare(
    `SELECT type, credits_delta, description, created_at
     FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`
  ).bind(user.id).all();

  return c.json({
    success: true,
    data: {
      period_days:     days,
      event_summary:   eventSummary,
      lesson_stats:    lessonStats || {},
      credit_stats:    creditStats || {},
      daily_activity:  dailyActivity.results || [],
      top_lessons:     topLessons.results || [],
      recent_transactions: recentTxns.results || [],
      // Computed highlights
      engagement_score: computeEngagementScore(eventSummary),
      accuracy_rate:    lessonStats?.total_correct && lessonStats?.total_incorrect
        ? Math.round(lessonStats.total_correct / (lessonStats.total_correct + lessonStats.total_incorrect) * 100)
        : null,
    }
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/children
// Summary per-child (parent view)
// ─────────────────────────────────────────────────────────────
analytics.get('/children', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const db = c.env.DB;

  // Get all children for user
  const children = await db.prepare(
    `SELECT id, name, age, avatar FROM child_profiles
     WHERE id IN (
       SELECT DISTINCT child_id FROM lesson_progress WHERE user_id = ?
       UNION
       SELECT DISTINCT child_id FROM analytics_events WHERE user_id = ? AND child_id IS NOT NULL
     )`
  ).bind(user.id, user.id).all();

  const enriched = await Promise.all(
    (children.results || []).map(async (child: any) => {
      const stats = await db.prepare(
        `SELECT COUNT(*) as lessons_started,
                SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as lessons_completed,
                AVG(CASE WHEN status='completed' THEN score ELSE NULL END) as avg_score
         FROM lesson_progress WHERE child_id = ? AND user_id = ?`
      ).bind(child.id, user.id).first<any>();

      const recent = await db.prepare(
        `SELECT event_type, created_at FROM analytics_events
         WHERE child_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`
      ).bind(child.id, user.id).first<any>();

      return { ...child, stats: stats || {}, last_activity: recent?.created_at || null };
    })
  );

  return c.json({ success: true, data: { children: enriched } });
});

// ── Compute engagement score (0-100) ─────────────────────────
function computeEngagementScore(events: Record<string, { count: number }>) {
  const weights: Record<string, number> = {
    lesson_completed: 10, lesson_started: 3, correct_answer: 2,
    song_played: 1, game_started: 2, game_completed: 5, tts_used: 1,
  };
  let score = 0;
  for (const [event, w] of Object.entries(weights)) {
    score += (events[event]?.count || 0) * w;
  }
  return Math.min(100, score);
}

export { analytics };
