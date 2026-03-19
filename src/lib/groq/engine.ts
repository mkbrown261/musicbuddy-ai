// ============================================================
// Groq Behavior Engine — Core Engine
// src/lib/groq/engine.ts
// ============================================================
// Sends context + engagement metrics to Groq LLaMA and returns
// a structured BehaviorResponse — NEVER audio, only decisions.
//
// Flow:
//   1. Build cache key from context hash
//   2. Check behavior_cache (D1) — return if hit
//   3. Call Groq API with structured prompt
//   4. Parse + validate JSON response
//   5. Cache result (async)
//   6. Log to groq_behavior_log (async)
//   7. Return BehaviorResponse
//
// Fallback: if Groq key missing or call fails → deterministic
// rule-based behavior from prompt-builder.ts (always works)
// ============================================================

import type { BehaviorRequest, BehaviorResponse, BehaviorMode, BehaviorTone, FollowUpAction } from './types';
import { SYSTEM_PROMPT, buildUserPrompt, getFallbackBehavior } from './prompt-builder';

// ── Groq API constants ────────────────────────────────────────
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama3-8b-8192';        // fast, cheap, great for this
const FAST_MODEL    = 'llama-3.1-8b-instant';  // even faster for real-time
const TIMEOUT_MS    = 6000;                    // 6s max — children can't wait

// ── Cache TTL ─────────────────────────────────────────────────
const BEHAVIOR_CACHE_TTL_MINUTES = 30; // same context → same response for 30min

// ── SHA-256 cache key ─────────────────────────────────────────
async function buildCacheKey(
  trigger: string,
  mode: string,
  ageGroup: string,
  energyLevel: string,
  consecutiveSongs: number,
  smileBucket: string,
  gazeOnScreen: boolean
): Promise<string> {
  const raw = `${trigger}|${mode}|${ageGroup}|${energyLevel}|${consecutiveSongs}|${smileBucket}|${gazeOnScreen}`;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Parse and validate Groq JSON response ─────────────────────
function parseGroqResponse(raw: string): BehaviorResponse | null {
  try {
    // Strip any markdown fences if present
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const obj = JSON.parse(clean);

    const validModes: BehaviorMode[]  = ['sing','talk','encourage','pause','celebrate','reengage'];
    const validTones: BehaviorTone[] = ['excited','warm','playful','soothing','encouraging','celebratory','curious','gentle'];

    const mode = validModes.includes(obj.mode) ? obj.mode as BehaviorMode : 'talk';
    const tone = validTones.includes(obj.tone) ? obj.tone as BehaviorTone : 'warm';

    return {
      mode,
      tone,
      text:      String(obj.text || '').slice(0, 400),
      followUp:  (obj.follow_up ?? null) as FollowUpAction,
      timing:    obj.timing === 'after_song' ? 'after_song' : obj.timing === 'delayed' ? 'delayed' : 'immediate',
      singAlong: obj.sing_along ?? undefined,
      question:  obj.question ?? undefined,
      fromCache: false,
    };
  } catch {
    return null;
  }
}

// ── Retrieve from behavior cache ──────────────────────────────
async function getCachedBehavior(db: D1Database, cacheKey: string): Promise<BehaviorResponse | null> {
  try {
    const row = await db.prepare(
      `SELECT mode, tone, text_output, follow_up, timing
       FROM behavior_cache
       WHERE cache_key = ?
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       LIMIT 1`
    ).bind(cacheKey).first() as any;

    if (!row) return null;

    // Update hit count async
    db.prepare(`UPDATE behavior_cache SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE cache_key = ?`)
      .bind(cacheKey).run().catch(() => {});

    return {
      mode:      row.mode as BehaviorMode,
      tone:      row.tone as BehaviorTone,
      text:      row.text_output,
      followUp:  row.follow_up ?? null,
      timing:    row.timing ?? 'immediate',
      fromCache: true,
      cacheKey,
    };
  } catch { return null; }
}

// ── Store in behavior cache ───────────────────────────────────
async function cacheBehavior(db: D1Database, key: string, resp: BehaviorResponse): Promise<void> {
  const expires = new Date(Date.now() + BEHAVIOR_CACHE_TTL_MINUTES * 60 * 1000).toISOString();
  try {
    await db.prepare(
      `INSERT OR REPLACE INTO behavior_cache
         (cache_key, mode, tone, text_output, follow_up, timing, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(key, resp.mode, resp.tone, resp.text, resp.followUp ?? null, resp.timing, expires).run();
  } catch { /* non-critical */ }
}

// ── Log behavior to DB ────────────────────────────────────────
async function logBehavior(
  db: D1Database,
  req: BehaviorRequest,
  resp: BehaviorResponse,
  latencyMs: number,
  error?: string
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO groq_behavior_log
         (user_id, child_id, session_id, trigger_type, engagement_json, context_json,
          mode, tone, text_output, follow_up, timing, groq_model, latency_ms, cache_hit, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      req.userId, req.childId ?? null, req.sessionId ?? null,
      req.context.trigger,
      JSON.stringify(req.engagement),
      JSON.stringify({ style: req.context.preferredStyle, energy: req.context.energyLevel, mode: req.context.currentMode }),
      resp.mode, resp.tone, resp.text, resp.followUp ?? null, resp.timing,
      resp.groqModel ?? DEFAULT_MODEL,
      latencyMs,
      resp.fromCache ? 1 : 0,
      error ?? null
    ).run();
  } catch { /* non-critical */ }
}

// ── Main Groq call ────────────────────────────────────────────
async function callGroq(apiKey: string, userPrompt: string): Promise<{ content: string; tokensUsed: number; model: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(GROQ_API_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       FAST_MODEL,
        messages:    [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens:  250,   // behavior response is short
        temperature: 0.75,  // creative but not chaotic
        top_p:       0.9,
        stream:      false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    return {
      content:    data.choices?.[0]?.message?.content ?? '',
      tokensUsed: data.usage?.total_tokens ?? 0,
      model:      data.model ?? FAST_MODEL,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Main exported function ────────────────────────────────────
export async function generateBehavior(
  request: BehaviorRequest,
  env: any,
  db: D1Database
): Promise<BehaviorResponse> {

  const startMs = Date.now();
  const { context: ctx, engagement: eng } = request;

  // ── 1. Build cache key ──────────────────────────────────────
  const ageGroup = ctx.childAge < 3 ? 'toddler' : ctx.childAge < 6 ? 'preschool' : 'school';
  const smileBucket = eng.smileCount < 2 ? 'low' : eng.smileCount < 5 ? 'med' : 'high';

  const cacheKey = await buildCacheKey(
    ctx.trigger,
    ctx.currentMode,
    ageGroup,
    ctx.energyLevel,
    Math.min(ctx.consecutiveSongs, 5), // bucket: 0-5
    smileBucket,
    eng.gazeOnScreen
  );

  // ── 2. Check cache (unless forced skip) ────────────────────
  if (!request.skipCache) {
    const cached = await getCachedBehavior(db, cacheKey);
    if (cached) {
      logBehavior(db, request, cached, Date.now() - startMs).catch(() => {});
      return { ...cached, cacheKey };
    }
  }

  // ── 3. No Groq key → deterministic fallback ─────────────────
  const groqKey = env.GROQ_API_KEY;
  if (!groqKey) {
    const fallback = getFallbackBehavior(ctx, eng, request.forceMode);
    fallback.cacheKey = cacheKey;
    cacheBehavior(db, cacheKey, fallback).catch(() => {});
    logBehavior(db, request, fallback, Date.now() - startMs).catch(() => {});
    return fallback;
  }

  // ── 4. Call Groq ─────────────────────────────────────────────
  const userPrompt = buildUserPrompt(ctx, eng, request.forceMode);

  try {
    const { content, tokensUsed, model } = await callGroq(groqKey, userPrompt);
    const parsed = parseGroqResponse(content);

    if (!parsed) {
      // JSON parse failed → fallback
      const fallback = getFallbackBehavior(ctx, eng, request.forceMode);
      fallback.cacheKey = cacheKey;
      logBehavior(db, request, fallback, Date.now() - startMs, 'JSON parse failed').catch(() => {});
      return fallback;
    }

    const response: BehaviorResponse = {
      ...parsed,
      cacheKey,
      groqModel: model,
      latencyMs: Date.now() - startMs,
      fromCache: false,
    };

    // ── 5. Cache + log (async) ───────────────────────────────
    cacheBehavior(db, cacheKey, response).catch(() => {});
    logBehavior(db, request, response, response.latencyMs!).catch(() => {});

    return response;

  } catch (e: any) {
    // Groq failed → deterministic fallback (always works)
    const fallback = getFallbackBehavior(ctx, eng, request.forceMode);
    fallback.cacheKey = cacheKey;
    logBehavior(db, request, fallback, Date.now() - startMs, e.message).catch(() => {});
    return fallback;
  }
}

// ── Get current loop state ────────────────────────────────────
export async function getLoopState(db: D1Database, sessionId: number): Promise<Record<string, any> | null> {
  try {
    return await db.prepare(
      `SELECT * FROM interaction_loop_state WHERE session_id = ?`
    ).bind(sessionId).first() as any;
  } catch { return null; }
}

// ── Update loop state ─────────────────────────────────────────
export async function updateLoopState(
  db: D1Database,
  sessionId: number,
  childId: number,
  updates: Record<string, any>
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO interaction_loop_state (session_id, child_id, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(session_id) DO UPDATE SET
         current_mode     = COALESCE(?, current_mode),
         energy_level     = COALESCE(?, energy_level),
         last_mode        = COALESCE(?, last_mode),
         last_behavior_at = CURRENT_TIMESTAMP,
         behavior_count   = behavior_count + 1,
         song_count       = song_count + COALESCE(?, 0),
         talk_count       = talk_count + COALESCE(?, 0),
         consecutive_songs = COALESCE(?, consecutive_songs),
         updated_at       = CURRENT_TIMESTAMP`
    ).bind(
      sessionId, childId,
      updates.currentMode ?? null,
      updates.energyLevel ?? null,
      updates.lastMode ?? null,
      updates.addSong ? 1 : 0,
      updates.addTalk ? 1 : 0,
      updates.consecutiveSongs ?? null,
    ).run();
  } catch { /* non-critical */ }
}
