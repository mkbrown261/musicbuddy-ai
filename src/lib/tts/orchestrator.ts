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
  // STEP 2: Generate cache key
  // ─────────────────────────────────────────────────────────
  const cacheKey = await generateCacheKey(
    request.text,
    voiceConfig.voiceId,
    voiceConfig.style,
    voiceConfig.emotion
  );
  const textHash = await generateTextHash(request.text);

  // ─────────────────────────────────────────────────────────
  // STEP 3: RetrieveCachedAudio — NEVER regenerate if cached
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
  // STEP 4: GenerateTTS
  // ─────────────────────────────────────────────────────────
  let response = await callResolvedProvider(request.text, voiceConfig, env);

  // ─────────────────────────────────────────────────────────
  // STEP 5: HandleFallback if generation failed
  // ─────────────────────────────────────────────────────────
  if (!response.audioUrl) {
    // Build ordered fallback chain (skip the failed provider)
    const chain: TTSProvider[] = [];
    if (voiceConfig.provider !== 'elevenlabs' && env.ELEVENLABS_API_KEY) chain.push('elevenlabs');
    if (voiceConfig.provider !== 'openai'     && env.OPENAI_API_KEY)     chain.push('openai');
    if (voiceConfig.provider !== 'polly'      && env.AWS_ACCESS_KEY_ID)  chain.push('polly');

    const fallbackResult = await handleFallback(request.text, env, chain, voiceConfig);
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
  // STEP 6: CacheAudio (async — never blocks the response)
  // ─────────────────────────────────────────────────────────
  if (response.audioUrl && !request.skipCache) {
    cacheAudio(db, {
      cacheKey,
      textHash,
      provider:  response.provider,
      voiceId:   response.voiceId,
      style:     voiceConfig.style,
      emotion:   voiceConfig.emotion,
      audioData: response.audioUrl,
      charCount: response.charCount,
      // @ts-ignore
      durationMs: response._durationMs,
    }).catch(() => {});
  }

  // ─────────────────────────────────────────────────────────
  // STEP 7: TrackUsage (async — never blocks the response)
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
  // STEP 8: Check if trial billing event should fire
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
