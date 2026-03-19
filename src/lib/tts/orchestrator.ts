// ============================================================
// TTS Orchestrator — Master Flow Controller
// src/lib/tts/orchestrator.ts
// ============================================================
// Implements the mandatory TTS flow:
//
//   RequestTTS
//   → ResolveVoiceTier
//   → GenerateCacheKey
//   → RetrieveCachedAudio
//     IF cached: return cached audio (no cost, no latency)
//     ELSE:
//       → GenerateTTS (based on tier)
//         IF failure: → HandleFallback
//       → CacheAudio (async, non-blocking)
//       → TrackUsage (async, non-blocking)
//       → return audio
//
// ARCHITECTURAL RULE: This is the ONLY place provider calls
// are coordinated. No module reaches into another directly.
// All external callers use the Intent Layer (TTSModule below).
// ============================================================

import type { TTSRequest, TTSResponse, VoiceConfig, TTSProvider } from './types';
import { TIER_DEFAULTS } from './types';

import { resolveVoiceTier, buildRouterContext } from './voice-router';
import { generateCacheKey, generateTextHash, retrieveCachedAudio, cacheAudio, extendTTLIfFrequent } from './audio-cache';
import { logUsage, recordBillingEvent, getVoicePreferences } from './usage-tracker';
import { generateOpenAITTS } from './providers/openai';
import { generateElevenLabsTTS } from './providers/elevenlabs';
import { generatePollyTTS } from './providers/polly';
import { generateReplicateTTS } from './providers/replicate';
import { handleFallback } from './fallback-handler';
import { applyPersonality, mergePersonalityIntoConfig } from '../groq/personality';

// ── Call the resolved provider ─────────────────────────────────
async function callResolvedProvider(
  text: string,
  config: VoiceConfig,
  env: any
): Promise<TTSResponse> {
  switch (config.provider) {
    case 'elevenlabs':
      // Direct ElevenLabs key takes priority
      if (env.ELEVENLABS_API_KEY)
        return generateElevenLabsTTS(text, config, env.ELEVENLABS_API_KEY);
      // Replicate provides ElevenLabs quality for free users
      if (env.REPLICATE_API_KEY)
        return generateReplicateTTS(text, config, env.REPLICATE_API_KEY);
      break;

    case 'openai':
      if (!env.OPENAI_API_KEY) break;
      return generateOpenAITTS(text, config, env.OPENAI_API_KEY);

    case 'polly':
      if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) break;
      return generatePollyTTS(text, config, {
        accessKeyId:     env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        region:          env.AWS_REGION ?? 'us-east-1',
      });

    case 'demo':
    default:
      return {
        audioUrl: null, provider: 'demo', voiceId: 'browser',
        tier: 'demo', cacheHit: false, charCount: 0,
      };
  }
  // Key missing — return null to trigger fallback
  return {
    audioUrl: null, provider: config.provider, voiceId: config.voiceId,
    tier: 'demo', cacheHit: false, charCount: 0,
    error: `${config.provider} key not configured`,
  };
}

// ── Main orchestrator function ─────────────────────────────────
export async function requestTTS(
  request: TTSRequest,
  env: any,
  db: D1Database
): Promise<TTSResponse> {

  const userId = request.userId ?? 'demo';

  // ─────────────────────────────────────────────────────────
  // STEP 1: ResolveVoiceTier
  // ─────────────────────────────────────────────────────────
  const userPrefs = await getVoicePreferences(db, userId);
  const ctx       = buildRouterContext(env, db, userId, userPrefs);
  const resolution = await resolveVoiceTier(ctx, request);
  const { tier, voiceConfig, trialRemaining } = resolution;

  // ─────────────────────────────────────────────────────────
  // STEP 2: GROQ PERSONALITY STAGE — rewrite text + select voice
  // Transforms flat text → expressive children's host speech.
  // Runs ONLY for ElevenLabs (Groq personality is wasted on Polly/demo).
  // Falls back to local enrichment if Groq unavailable.
  // ─────────────────────────────────────────────────────────
  let finalText     = request.text;
  let finalConfig   = voiceConfig;

  if (voiceConfig.provider === 'elevenlabs') {
    const gender = (userPrefs?.voiceGender as 'female' | 'male') ?? 'female';
    const personality = await applyPersonality(
      request.text,
      voiceConfig.emotion,
      voiceConfig.style,
      gender,
      env.GROQ_API_KEY,          // runs Groq rewrite if key present
      request.voiceOverride,     // respect explicit voice override
    );
    finalText   = personality.text;
    finalConfig = mergePersonalityIntoConfig(voiceConfig, personality);
  }

  // ─────────────────────────────────────────────────────────
  // STEP 3: Generate cache key (on final text + final voice)
  // ─────────────────────────────────────────────────────────
  const cacheKey = await generateCacheKey(
    finalText,
    finalConfig.voiceId,
    finalConfig.style,
    finalConfig.emotion
  );
  const textHash = await generateTextHash(finalText);

  // ─────────────────────────────────────────────────────────
  // STEP 4: RetrieveCachedAudio — NEVER regenerate if cached
  // ─────────────────────────────────────────────────────────
  if (!request.skipCache) {
    const cached = await retrieveCachedAudio(db, cacheKey);
    if (cached) {
      // Extend TTL if frequently used
      extendTTLIfFrequent(db, cacheKey, cached.hitCount).catch(() => {});

      return {
        audioUrl:        cached.audioData,
        provider:        cached.provider,
        voiceId:         cached.voiceId,
        tier:            tier,
        cacheHit:        true,
        cacheKey,
        charCount:       cached.charCount,
        trialRemaining,
      };
    }
  }

  // ─────────────────────────────────────────────────────────
  // STEP 5: GenerateTTS — use personality-enriched text + config
  // ─────────────────────────────────────────────────────────
  let response = await callResolvedProvider(finalText, finalConfig, env);

  // ─────────────────────────────────────────────────────────
  // STEP 6: HandleFallback if generation failed
  // ─────────────────────────────────────────────────────────
  if (!response.audioUrl) {
    const chain: TTSProvider[] = [];
    if (finalConfig.provider !== 'elevenlabs' && (env.ELEVENLABS_API_KEY || env.REPLICATE_API_KEY)) chain.push('elevenlabs');
    if (finalConfig.provider !== 'openai'     && env.OPENAI_API_KEY)     chain.push('openai');
    if (finalConfig.provider !== 'polly'      && env.AWS_ACCESS_KEY_ID)  chain.push('polly');

    const fallbackResult = await handleFallback(finalText, env, chain, finalConfig);
    response = fallbackResult.response;

    // Record fallback event for analytics
    if (fallbackResult.attemptedChain.length > 0) {
      recordBillingEvent(
        db, userId,
        'fallback_triggered',
        `Chain: ${fallbackResult.attemptedChain.map(a => a.provider).join(' → ')}`,
        tier,
        response.tier,
        voiceConfig.provider
      ).catch(() => {});
    }
  }

  // ─────────────────────────────────────────────────────────
  // STEP 7: CacheAudio (async — never blocks the response)
  // ─────────────────────────────────────────────────────────
  if (response.audioUrl && !request.skipCache) {
    cacheAudio(db, {
      cacheKey,
      textHash,
      provider:  response.provider,
      voiceId:   response.voiceId,
      style:     finalConfig.style,
      emotion:   finalConfig.emotion,
      audioData: response.audioUrl,
      charCount: response.charCount,
      // @ts-ignore
      durationMs: response._durationMs,
    }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────
  // STEP 8: TrackUsage (async — never blocks the response)
  // ─────────────────────────────────────────────────────────
  if (!response.cacheHit) {
    logUsage(db, {
      userId,
      childId:   request.childId,
      sessionId: request.sessionId,
      provider:  response.provider,
      voiceId:   response.voiceId,
      charCount: response.charCount,
      tier,
      cacheHit:  false,
      // @ts-ignore
      costUnits: response._costUnits ?? 0,
      latencyMs: response.latencyMs,
      error:     response.error,
    }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────
  // STEP 9: Check if trial billing event should fire
  // ─────────────────────────────────────────────────────────
  if (tier === 'trial' && trialRemaining !== undefined) {
    const newRemaining = trialRemaining - 1;
    if (newRemaining <= 0) {
      // Trial just exhausted — record billing event
      recordBillingEvent(
        db, userId,
        'trial_exhausted',
        `Last ElevenLabs trial use consumed`,
        'trial', 'free', 'elevenlabs'
      ).catch(() => {});

      return {
        ...response,
        tier,
        cacheHit:       false,
        cacheKey,
        trialRemaining: 0,
        billingTrigger: true,   // frontend should show upgrade prompt
        fallbackUsed:   response.fallbackUsed,
      };
    }

    return {
      ...response,
      tier,
      cacheHit:       false,
      cacheKey,
      trialRemaining: newRemaining,
    };
  }

  return {
    ...response,
    tier,
    cacheHit:   false,
    cacheKey,
    trialRemaining,
  };
}
