// ============================================================
// API Routes - Sessions (start/stop/manage play sessions)
// Bridges UI Layer controls to Logic + Database Layers
// ============================================================

import { Hono } from 'hono';
import { DB } from '../lib/db';
import type { Bindings } from '../types';

const sessions = new Hono<{ Bindings: Bindings }>();

// POST /api/sessions/start
sessions.post('/start', async (c) => {
  try {
    const body = await c.req.json<{ child_id: number; mode?: string }>();
    if (!body.child_id) return c.json({ success: false, error: 'child_id required' }, 400);

    const db = new DB(c.env.DB);

    // Verify child exists
    const child = await db.getProfile(body.child_id);
    if (!child) return c.json({ success: false, error: 'Child profile not found' }, 404);

    // Close any existing open sessions
    const activeSessions = await db.getActiveSessions(body.child_id);
    for (const s of activeSessions) {
      await db.endSession(s.id);
    }

    const sessionId = await db.startSession(body.child_id, body.mode ?? 'auto');

    // Log greeting interaction
    await db.logInteraction({
      session_id: sessionId, child_id: body.child_id,
      interaction_type: 'greeting',
      content: `Session started for ${child.name}`,
      trigger: 'session_start'
    });

    const session = await db.getSession(sessionId);
    return c.json({ success: true, data: { session, child } }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/sessions/:id/stop
sessions.post('/:id/stop', async (c) => {
  try {
    const sessionId = parseInt(c.req.param('id'));
    const db = new DB(c.env.DB);

    const session = await db.getSession(sessionId);
    if (!session) return c.json({ success: false, error: 'Session not found' }, 404);

    await db.endSession(sessionId);
    const engSummary = await db.getEngagementSummary(session.child_id, sessionId);

    // Update adaptive profile
    const adaptive = await db.getAdaptiveProfile(session.child_id);
    const { computeAdaptiveUpdate } = await import('../lib/engine');
    const snippets = await db.getSnippetsByChild(session.child_id, 5);
    const avgScore = snippets.length
      ? snippets.reduce((s, sn) => s + sn.engagement_score, 0) / snippets.length
      : 0;

    const child = await db.getProfile(session.child_id);
    const update = computeAdaptiveUpdate(
      adaptive, child?.preferred_style ?? 'playful', 'medium', avgScore
    );
    await db.upsertAdaptiveProfile(session.child_id, update);

    const endedSession = await db.getSession(sessionId);
    return c.json({
      success: true,
      data: { session: endedSession, engagement_summary: engSummary }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /api/sessions/:id - Get session details
sessions.get('/:id', async (c) => {
  try {
    const sessionId = parseInt(c.req.param('id'));
    const db = new DB(c.env.DB);
    const session = await db.getSession(sessionId);
    if (!session) return c.json({ success: false, error: 'Session not found' }, 404);

    const events = await db.getSessionEvents(sessionId);
    const engSummary = await db.getEngagementSummary(session.child_id, sessionId);
    const screenTime = await db.getScreenTimeToday(session.child_id);

    return c.json({
      success: true,
      data: { session, events, engagement_summary: engSummary, screen_time_minutes: screenTime }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /api/sessions/child/:childId - All sessions for a child
sessions.get('/child/:childId', async (c) => {
  try {
    const childId = parseInt(c.req.param('childId'));
    const db = new DB(c.env.DB);
    const today = await db.getSessionsToday(childId);
    const screenTime = await db.getScreenTimeToday(childId);
    const rules = await db.getParentalRules(childId);
    const screenTimeLimit = rules.find(r => r.rule_type === 'screen_time');
    const limitObj = screenTimeLimit ? JSON.parse(screenTimeLimit.rule_value) : { maxMinutes: 30 };

    return c.json({
      success: true,
      data: {
        sessions: today,
        screen_time_minutes: screenTime,
        screen_time_limit: limitObj.maxMinutes,
        limit_reached: screenTime >= limitObj.maxMinutes
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { sessions };
