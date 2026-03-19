// ============================================================
// Intent API Route — src/routes/intent.ts
// ============================================================
// Single unified endpoint for all Intent Layer calls.
// ALL new modules communicate exclusively through this route.
// No Action Layer logic here — pure intent dispatch.
//
// POST /api/intent
// {
//   "intent": "PERSIST_SONG",
//   "childId": 1,
//   "sessionId": 42,
//   "userId": "user_abc",
//   "data": { ... }
// }
// ============================================================

import { Hono } from 'hono';
import { router, IntentRouter } from '../lib/intent-router';
import { FEATURE_REGISTRY } from '../lib/modules/free-features';
import { PLANS } from '../lib/modules/billing-keys';
import type { Bindings } from '../types';

const intentRoute = new Hono<{ Bindings: Bindings }>();

// ── POST /api/intent — dispatch any intent ────────────────────
intentRoute.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      intent: string;
      childId?: number;
      sessionId?: number;
      userId?: string;
      data: Record<string, unknown>;
    }>();

    if (!body.intent) {
      return c.json({ success: false, error: 'intent field required' }, 400);
    }

    const payload = IntentRouter.build(
      body.intent as any,
      body.data ?? {},
      {
        childId: body.childId,
        sessionId: body.sessionId,
        userId: body.userId,
        metadata: { source: 'api', timestamp: Date.now() },
      }
    );

    const result = await router.dispatch(payload, c.env, c.env.DB);
    return c.json(result, result.success ? 200 : 400);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── GET /api/intent/features — list all features ─────────────
intentRoute.get('/features', async (c) => {
  return c.json({ success: true, data: { features: Object.values(FEATURE_REGISTRY) } });
});

// ── GET /api/intent/plans — list all plans ────────────────────
intentRoute.get('/plans', async (c) => {
  return c.json({ success: true, data: { plans: Object.values(PLANS) } });
});

// ── GET /api/intent/status — full system status ───────────────
intentRoute.get('/status', async (c) => {
  const env = c.env as any;
  return c.json({
    success: true,
    data: {
      modules: ['SongLibrary', 'TTSManager', 'GazeTracker', 'BehaviorLoop', 'FreeFeatures', 'BillingKeys'],
      server_capabilities: {
        openai: !!(env.OPENAI_API_KEY),
        replicate: !!(env.REPLICATE_API_KEY),
        elevenlabs: !!(env.ELEVENLABS_API_KEY),
        suno: !!(env.SUNO_API_KEY),
        stripe: !!(env.STRIPE_SECRET_KEY),
      },
      stripe_publishable_key: env.STRIPE_PUBLISHABLE_KEY ?? null,
      architecture: 'Intent Layer → Module → Action Layer',
      version: '2.0.0-modular',
    }
  });
});

// ── POST /api/intent/batch — dispatch multiple intents ────────
intentRoute.post('/batch', async (c) => {
  try {
    const body = await c.req.json<{
      userId?: string;
      intents: Array<{
        intent: string;
        childId?: number;
        sessionId?: number;
        data: Record<string, unknown>;
      }>;
    }>();

    if (!Array.isArray(body.intents) || body.intents.length === 0) {
      return c.json({ success: false, error: 'intents array required' }, 400);
    }

    // Process intents sequentially (order matters for some flows)
    const results = [];
    for (const item of body.intents.slice(0, 10)) {   // max 10 per batch
      const payload = IntentRouter.build(
        item.intent as any,
        item.data ?? {},
        { childId: item.childId, sessionId: item.sessionId, userId: body.userId }
      );
      const result = await router.dispatch(payload, c.env, c.env.DB);
      results.push(result);
    }

    return c.json({ success: true, data: { results, count: results.length } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { intentRoute };
