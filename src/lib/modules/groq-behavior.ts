// ============================================================
// MODULE: Groq Behavior Engine (Intent Layer Adapter)
// src/lib/modules/groq-behavior.ts
// ============================================================
// The ONLY public interface for Groq cognitive decisions.
// All logic delegates to src/lib/groq/engine.ts
//
// Intents handled:
//   GENERATE_BEHAVIOR     — main: Groq decision for next action
//   ANALYZE_ENGAGEMENT    — analyse metrics, return recommendations
//   CAPTURE_ENGAGEMENT    — log raw engagement event to stream
//   GET_BEHAVIOR_HISTORY  — recent behaviors for a session
//   GET_LOOP_STATE        — current interaction loop state
//   UPDATE_LOOP_STATE     — update loop state after action
//   CLEAR_BEHAVIOR_CACHE  — flush cache entries
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';
import { generateBehavior, getLoopState, updateLoopState } from '../groq/engine';
import type { BehaviorRequest, ContextState, EngagementMetrics, BehaviorMode } from '../groq/types';

export class GroqBehaviorModule implements IntentModule {
  handles = [
    'GENERATE_BEHAVIOR',
    'ANALYZE_ENGAGEMENT',
    'CAPTURE_ENGAGEMENT',
    'GET_BEHAVIOR_HISTORY',
    'GET_LOOP_STATE',
    'UPDATE_LOOP_STATE',
    'CLEAR_BEHAVIOR_CACHE',
  ] as any[];

  async handle(payload: IntentPayload, env: any, db: any): Promise<IntentResult> {
    switch (payload.intent) {

      // ══════════════════════════════════════════════════════
      // GENERATE_BEHAVIOR — core Groq decision engine call
      // Input: { context: ContextState, engagement: EngagementMetrics, forceMode?, skipCache? }
      // ══════════════════════════════════════════════════════
      case 'GENERATE_BEHAVIOR': {
        const d = payload.data as {
          context:     ContextState;
          engagement:  EngagementMetrics;
          forceMode?:  BehaviorMode;
          skipCache?:  boolean;
        };

        if (!d.context || !d.engagement) {
          return { success: false, intent: payload.intent as any, error: 'context and engagement are required' };
        }

        const req: BehaviorRequest = {
          userId:    payload.userId ?? 'demo',
          childId:   payload.childId,
          sessionId: payload.sessionId,
          context:   d.context,
          engagement: d.engagement,
          forceMode:  d.forceMode,
          skipCache:  d.skipCache ?? false,
        };

        const behavior = await generateBehavior(req, env, db);
        return { success: true, intent: payload.intent as any, data: behavior };
      }

      // ══════════════════════════════════════════════════════
      // ANALYZE_ENGAGEMENT — analyse metrics, return recommendation
      // Input: { engagement: EngagementMetrics, sessionDuration, consecutiveSongs }
      // ══════════════════════════════════════════════════════
      case 'ANALYZE_ENGAGEMENT': {
        const d = payload.data as {
          engagement:       EngagementMetrics;
          sessionDuration?: number;
          consecutiveSongs?: number;
        };

        const eng = d.engagement;
        const recommendations: string[] = [];

        if (!eng.gazeOnScreen)   recommendations.push('reengage — child not looking');
        if (eng.attentionLoss > 3) recommendations.push('change mode — attention drifting');
        if (eng.smileCount > 5)   recommendations.push('celebrate — high positive engagement');
        if (eng.voiceDetected)    recommendations.push('encourage — child is being vocal');
        if ((d.consecutiveSongs ?? 0) >= 3) recommendations.push('talk break — too many songs in a row');

        const suggestedMode: BehaviorMode =
          !eng.gazeOnScreen     ? 'reengage'   :
          eng.attentionLoss > 3 ? 'reengage'   :
          eng.smileCount > 5    ? 'celebrate'  :
          (d.consecutiveSongs ?? 0) >= 3 ? 'talk' :
          eng.voiceDetected     ? 'encourage'  : 'talk';

        return {
          success: true,
          intent: payload.intent as any,
          data: {
            recommendations,
            suggestedMode,
            engagementScore: Math.min(1, (eng.smileCount + eng.laughCount * 2) / 10),
            shouldIntervene: !eng.gazeOnScreen || eng.attentionLoss > 3,
          }
        };
      }

      // ══════════════════════════════════════════════════════
      // CAPTURE_ENGAGEMENT — log raw event to stream table
      // Input: { eventType, value?, confidence?, metaJson? }
      // ══════════════════════════════════════════════════════
      case 'CAPTURE_ENGAGEMENT': {
        const d = payload.data as {
          eventType:   string;
          value?:      number;
          confidence?: number;
          metaJson?:   string;
        };

        if (!payload.sessionId || !payload.childId) {
          return { success: false, intent: payload.intent as any, error: 'sessionId and childId required' };
        }

        await db.prepare(
          `INSERT INTO engagement_stream (session_id, child_id, event_type, confidence, value, meta_json)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          payload.sessionId, payload.childId, d.eventType,
          d.confidence ?? 0.8, d.value ?? null, d.metaJson ?? null
        ).run();

        return { success: true, intent: payload.intent as any, data: { captured: true } };
      }

      // ══════════════════════════════════════════════════════
      // GET_BEHAVIOR_HISTORY — recent behaviors for analytics
      // Input: { limit? }
      // ══════════════════════════════════════════════════════
      case 'GET_BEHAVIOR_HISTORY': {
        const limit = (payload.data as any)?.limit ?? 10;
        const rows = await db.prepare(
          `SELECT mode, tone, text_output, follow_up, trigger_type, cache_hit,
                  latency_ms, created_at
           FROM groq_behavior_log
           WHERE ${payload.sessionId ? 'session_id = ?' : '1=1'}
           ORDER BY created_at DESC LIMIT ?`
        ).bind(
          ...(payload.sessionId ? [payload.sessionId, limit] : [limit])
        ).all();

        return { success: true, intent: payload.intent as any, data: rows.results ?? [] };
      }

      // ══════════════════════════════════════════════════════
      // GET_LOOP_STATE — current interaction loop state
      // ══════════════════════════════════════════════════════
      case 'GET_LOOP_STATE': {
        if (!payload.sessionId) return { success: false, intent: payload.intent as any, error: 'sessionId required' };
        const state = await getLoopState(db, payload.sessionId);
        return { success: true, intent: payload.intent as any, data: state ?? { sessionId: payload.sessionId, new: true } };
      }

      // ══════════════════════════════════════════════════════
      // UPDATE_LOOP_STATE — after each interaction
      // Input: { currentMode?, energyLevel?, lastMode?, addSong?, addTalk?, consecutiveSongs? }
      // ══════════════════════════════════════════════════════
      case 'UPDATE_LOOP_STATE': {
        if (!payload.sessionId || !payload.childId) {
          return { success: false, intent: payload.intent as any, error: 'sessionId and childId required' };
        }
        await updateLoopState(db, payload.sessionId, payload.childId, payload.data as any);
        return { success: true, intent: payload.intent as any, data: { updated: true } };
      }

      // ══════════════════════════════════════════════════════
      // CLEAR_BEHAVIOR_CACHE — flush expired entries
      // ══════════════════════════════════════════════════════
      case 'CLEAR_BEHAVIOR_CACHE': {
        const r = await db.prepare(
          `DELETE FROM behavior_cache WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`
        ).run();
        return { success: true, intent: payload.intent as any, data: { evicted: r.meta?.changes ?? 0 } };
      }

      default:
        return { success: false, intent: payload.intent as any, error: `Unknown Groq intent: ${payload.intent}` };
    }
  }
}
