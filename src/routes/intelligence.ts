// ============================================================
// API Routes — Shared Intelligence + Family Mode
// Phase 3: Multi-Child Adaptive Intelligence
// ============================================================

import { Hono } from 'hono';
import { DB } from '../lib/db';
import { IntentEngine, getAgeGroup } from '../lib/intent';
import type { Bindings } from '../types';

const intelligence = new Hono<{ Bindings: Bindings }>();

// ── GET /api/intelligence/:ageGroup — fetch shared model ──────
intelligence.get('/:ageGroup', async (c) => {
  try {
    const ageGroup = c.req.param('ageGroup');
    const db = new DB(c.env.DB);
    const shared = await db.getSharedIntelligence(ageGroup);
    if (!shared) {
      return c.json({ success: true, data: null, message: 'No shared data yet for this age group' });
    }
    // Parse JSON fields before returning
    return c.json({
      success: true,
      data: {
        age_group: shared.age_group,
        top_styles: JSON.parse(shared.top_styles || '{}'),
        top_tempos: JSON.parse(shared.top_tempos || '{}'),
        effective_strategies: JSON.parse(shared.effective_strategies || '{}'),
        engagement_patterns: JSON.parse(shared.engagement_patterns || '{}'),
        total_sessions_aggregated: shared.total_sessions_aggregated,
        last_updated: shared.last_updated,
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── GET /api/intelligence/all — all age groups ────────────────
intelligence.get('/', async (c) => {
  try {
    const db = new DB(c.env.DB);
    const all = await db.getAllSharedIntelligence();
    return c.json({
      success: true,
      data: all.map(row => ({
        age_group: row.age_group,
        top_styles: JSON.parse(row.top_styles || '{}'),
        top_tempos: JSON.parse(row.top_tempos || '{}'),
        effective_strategies: JSON.parse(row.effective_strategies || '{}'),
        total_sessions_aggregated: row.total_sessions_aggregated,
        last_updated: row.last_updated,
      }))
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── POST /api/intelligence/learn — update shared model ────────
// Called after every session to feed anonymized data into shared model.
// Never accepts child_id, name, or PII.
intelligence.post('/learn', async (c) => {
  try {
    const body = await c.req.json<{
      age: number;          // used only to compute age group, never stored
      style: string;
      tempo: string;
      engagement_score: number;
      strategy_key: string;
    }>();

    const { age, style, tempo, engagement_score, strategy_key } = body;
    if (!age || !style || !tempo || engagement_score === undefined) {
      return c.json({ success: false, error: 'age, style, tempo, engagement_score required' }, 400);
    }

    const ageGroup = getAgeGroup(age);
    const db = new DB(c.env.DB);

    // Load current shared model
    const current = await db.getSharedIntelligence(ageGroup);
    const currentParsed = current ? {
      age_group: ageGroup,
      top_styles: JSON.parse(current.top_styles || '{}'),
      top_tempos: JSON.parse(current.top_tempos || '{}'),
      effective_strategies: JSON.parse(current.effective_strategies || '{}'),
      engagement_patterns: JSON.parse(current.engagement_patterns || '{}'),
      total_sessions_aggregated: current.total_sessions_aggregated,
    } : null;

    // Compute anonymized update via Intent Engine
    const update = IntentEngine.buildSharedUpdate(
      ageGroup, style, tempo, engagement_score, strategy_key, currentParsed
    );

    // Persist
    await db.upsertSharedIntelligence(ageGroup, {
      top_styles: update.top_styles!,
      top_tempos: update.top_tempos!,
      effective_strategies: update.effective_strategies!,
      engagement_patterns: update.engagement_patterns!,
      total_sessions_aggregated: update.total_sessions_aggregated!,
    });

    // Also update trending songs
    await db.upsertTrendingSong(ageGroup, style, tempo, engagement_score);

    return c.json({
      success: true,
      data: { age_group: ageGroup, updated: true }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── GET /api/intelligence/trending/:ageGroup ──────────────────
intelligence.get('/trending/:ageGroup', async (c) => {
  try {
    const ageGroup = c.req.param('ageGroup');
    const db = new DB(c.env.DB);
    const trending = await db.getTrendingSongs(ageGroup, 5);
    return c.json({ success: true, data: { trending } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── POST /api/intelligence/intent — Intent Layer decision ─────
// Used when client needs a server-side decision (optional — client
// can also run the IntentEngine locally for zero-latency).
intelligence.post('/intent', async (c) => {
  try {
    const body = await c.req.json<{
      child_id: number;
      trigger?: string;
      engagement_context: {
        hasSmile: boolean;
        hasLaughter: boolean;
        hasFixation: boolean;
        hasAttentionLoss: boolean;
        avgIntensity: number;
        dominantEvent: string | null;
      };
      last_action: 'talk' | 'sing' | 'wait' | null;
      time_since_last_ms: number;
      consecutive_songs: number;
      engagement_score: number;
      screen_time_minutes: number;
    }>();

    const { child_id } = body;
    if (!child_id) return c.json({ success: false, error: 'child_id required' }, 400);

    const db = new DB(c.env.DB);
    const profile = await db.getProfile(child_id);
    if (!profile) return c.json({ success: false, error: 'Child not found' }, 404);

    const adaptive = await db.getAdaptiveProfile(child_id);
    const ageGroup = getAgeGroup(profile.age);
    const sharedRaw = await db.getSharedIntelligence(ageGroup);
    const shared = sharedRaw ? {
      age_group: ageGroup,
      top_styles: JSON.parse(sharedRaw.top_styles || '{}'),
      top_tempos: JSON.parse(sharedRaw.top_tempos || '{}'),
      effective_strategies: JSON.parse(sharedRaw.effective_strategies || '{}'),
      engagement_patterns: JSON.parse(sharedRaw.engagement_patterns || '{}'),
      total_sessions_aggregated: sharedRaw.total_sessions_aggregated,
    } : null;

    const intent = IntentEngine.decide(
      {
        profile,
        adaptive,
        recentEngagement: body.engagement_context,
        sessionActive: true,
        screenTimeMinutes: body.screen_time_minutes,
        consecutiveSongs: body.consecutive_songs,
        lastAction: body.last_action,
        timeSinceLastActionMs: body.time_since_last_ms,
        engagementScore: body.engagement_score,
      },
      shared,
      body.trigger ?? 'auto'
    );

    return c.json({ success: true, data: intent });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── Family Mode endpoints ─────────────────────────────────────

// GET /api/intelligence/family/:childId — get family + members
intelligence.get('/family/:childId', async (c) => {
  try {
    const childId = parseInt(c.req.param('childId'));
    const db = new DB(c.env.DB);
    const family = await db.getFamilyByChild(childId);
    if (!family) return c.json({ success: true, data: null });
    const members = await db.getFamilyMembers(family.family_id);
    return c.json({ success: true, data: { ...family, members } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/intelligence/family — create family + add children
intelligence.post('/family', async (c) => {
  try {
    const body = await c.req.json<{ name: string; child_ids: number[] }>();
    const db = new DB(c.env.DB);
    const familyId = await db.createFamily(body.name || 'My Family');
    for (const cid of (body.child_ids || [])) {
      await db.addFamilyMember(familyId, cid);
    }
    const members = await db.getFamilyMembers(familyId);
    return c.json({ success: true, data: { family_id: familyId, name: body.name, members } }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { intelligence };
