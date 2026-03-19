// ============================================================
// API Routes - Engagement Events
// Logic Layer: receives engagement cues from UI (camera/vision)
// and triggers interaction decisions
// ============================================================

import { Hono } from 'hono';
import { DB } from '../lib/db';
import { EngagementEngine, getConversationText } from '../lib/engine';
import type { Bindings, EngagementCue } from '../types';

const engagement = new Hono<{ Bindings: Bindings }>();

// In-memory engine instances per session (edge context - stateless, so we
// use session state from DB + reconstruct on each request for edge compat)
// For production, use Durable Objects for stateful sessions.
// Here we use stateless reconstruction from DB.

// POST /api/engagement/event - Log an engagement event
engagement.post('/event', async (c) => {
  try {
    const body = await c.req.json<EngagementCue>();
    const { child_id, session_id, event_type, intensity, duration_ms, gaze_x, gaze_y, snippet_id } = body;

    if (!child_id || !session_id || !event_type) {
      return c.json({ success: false, error: 'child_id, session_id, event_type required' }, 400);
    }

    const db = new DB(c.env.DB);

    // Log the event
    const eventId = await db.logEvent({
      session_id, child_id, event_type,
      intensity: intensity ?? 0.5,
      duration_ms: duration_ms ?? 0,
      snippet_id: snippet_id ?? undefined,
      gaze_x: gaze_x ?? undefined,
      gaze_y: gaze_y ?? undefined,
    });

    // Update snippet engagement score if playing during this event
    if (snippet_id && (event_type === 'smile' || event_type === 'laughter' || event_type === 'fixation')) {
      const currentSnippets = await db.getSnippetsByChild(child_id, 10);
      const current = currentSnippets.find(s => s.id === snippet_id);
      if (current) {
        const boost = event_type === 'laughter' ? 0.15 : event_type === 'smile' ? 0.1 : 0.05;
        const newScore = Math.min(1.0, (current.engagement_score ?? 0) + boost);
        await db.updateSnippetEngagement(snippet_id, newScore);
      }
    }

    return c.json({ success: true, data: { event_id: eventId } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/engagement/decide - Get next interaction decision
engagement.post('/decide', async (c) => {
  try {
    const body = await c.req.json<{
      child_id: number;
      session_id: number;
      last_interaction_type?: string;
      last_interaction_time?: number;
      consecutive_songs?: number;
    }>();

    const { child_id, session_id } = body;
    if (!child_id || !session_id) {
      return c.json({ success: false, error: 'child_id and session_id required' }, 400);
    }

    const db = new DB(c.env.DB);
    const child = await db.getProfile(child_id);
    if (!child) return c.json({ success: false, error: 'Child not found' }, 404);

    const screenTime = await db.getScreenTimeToday(child_id);
    const events = await db.getSessionEvents(session_id);

    // Reconstruct engine state from DB events
    const engine = new EngagementEngine();
    events.slice(-20).forEach(e => engine.addEvent(e));

    if (body.last_interaction_type === 'talk' || body.last_interaction_type === 'sing') {
      engine.updateInteraction(
        body.last_interaction_type as 'talk' | 'sing',
        undefined
      );
      // Manually set last interaction time for edge stateless mode
    }

    const decision = engine.decide(child.name, child.age, screenTime, child.screen_time_limit);

    return c.json({ success: true, data: decision });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /api/engagement/summary/:childId - Dashboard summary
engagement.get('/summary/:childId', async (c) => {
  try {
    const childId = parseInt(c.req.param('childId'));
    const sessionId = c.req.query('session_id') ? parseInt(c.req.query('session_id')!) : undefined;

    const db = new DB(c.env.DB);
    const summary = await db.getEngagementSummary(childId, sessionId);
    const adaptive = await db.getAdaptiveProfile(childId);
    const screenTime = await db.getScreenTimeToday(childId);
    const topSnippets = await db.getTopSnippets(childId, 3);

    return c.json({
      success: true,
      data: {
        engagement_summary: summary,
        adaptive_profile: adaptive,
        screen_time_minutes: screenTime,
        top_snippets: topSnippets
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/engagement/background-detect - Background listening detection
engagement.post('/background-detect', async (c) => {
  try {
    const body = await c.req.json<{
      child_id: number;
      session_id?: number;
      detected_song?: string;
      detected_artist?: string;
      detected_genre?: string;
      confidence?: number;
    }>();

    const db = new DB(c.env.DB);
    const detectionId = await db.logBackgroundDetection(body);

    return c.json({
      success: true,
      data: { detection_id: detectionId, message: 'Background detection logged' }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { engagement };
