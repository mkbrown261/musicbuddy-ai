// ============================================================
// TTS Voice Router
// src/lib/tts/voice-router.ts
// ============================================================
// Decides WHICH provider and voice to use for a given user.
//
// Routing logic (priority order):
//   1. Premium user with ElevenLabs key → ElevenLabs (premium config)
//   2. Trial user with ElevenLabs key + trial remaining → ElevenLabs (trial config)
//   3. Trial exhausted OR no ElevenLabs key → OpenAI (if key available)
//   4. OpenAI quota exceeded OR no OpenAI key → Amazon Polly (if credentials)
//   5. No keys available → demo (Web Speech API in browser)
//
// The router NEVER calls providers — it only returns a VoiceConfig.
// Actual generation is handled by the Orchestrator.
// ============================================================

import type { VoiceTier, VoiceConfig, TierResolution, TTSRequest } from './types';
import { TIER_DEFAULTS, ELEVENLABS_VOICES, OPENAI_VOICES, POLLY_VOICES, EMOTION_TUNING } from './types';
import { getTrialState, getDailyUsage, LIMITS } from './usage-tracker';

// ── User tier markers (from billing/localStorage) ────────────
// Tier is determined by:
//   a) hasPremiumFlag (set by billing system after payment)
//   b) keys available in env
//   c) trial state from DB
export interface RouterContext {
  userId:            string;
  hasPremiumFlag:    boolean;    // billing confirmed premium
  elevenlabsKeyAvailable: boolean;
  openaiKeyAvailable:     boolean;
  pollyAvailable:         boolean;
  db:                D1Database;
  userVoicePrefs?:   Record<string, any> | null;
}

// ── Build emotion-tuned VoiceConfig ───────────────────────────
function buildConfig(
  base: VoiceConfig,
  request: TTSRequest
): VoiceConfig {
  const emotion = request.emotion ?? base.emotion;
  const style   = request.style   ?? base.style;
  const tuning  = EMOTION_TUNING[emotion] ?? EMOTION_TUNING.friendly;

  return {
    ...base,
    emotion,
    style,
    // Apply emotion tuning to ElevenLabs-specific fields
    stability:  base.provider === 'elevenlabs' ? tuning.stability  : undefined,
    styleBoost: base.provider === 'elevenlabs' ? tuning.styleBoost : undefined,
  };
}

// ── Main tier resolution ──────────────────────────────────────
export async function resolveVoiceTier(
  ctx: RouterContext,
  request: TTSRequest
): Promise<TierResolution> {

  // ── 1. Premium path: paid user with ElevenLabs ───────────
  if (ctx.hasPremiumFlag && ctx.elevenlabsKeyAvailable) {
    const voiceId = ctx.userVoicePrefs?.elevenlabsVoice
      ?? ELEVENLABS_VOICES.rachel.id;

    const config = buildConfig(
      { ...TIER_DEFAULTS.premium, voiceId },
      request
    );

    return {
      tier:   'premium',
      voiceConfig: config,
      reason: 'Paid premium user — ElevenLabs Rachel (full expressiveness)',
    };
  }

  // ── 2. Trial path: ElevenLabs key + trial not exhausted ──
  if (ctx.elevenlabsKeyAvailable) {
    const trial = await getTrialState(ctx.db, ctx.userId);

    if (trial.active && trial.remaining > 0 && trial.dailyUsed < trial.dailyLimit) {
      const voiceId = ctx.userVoicePrefs?.elevenlabsVoice
        ?? ELEVENLABS_VOICES.rachel.id;

      const config = buildConfig(
        { ...TIER_DEFAULTS.trial, voiceId },
        request
      );

      return {
        tier:   'trial',
        voiceConfig: config,
        reason: `Trial active — ${trial.remaining} ElevenLabs uses remaining`,
        trialRemaining: trial.remaining,
      };
    }

    // Trial exhausted — fall through to OpenAI
  }

  // ── 3. Free path: OpenAI shimmer ─────────────────────────
  if (ctx.openaiKeyAvailable) {
    const dailyUsed = await getDailyUsage(ctx.db, ctx.userId, 'openai');

    if (dailyUsed < LIMITS.FREE_OPENAI_DAILY) {
      const voiceId = ctx.userVoicePrefs?.openaiVoice ?? 'shimmer';

      const config = buildConfig(
        { ...TIER_DEFAULTS.free, voiceId },
        request
      );

      return {
        tier:        'free',
        voiceConfig: config,
        reason:      `OpenAI TTS (${dailyUsed}/${LIMITS.FREE_OPENAI_DAILY} daily uses)`,
      };
    }

    // OpenAI daily quota exceeded — fall through to Polly
  }

  // ── 4. Fallback: Amazon Polly ─────────────────────────────
  if (ctx.pollyAvailable) {
    const dailyUsed = await getDailyUsage(ctx.db, ctx.userId, 'polly');

    if (dailyUsed < LIMITS.FREE_POLLY_DAILY) {
      const voiceId = ctx.userVoicePrefs?.pollyVoice ?? 'Joanna';

      // Use Ivy for singing mode (child-appropriate)
      const finalVoiceId = (request.emotion === 'singing' || request.style === 'singing')
        ? 'Ivy'
        : voiceId;

      const config = buildConfig(
        { ...TIER_DEFAULTS.fallback, voiceId: finalVoiceId },
        request
      );

      return {
        tier:        'fallback',
        voiceConfig: config,
        reason:      `Amazon Polly fallback (${dailyUsed}/${LIMITS.FREE_POLLY_DAILY} daily uses)`,
      };
    }
  }

  // ── 5. Demo: no keys configured ──────────────────────────
  return {
    tier:        'demo',
    voiceConfig: { ...TIER_DEFAULTS.demo },
    reason:      'No TTS API keys configured — browser Web Speech API will be used',
  };
}

// ── Build RouterContext from Hono env + DB ─────────────────────
export function buildRouterContext(
  env: any,
  db: D1Database,
  userId: string,
  userVoicePrefs?: Record<string, any> | null
): RouterContext {
  return {
    userId,
    hasPremiumFlag:         !!(env.ELEVENLABS_API_KEY && env._PREMIUM_USERS?.includes(userId)),
    elevenlabsKeyAvailable: !!(env.ELEVENLABS_API_KEY),
    openaiKeyAvailable:     !!(env.OPENAI_API_KEY),
    pollyAvailable:         !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
    db,
    userVoicePrefs,
  };
}
