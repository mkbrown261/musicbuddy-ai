// ============================================================
// MODULE 2: TTS Manager (Intent Layer Adapter)
// src/lib/modules/tts-manager.ts
// ============================================================
// This module is the ONLY public interface for TTS.
// All business logic lives in src/lib/tts/ sub-modules.
//
// Intents handled:
//   REQUEST_TTS           — full orchestrated TTS flow
//   RESOLVE_VOICE_TIER    — get tier without generating
//   GENERATE_TTS          — direct generation (bypass cache)
//   CACHE_AUDIO           — manually cache an audio entry
//   RETRIEVE_CACHED_AUDIO — fetch from cache by key
//   TRACK_TTS_USAGE       — record a usage event
//   HANDLE_TTS_FALLBACK   — trigger fallback chain manually
//   GET_TTS_QUOTA         — current usage / limits for user
//   GET_TTS_CACHE_STATS   — cache hit rates, storage stats
//   SET_VOICE_PREFS       — save user voice preferences
//   GET_VOICE_PREFS       — load user voice preferences
//
// Legacy intents (kept for backward compatibility):
//   USE_TTS               — maps → REQUEST_TTS
//
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';
import { requestTTS } from '../tts/orchestrator';
import { resolveVoiceTier, buildRouterContext } from '../tts/voice-router';
import {
  retrieveCachedAudio, cacheAudio, generateCacheKey,
  generateTextHash, getCacheStats,
} from '../tts/audio-cache';
import {
  logUsage, getQuotaStatus, getVoicePreferences,
  saveVoicePreferences, recordBillingEvent,
} from '../tts/usage-tracker';
import { handleFallback } from '../tts/fallback-handler';
import type { TTSRequest, TTSResponse, TTSProvider, TTSStyle, TTSEmotion } from '../tts/types';

// ── Helper: extract user ID from payload ──────────────────────
function uid(payload: IntentPayload): string {
  return payload.userId ?? 'demo';
}

// ── TTSManager Module ──────────────────────────────────────────
export class TTSManagerModule implements IntentModule {
  handles = [
    // Primary intents
    'REQUEST_TTS',
    'RESOLVE_VOICE_TIER',
    'GENERATE_TTS',
    'CACHE_AUDIO',
    'RETRIEVE_CACHED_AUDIO',
    'TRACK_TTS_USAGE',
    'HANDLE_TTS_FALLBACK',
    'GET_TTS_QUOTA',
    'GET_TTS_CACHE_STATS',
    'SET_VOICE_PREFS',
    'GET_VOICE_PREFS',
    // Legacy
    'USE_TTS',
    'TRACK_TTS_USAGE',
  ] as any[];

  async handle(payload: IntentPayload, env: any, db: any): Promise<IntentResult> {

    switch (payload.intent) {

      // ══════════════════════════════════════════════════════
      // REQUEST_TTS — Full orchestrated flow
      // Input: { text, style?, emotion?, voiceOverride?, skipCache? }
      // ══════════════════════════════════════════════════════
      case 'REQUEST_TTS':
      case 'USE_TTS': {
        const d = payload.data as {
          text:          string;
          style?:        TTSStyle;
          emotion?:      TTSEmotion;
          voiceOverride?: string;
          skipCache?:    boolean;
          // Phase 2: Alive System fields
          userText?:     string;
          engagement?:   {
            smileCount?:    number;
            laughCount?:    number;
            attentionLoss?: number;
            intensity?:     number;
            voiceDetected?: boolean;
          };
          behaviorTone?: string;
        };

        if (!d.text?.trim()) {
          return { success: false, intent: payload.intent as any, error: 'text is required' };
        }

        const request: TTSRequest = {
          text:          d.text,
          userId:        uid(payload),
          childId:       payload.childId,
          sessionId:     payload.sessionId,
          style:         d.style ?? 'children_host',
          emotion:       d.emotion ?? 'friendly',
          voiceOverride: d.voiceOverride,
          skipCache:     d.skipCache ?? false,
          // Phase 2 fields
          userText:      d.userText,
          engagement:    d.engagement,
          behaviorTone:  d.behaviorTone,
        };

        const response: TTSResponse = await requestTTS(request, env, db);

        // If trial is exhausted, record it
        if (response.billingTrigger) {
          recordBillingEvent(db, uid(payload), 'upgrade_prompted',
            'Trial exhausted — upgrade prompt shown', 'trial', 'free').catch(() => {});
        }

        return {
          success:  !!(response.audioUrl !== undefined), // even null = success (use browser TTS)
          intent:   payload.intent as any,
          data:     response,
          fallback: response.fallbackUsed,
          provider: response.provider,
        };
      }

      // ══════════════════════════════════════════════════════
      // RESOLVE_VOICE_TIER — tier check without generation
      // Input: { context? }
      // ══════════════════════════════════════════════════════
      case 'RESOLVE_VOICE_TIER': {
        const ctx = buildRouterContext(env, db, uid(payload));
        const req: TTSRequest = {
          text: '', userId: uid(payload), childId: payload.childId,
          style: 'neutral', emotion: 'friendly',
        };
        const resolution = await resolveVoiceTier(ctx, req);
        return { success: true, intent: payload.intent as any, data: resolution };
      }

      // ══════════════════════════════════════════════════════
      // GENERATE_TTS — direct generation, respects cache
      // Input: { text, provider, voiceId, style, emotion, skipCache? }
      // ══════════════════════════════════════════════════════
      case 'GENERATE_TTS': {
        const d = payload.data as {
          text: string;
          provider?: TTSProvider;
          voiceId?: string;
          style?: TTSStyle;
          emotion?: TTSEmotion;
          skipCache?: boolean;
        };
        const request: TTSRequest = {
          text:      d.text,
          userId:    uid(payload),
          childId:   payload.childId,
          sessionId: payload.sessionId,
          style:     d.style ?? 'children_host',
          emotion:   d.emotion ?? 'friendly',
          voiceOverride: d.voiceId,
          skipCache: d.skipCache ?? false,
        };
        const response = await requestTTS(request, env, db);
        return {
          success:  true,
          intent:   payload.intent as any,
          data:     response,
          provider: response.provider,
        };
      }

      // ══════════════════════════════════════════════════════
      // CACHE_AUDIO — manually cache audio
      // Input: { cacheKey, audioData, provider, voiceId, style, emotion, charCount }
      // ══════════════════════════════════════════════════════
      case 'CACHE_AUDIO': {
        const d = payload.data as {
          cacheKey: string; textHash?: string; provider: TTSProvider;
          voiceId: string; style: string; emotion: string;
          audioData: string; charCount: number; durationMs?: number;
        };
        const textHash = d.textHash ?? await generateTextHash(d.cacheKey);
        await cacheAudio(db, { ...d, textHash });
        return { success: true, intent: payload.intent as any, data: { cached: true } };
      }

      // ══════════════════════════════════════════════════════
      // RETRIEVE_CACHED_AUDIO — fetch from cache
      // Input: { cacheKey } or { text, voiceId, style, emotion }
      // ══════════════════════════════════════════════════════
      case 'RETRIEVE_CACHED_AUDIO': {
        const d = payload.data as {
          cacheKey?: string;
          text?: string; voiceId?: string; style?: string; emotion?: string;
        };
        let key = d.cacheKey;
        if (!key && d.text) {
          key = await generateCacheKey(d.text, d.voiceId ?? '', d.style ?? '', d.emotion ?? '');
        }
        if (!key) return { success: false, intent: payload.intent as any, error: 'cacheKey or text required' };

        const entry = await retrieveCachedAudio(db, key);
        return {
          success: true, intent: payload.intent as any,
          data: entry ? { found: true, ...entry } : { found: false }
        };
      }

      // ══════════════════════════════════════════════════════
      // TRACK_TTS_USAGE — log usage event
      // Input: { provider, voiceId, charCount, tier, cacheHit?, latencyMs? }
      // ══════════════════════════════════════════════════════
      case 'TRACK_TTS_USAGE': {
        const d = payload.data as {
          provider: TTSProvider; voiceId: string; charCount: number;
          tier: string; cacheHit?: boolean; costUnits?: number; latencyMs?: number;
        };
        await logUsage(db, {
          userId:    uid(payload),
          childId:   payload.childId,
          sessionId: payload.sessionId,
          provider:  d.provider,
          voiceId:   d.voiceId,
          charCount: d.charCount,
          tier:      d.tier as any,
          cacheHit:  d.cacheHit ?? false,
          costUnits: d.costUnits ?? 0,
          latencyMs: d.latencyMs,
        });
        return { success: true, intent: payload.intent as any, data: { tracked: true } };
      }

      // ══════════════════════════════════════════════════════
      // HANDLE_TTS_FALLBACK — trigger fallback chain manually
      // Input: { text, providerPriorityList? }
      // ══════════════════════════════════════════════════════
      case 'HANDLE_TTS_FALLBACK': {
        const d = payload.data as {
          text: string;
          providerPriorityList?: TTSProvider[];
        };
        const chain = d.providerPriorityList ?? ['elevenlabs', 'openai', 'polly'];
        const result = await handleFallback(d.text, env, chain);
        return {
          success:  !!(result.response.audioUrl),
          intent:   payload.intent as any,
          data:     result.response,
          fallback: true,
          provider: result.response.provider,
        };
      }

      // ══════════════════════════════════════════════════════
      // GET_TTS_QUOTA — current usage limits
      // ══════════════════════════════════════════════════════
      case 'GET_TTS_QUOTA': {
        const quota = await getQuotaStatus(
          db, uid(payload),
          !!(env.ELEVENLABS_API_KEY),
          !!(env.OPENAI_API_KEY),
          !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)
        );
        return { success: true, intent: payload.intent as any, data: quota };
      }

      // ══════════════════════════════════════════════════════
      // GET_TTS_CACHE_STATS — hit rates, storage stats
      // ══════════════════════════════════════════════════════
      case 'GET_TTS_CACHE_STATS': {
        const stats = await getCacheStats(db);
        return { success: true, intent: payload.intent as any, data: stats };
      }

      // ══════════════════════════════════════════════════════
      // SET_VOICE_PREFS — save user voice preferences
      // Input: { preferredProvider?, openaiVoice?, elevenlabsVoice?, pollyVoice?, speed?, defaultEmotion?, singingMode? }
      // ══════════════════════════════════════════════════════
      case 'SET_VOICE_PREFS': {
        await saveVoicePreferences(db, uid(payload), payload.data as any);
        return { success: true, intent: payload.intent as any, data: { saved: true } };
      }

      // ══════════════════════════════════════════════════════
      // GET_VOICE_PREFS — load user voice preferences
      // ══════════════════════════════════════════════════════
      case 'GET_VOICE_PREFS': {
        const prefs = await getVoicePreferences(db, uid(payload));
        return { success: true, intent: payload.intent as any, data: prefs ?? { default: true } };
      }

      default:
        return { success: false, intent: payload.intent as any, error: `Unknown TTS intent: ${payload.intent}` };
    }
  }
}
