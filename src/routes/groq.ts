// ============================================================
// API Route — Groq Behavior Engine
// src/routes/groq.ts
// ============================================================
// REST API over the Groq cognitive layer.
// All logic is via Intent Layer → GroqBehaviorModule.
//
// Endpoints:
//   POST /api/groq/behavior        — generate next behavior
//   POST /api/groq/engage          — log engagement event
//   POST /api/groq/analyze         — analyze engagement metrics
//   GET  /api/groq/history         — recent behaviors for session
//   GET  /api/groq/loop-state      — interaction loop state
//   POST /api/groq/loop-state      — update loop state
//   GET  /api/groq/health          — system readiness
//
// Full interaction flow (called by frontend behavior engine):
//   1. POST /api/groq/behavior with { context, engagement }
//   2. Frontend receives BehaviorResponse { mode, tone, text, followUp }
//   3. Frontend posts { intent: REQUEST_TTS, data: { text, emotion: tone } }
//   4. Audio plays, cache stores result
//   5. Repeat on next trigger
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { generateBehavior, getLoopState, updateLoopState } from '../lib/groq/engine'
import type { BehaviorRequest, ContextState, EngagementMetrics, BehaviorMode } from '../lib/groq/types'

const app = new Hono<{ Bindings: Bindings }>()

// ── Helper: resolve userId ────────────────────────────────────
function uid(c: any, body?: any): string {
  return body?.userId ?? 'demo'
}

// ════════════════════════════════════════════════════════════
// POST /api/groq/behavior
// Generate next behavior decision from Groq
//
// Body: {
//   userId?:    string
//   childId?:   number
//   sessionId?: number
//   context:    ContextState
//   engagement: EngagementMetrics
//   forceMode?: BehaviorMode
//   skipCache?: boolean
// }
// ════════════════════════════════════════════════════════════
app.post('/behavior', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ success: false, error: 'Database not available' }, 503)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { context, engagement, forceMode, skipCache } = body

  if (!context || !engagement) {
    return c.json({ success: false, error: 'context and engagement are required' }, 400)
  }

  const req: BehaviorRequest = {
    userId:    uid(c, body),
    childId:   body.childId   ? Number(body.childId)   : undefined,
    sessionId: body.sessionId ? Number(body.sessionId) : undefined,
    context:   context as ContextState,
    engagement: engagement as EngagementMetrics,
    forceMode: forceMode as BehaviorMode | undefined,
    skipCache:  skipCache ?? false,
  }

  try {
    const behavior = await generateBehavior(req, c.env, db)
    return c.json({ success: true, ...behavior })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ════════════════════════════════════════════════════════════
// POST /api/groq/engage
// Log a raw engagement event to the stream
//
// Body: {
//   sessionId:  number
//   childId:    number
//   eventType:  string   (face_detected|smile|laugh|look_away|voice_detected|clap)
//   value?:     number
//   confidence?: number
//   metaJson?:  string
// }
// ════════════════════════════════════════════════════════════
app.post('/engage', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ success: false, error: 'Database not available' }, 503)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { sessionId, childId, eventType, value, confidence, metaJson } = body

  if (!sessionId || !childId || !eventType) {
    return c.json({ success: false, error: 'sessionId, childId and eventType are required' }, 400)
  }

  try {
    await db.prepare(
      `INSERT INTO engagement_stream (session_id, child_id, event_type, confidence, value, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(Number(sessionId), Number(childId), eventType, confidence ?? 0.8, value ?? null, metaJson ?? null).run()

    return c.json({ success: true, captured: true })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// ════════════════════════════════════════════════════════════
// POST /api/groq/analyze
// Analyze engagement metrics and get recommendations
// ════════════════════════════════════════════════════════════
app.post('/analyze', async (c) => {
  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const eng: EngagementMetrics = body.engagement
  if (!eng) return c.json({ success: false, error: 'engagement required' }, 400)

  const recs: string[] = []
  if (!eng.gazeOnScreen)         recs.push('reengage — child not looking')
  if (eng.attentionLoss > 3)     recs.push('change mode — attention drifting')
  if (eng.smileCount > 5)        recs.push('celebrate — high positive engagement')
  if (eng.voiceDetected)         recs.push('encourage — child is being vocal')
  if ((body.consecutiveSongs ?? 0) >= 3) recs.push('talk break needed')

  const mode: BehaviorMode =
    !eng.gazeOnScreen         ? 'reengage'  :
    eng.attentionLoss > 3     ? 'reengage'  :
    eng.smileCount > 5        ? 'celebrate' :
    (body.consecutiveSongs ?? 0) >= 3 ? 'talk' :
    eng.voiceDetected         ? 'encourage' : 'talk'

  return c.json({
    success: true,
    recommendations: recs,
    suggestedMode: mode,
    engagementScore: Math.min(1, (eng.smileCount + eng.laughCount * 2) / 10),
    shouldIntervene: !eng.gazeOnScreen || eng.attentionLoss > 3,
  })
})

// ════════════════════════════════════════════════════════════
// GET /api/groq/history
// Recent behavior log for a session
// ════════════════════════════════════════════════════════════
app.get('/history', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  const sessionId = c.req.query('sessionId')
  const limit = parseInt(c.req.query('limit') ?? '10')

  const stmt = sessionId
    ? db.prepare(`SELECT mode, tone, text_output, follow_up, trigger_type, cache_hit, latency_ms, created_at FROM groq_behavior_log WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`).bind(Number(sessionId), limit)
    : db.prepare(`SELECT mode, tone, text_output, follow_up, trigger_type, cache_hit, latency_ms, created_at FROM groq_behavior_log ORDER BY created_at DESC LIMIT ?`).bind(limit)

  const rows = await stmt.all()
  return c.json({ success: true, history: rows.results ?? [] })
})

// ════════════════════════════════════════════════════════════
// GET /api/groq/loop-state
// ════════════════════════════════════════════════════════════
app.get('/loop-state', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  const sessionId = c.req.query('sessionId')
  if (!sessionId) return c.json({ error: 'sessionId required' }, 400)

  const state = await getLoopState(db, Number(sessionId))
  return c.json({ success: true, state: state ?? { sessionId: Number(sessionId), new: true } })
})

// ════════════════════════════════════════════════════════════
// POST /api/groq/loop-state
// Update interaction loop state
// ════════════════════════════════════════════════════════════
app.post('/loop-state', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { sessionId, childId, ...updates } = body
  if (!sessionId || !childId) return c.json({ error: 'sessionId and childId required' }, 400)

  await updateLoopState(db, Number(sessionId), Number(childId), updates)
  return c.json({ success: true, updated: true })
})

// ════════════════════════════════════════════════════════════
// GET /api/groq/health
// ════════════════════════════════════════════════════════════
app.get('/health', async (c) => {
  const db = c.env.DB
  let dbAlive = false
  try { await db.prepare('SELECT 1').first(); dbAlive = true } catch {}

  return c.json({
    status:     dbAlive ? 'ok' : 'degraded',
    db:         dbAlive,
    groq:       !!(c.env.GROQ_API_KEY),
    replicate:  !!(c.env.REPLICATE_API_KEY),
    mode:       c.env.GROQ_API_KEY
      ? 'live (Groq LLaMA real-time decisions)'
      : 'fallback (deterministic rule-based behavior)',
    models: {
      cognitive: 'llama-3.1-8b-instant (Groq)',
      tts_trial: 'elevenlabs/v2-multilingual (Replicate)',
    },
    architecture: 'UserInput → CaptureEngagement → Groq → BehaviorResponse → TTS → Audio',
    timestamp: new Date().toISOString(),
  })
})

export { app as groq }
