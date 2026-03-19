// ============================================================
// API Routes - Parental Dashboard
// Combines all layers to provide parental monitoring data
// ============================================================

import { Hono } from 'hono';
import { DB } from '../lib/db';
import type { Bindings, DashboardStats } from '../types';

const dashboard = new Hono<{ Bindings: Bindings }>();

// GET /api/dashboard/:childId - Full dashboard stats
dashboard.get('/:childId', async (c) => {
  try {
    const childId = parseInt(c.req.param('childId'));
    const db = new DB(c.env.DB);

    const child = await db.getProfile(childId);
    if (!child) return c.json({ success: false, error: 'Child not found' }, 404);

    const activeSessions = await db.getActiveSessions(childId);
    const currentSession = activeSessions[0] ?? null;

    const todaySessions = await db.getSessionsToday(childId);
    const screenTime = await db.getScreenTimeToday(childId);

    const engSummary = currentSession
      ? await db.getEngagementSummary(childId, currentSession.id)
      : await db.getEngagementSummary(childId);

    const adaptive = await db.getAdaptiveProfile(childId);
    const recentSnippets = await db.getSnippetsByChild(childId, 8);
    const topSnippets = await db.getTopSnippets(childId, 3);
    const rules = await db.getParentalRules(childId);

    // Parse rules into a friendly format
    const parsedRules = rules.map(r => {
      try {
        return { type: r.rule_type, ...JSON.parse(r.rule_value) };
      } catch { return { type: r.rule_type, raw: r.rule_value }; }
    });

    // Screen time alerts
    const screenTimeLimit = parsedRules.find(r => r.type === 'screen_time');
    const maxMinutes = screenTimeLimit?.maxMinutes ?? 30;
    const alertMinutes = screenTimeLimit?.alertAt ?? maxMinutes - 5;
    const screenTimeAlert = screenTime >= alertMinutes;

    // Guidance recommendations based on engagement
    const recommendations: string[] = [];
    if (screenTime >= maxMinutes) {
      recommendations.push('Screen time limit reached. Consider ending the session.');
    } else if (screenTime >= alertMinutes) {
      recommendations.push(`${Math.round(maxMinutes - screenTime)} minutes remaining in today's limit.`);
    }
    if (engSummary.engagement_score < 0.3 && todaySessions.length > 0) {
      recommendations.push('Low engagement detected. Try switching to a different musical style.');
    }
    if (engSummary.smile_count + engSummary.laughter_count > 10) {
      recommendations.push('Excellent engagement! Child is responding very positively to music.');
    }
    if (adaptive?.avg_engagement_score && adaptive.avg_engagement_score > 0.7) {
      recommendations.push('Child shows strong music preference. Consider adding more songs to favorites.');
    }

    const stats: DashboardStats = {
      child,
      current_session: currentSession,
      today_sessions: todaySessions.length,
      total_time_today_minutes: parseFloat(screenTime.toFixed(1)),
      engagement_summary: engSummary,
      recent_snippets: recentSnippets,
      adaptive_profile: adaptive,
    };

    return c.json({
      success: true,
      data: {
        ...stats,
        top_snippets: topSnippets,
        rules: parsedRules,
        screen_time_alert: screenTimeAlert,
        recommendations,
        screen_time_limit_minutes: maxMinutes,
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/dashboard/:childId/rules - Update parental rule
dashboard.post('/:childId/rules', async (c) => {
  try {
    const childId = parseInt(c.req.param('childId'));
    const body = await c.req.json<{
      rule_type: string; rule_value: Record<string, unknown>; is_active?: boolean;
    }>();

    const db = new DB(c.env.DB);

    // Upsert rule (insert or update by type)
    await db['db' as any] ?? c.env.DB;
    await c.env.DB.prepare(
      `INSERT INTO parental_rules (child_id, rule_type, rule_value, is_active)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET rule_value = excluded.rule_value, is_active = excluded.is_active`
    ).bind(
      childId,
      body.rule_type,
      JSON.stringify(body.rule_value),
      body.is_active !== false ? 1 : 0
    ).run();

    return c.json({ success: true, message: 'Rule updated' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /api/dashboard/:childId/report - Weekly engagement report
dashboard.get('/:childId/report', async (c) => {
  try {
    const childId = parseInt(c.req.param('childId'));
    const db = new DB(c.env.DB);

    const child = await db.getProfile(childId);
    if (!child) return c.json({ success: false, error: 'Child not found' }, 404);

    const adaptive = await db.getAdaptiveProfile(childId);
    const topSnippets = await db.getTopSnippets(childId, 5);
    const engSummary = await db.getEngagementSummary(childId);

    // Favorite styles from adaptive
    let favoriteStyles: Array<{ style: string; score: number }> = [];
    if (adaptive?.favorite_styles) {
      try {
        const styles = JSON.parse(adaptive.favorite_styles) as Record<string, number>;
        favoriteStyles = Object.entries(styles)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([style, score]) => ({ style, score: parseFloat(score.toFixed(2)) }));
      } catch {}
    }

    return c.json({
      success: true,
      data: {
        child_name: child.name,
        child_age: child.age,
        total_sessions: adaptive?.total_sessions ?? 0,
        total_songs_played: adaptive?.total_songs_played ?? 0,
        avg_engagement_score: adaptive?.avg_engagement_score ?? 0,
        top_engagement: engSummary,
        favorite_styles: favoriteStyles,
        most_loved_songs: topSnippets.map(s => ({
          title: s.source_song ?? 'AI Generated',
          style: s.style,
          play_count: s.play_count,
          engagement_score: s.engagement_score
        })),
        recommendations: [
          favoriteStyles[0]
            ? `${child.name} loves ${favoriteStyles[0].style} music most!`
            : 'Keep exploring different music styles.',
          engSummary.engagement_score > 0.6
            ? 'Great engagement! Music sessions are very beneficial.'
            : 'Try shorter sessions with more variety.',
        ]
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { dashboard };
