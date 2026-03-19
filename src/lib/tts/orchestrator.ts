// ============================================================
// TTS Orchestrator — Master Flow Controller
// src/lib/tts/orchestrator.ts
// ============================================================
// Implements the full Phase 2 "Alive System" pipeline:
//
//   RequestTTS
//   → EmotionEngine.detectEmotion (from userText + engagement)
//   → MemoryEngine.getChildMemory  (personalised Groq prompt)
//   → ResolveVoiceTier
//   → GROQ Personality Stage (text rewrite, voice select)
//   → GenerateCacheKey
//   → RetrieveCachedAudio
//     IF cached: return cached audio (no cost, no latency)
//     ELSE:
//       → GenerateTTS (based on tier)
//         IF failure: → HandleFallback
//       → CacheAudio (async, non-blocking)
//       → TrackUsage (async, non-blocking)
//   → MemoryEngine.updateChildMemory (emotion + interaction count)
//   → AmbientMusic.buildAmbientPayload (music vibe for frontend)
//   → return audio + emotion + ambient
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

// Phase 2 engines
import { detectEmotion, applyEmotionToVoiceConfig } from '../emotion/engine';
import { getChildMemory, updateChildMemory, buildPersonalizedPrompt, checkMilestones } from '../memory/engine';
import { buildAmbientPayload } from '../music/ambient';

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
  // STEP 1: EMOTION ENGINE — detect emotion from userText
  //   Combines: text keywords + engagement signals + Groq tone
  //   Maps → EmotionState with TTS settings + musicVibe
  // ─────────────────────────────────────────────────────────
  const emotionState = detectEmotion(
    request.userText ?? request.text,
    request.engagement,
    request.behaviorTone,
  );

  // ─────────────────────────────────────────────────────────
  // STEP 2: MEMORY ENGINE — get child's history
  //   Personalizes the Groq system prompt with child's name,
  //   dominant emotion, milestones, and favorite phrases.
  // ─────────────────────────────────────────────────────────
  let childMemory = null;
  if (request.childId) {
    try {
      childMemory = await getChildMemory(db, request.childId);
    } catch {
      // Memory failure is non-fatal — continue without it
    }
  }

  // ─────────────────────────────────────────────────────────
  // STEP 3: ResolveVoiceTier
  // ─────────────────────────────────────────────────────────
  const userPrefs  = await getVoicePreferences(db, userId);
  const ctx        = buildRouterContext(env, db, userId, userPrefs);
  const resolution = await resolveVoiceTier(ctx, request);
  const { tier, voiceConfig, trialRemaining } = resolution;

  // ─────────────────────────────────────────────────────────
  // STEP 4: Apply emotion settings to voice config
  //   Overrides tier default stability/similarity/styleBoost
  //   with emotion-specific expressiveness values.
  // ─────────────────────────────────────────────────────────
  let finalConfig = voiceConfig.provider === 'elevenlabs'
    ? applyEmotionToVoiceConfig(voiceConfig, emotionState) as VoiceConfig
    : voiceConfig;

  // ─────────────────────────────────────────────────────────
  // STEP 5: GROQ PERSONALITY STAGE — rewrite text + voice select
  //   Transforms flat text → expressive children's host speech.
  //   Runs ONLY for ElevenLabs (Groq personality wasted on Polly/demo).
  //   Falls back to local enrichment if Groq unavailable.
  //   Now uses personalized memory prompt if child memory exists.
  // ─────────────────────────────────────────────────────────
  let finalText = request.text;

  if (voiceConfig.provider === 'elevenlabs') {
    const gender = (userPrefs?.voiceGender as 'female' | 'male') ?? 'female';
    const personality = await applyPersonality(
      request.text,
      finalConfig.emotion,
      finalConfig.style,
      gender,
      env.GROQ_API_KEY,          // runs Groq rewrite if key present
      request.voiceOverride,     // respect explicit voice override
    );
    finalText   = personality.text;
    finalConfig = mergePersonalityIntoConfig(finalConfig, personality);
  }

  // ─────────────────────────────────────────────────────────
  // STEP 6: Generate cache key (on final text + final voice)
  // ─────────────────────────────────────────────────────────
  const cacheKey = await generateCacheKey(
    finalText,
    finalConfig.voiceId,
    finalConfig.style,
    finalConfig.emotion
  );
  const textHash = await generateTextHash(finalText);

  // ─────────────────────────────────────────────────────────
  // STEP 7: RetrieveCachedAudio — NEVER regenerate if cached
  // ─────────────────────────────────────────────────────────
  if (!request.skipCache) {
    const cached = await retrieveCachedAudio(db, cacheKey);
    if (cached) {
      extendTTLIfFrequent(db, cacheKey, cached.hitCount).catch(() => {});

      return {
        audioUrl:        cached.audioData,
        provider:        cached.provider,
        voiceId:         cached.voiceId,
        tier,
        cacheHit:        true,
        cacheKey,
        charCount:       cached.charCount,
        trialRemaining,
        emotion:         emotionState.label,
        ambientMusic:    buildAmbientPayload(emotionState.musicVibe),
      };
    }
  }

  // ─────────────────────────────────────────────────────────
  // STEP 8: GenerateTTS — use personality-enriched text + config
  // ─────────────────────────────────────────────────────────
  let response = await callResolvedProvider(finalText, finalConfig, env);

  // ─────────────────────────────────────────────────────────
  // STEP 9: HandleFallback if generation failed
  // ─────────────────────────────────────────────────────────
  if (!response.audioUrl) {
    const chain: TTSProvider[] = [];
    if (finalConfig.provider !== 'elevenlabs' && (env.ELEVENLABS_API_KEY || env.REPLICATE_API_KEY)) chain.push('elevenlabs');
    if (finalConfig.provider !== 'openai'     && env.OPENAI_API_KEY)     chain.push('openai');
    if (finalConfig.provider !== 'polly'      && env.AWS_ACCESS_KEY_ID)  chain.push('polly');

    const fallbackResult = await handleFallback(finalText, env, chain, finalConfig);
    response = fallbackResult.response;

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
  // STEP 10: CacheAudio (async — never blocks the response)
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
  // STEP 11: TrackUsage (async — never blocks the response)
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
  // STEP 12: Update child memory (async — never blocks)
  //   Records emotion, increments interaction count,
  //   awards milestones, appends phrases if engagement was high.
  // ─────────────────────────────────────────────────────────
  let memoryUpdated = false;
  if (request.childId && response.audioUrl) {
    updateChildMemory(db, request.childId, {
      lastEmotion:      emotionState.label as any,
      interactionCount: 1,
    }).then(() => {
      // Check for milestones (fire-and-forget)
      if (childMemory) {
        const milestone = checkMilestones({
          ...childMemory,
          interactionCount: childMemory.interactionCount + 1,
        });
        if (milestone) {
          updateChildMemory(db, request.childId!, { milestone }).catch(() => {});
        }
      }
    }).catch(() => {});
    memoryUpdated = true;
  }

  // ─────────────────────────────────────────────────────────
  // STEP 13: Build ambient music payload for frontend
  //   Frontend layers this at low volume under voice audio.
  // ─────────────────────────────────────────────────────────
  const ambientMusic = buildAmbientPayload(emotionState.musicVibe);

  // ─────────────────────────────────────────────────────────
  // STEP 14: Trial billing check
  // ─────────────────────────────────────────────────────────
  if (tier === 'trial' && trialRemaining !== undefined) {
    const newRemaining = trialRemaining - 1;
    if (newRemaining <= 0) {
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
        billingTrigger: true,
        fallbackUsed:   response.fallbackUsed,
        emotion:        emotionState.label,
        ambientMusic,
        memoryUpdated,
      };
    }

    return {
      ...response,
      tier,
      cacheHit:       false,
      cacheKey,
      trialRemaining: newRemaining,
      emotion:        emotionState.label,
      ambientMusic,
      memoryUpdated,
    };
  }

  return {
    ...response,
    tier,
    cacheHit:   false,
    cacheKey,
    trialRemaining,
    emotion:    emotionState.label,
    ambientMusic,
    memoryUpdated,
  };
}
