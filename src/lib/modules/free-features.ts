// ============================================================
// MODULE 5: Free Features — src/lib/modules/free-features.ts
// ============================================================
// Intent Layer Intents handled:
//   ACCESS_FREE_FEATURE — check + grant access to a free feature
//   CHECK_FEATURE_GATE  — return gate status without consuming
//   CONSUME_FREE_TRIAL  — burn one trial use of a premium feature
//
// Feature Registry:
//   songs_free          — unlimited free demo songs
//   tts_trial           — 3 premium TTS uses per day
//   camera_basic        — basic face detection (always free)
//   gaze_basic          — gaze estimation (always free)
//   dashboard           — engagement dashboard (always free)
//   mini_games          — rhythm/clap games (always free)
//   song_library        — replay library (always free)
//   elevenlabs_trial    — 3 ElevenLabs uses per day (premium trial)
//   ai_lyrics           — 2 lyric generations per day (free)
//   rewards_xp          — XP + rewards system (always free)
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';

export interface FeatureDefinition {
  feature_id: string;
  label: string;
  description: string;
  tier: 'always_free' | 'daily_limited' | 'premium_trial' | 'premium_only';
  daily_limit?: number;    // undefined = unlimited
  requires_plan?: string;  // 'basic' | 'premium' — null = always free
  icon: string;
}

// ── Feature Registry ──────────────────────────────────────────
export const FEATURE_REGISTRY: Record<string, FeatureDefinition> = {
  songs_free: {
    feature_id: 'songs_free',
    label: 'Free Songs',
    description: 'Play and enjoy demo music for your child',
    tier: 'always_free',
    icon: '🎵',
  },
  tts_basic: {
    feature_id: 'tts_basic',
    label: 'Basic Voice (OpenAI)',
    description: 'Warm AI voice — 50 uses per day free',
    tier: 'daily_limited',
    daily_limit: 50,
    icon: '🎤',
  },
  tts_premium_trial: {
    feature_id: 'tts_premium_trial',
    label: 'Premium Voice Trial (ElevenLabs)',
    description: 'Experience ultra-expressive Rachel voice — 3 free daily',
    tier: 'premium_trial',
    daily_limit: 3,
    icon: '✨',
  },
  camera_basic: {
    feature_id: 'camera_basic',
    label: 'Camera & Face Detection',
    description: 'Smile and engagement tracking',
    tier: 'always_free',
    icon: '📷',
  },
  gaze_basic: {
    feature_id: 'gaze_basic',
    label: 'Gaze Tracking',
    description: 'Screen attention monitoring',
    tier: 'always_free',
    icon: '👁',
  },
  dashboard: {
    feature_id: 'dashboard',
    label: 'Engagement Dashboard',
    description: 'View your child\'s music engagement stats',
    tier: 'always_free',
    icon: '📊',
  },
  mini_games: {
    feature_id: 'mini_games',
    label: 'Mini Games',
    description: 'Rhythm tap, clap-along, music memory games',
    tier: 'always_free',
    icon: '🎮',
  },
  song_library: {
    feature_id: 'song_library',
    label: 'Song Library',
    description: 'Replay any previously generated song for free',
    tier: 'always_free',
    icon: '📚',
  },
  ai_lyrics: {
    feature_id: 'ai_lyrics',
    label: 'AI Lyric Generation',
    description: 'Generate custom song lyrics — 5 per day free',
    tier: 'daily_limited',
    daily_limit: 5,
    icon: '📝',
  },
  rewards_xp: {
    feature_id: 'rewards_xp',
    label: 'Rewards & XP',
    description: 'Earn XP and unlock badges',
    tier: 'always_free',
    icon: '🏆',
  },
  creator_mode: {
    feature_id: 'creator_mode',
    label: 'Creator Mode',
    description: 'Create and share original songs',
    tier: 'always_free',
    icon: '🎨',
  },
  ai_music_gen: {
    feature_id: 'ai_music_gen',
    label: 'AI Music Generation',
    description: 'Real AI-generated music via Replicate/Suno',
    tier: 'premium_only',
    requires_plan: 'basic',
    icon: '🤖',
  },
  elevenlabs_premium: {
    feature_id: 'elevenlabs_premium',
    label: 'Premium ElevenLabs Voice (Unlimited)',
    description: 'Unlimited Rachel/custom ElevenLabs voice',
    tier: 'premium_only',
    requires_plan: 'premium',
    icon: '💎',
  },
};

async function getDailyUses(db: any, userId: string, featureId: string): Promise<number> {
  const r = await db.prepare(
    `SELECT COUNT(*) as cnt FROM feature_usage_log
     WHERE user_id = ? AND feature_id = ? AND DATE(used_at) = DATE('now')`
  ).bind(userId, featureId).first();
  return r?.cnt ?? 0;
}

async function recordUse(db: any, userId: string, childId: number | undefined, featureId: string): Promise<void> {
  await db.prepare(
    `INSERT INTO feature_usage_log (user_id, child_id, feature_id) VALUES (?, ?, ?)`
  ).bind(userId ?? 'demo', childId ?? null, featureId).run();
}

// ── Free Features Module ──────────────────────────────────────
export class FreeFeaturesModule implements IntentModule {
  handles = ['ACCESS_FREE_FEATURE', 'CHECK_FEATURE_GATE', 'CONSUME_FREE_TRIAL'] as any[];

  async handle(payload: IntentPayload, env: any, db: any): Promise<IntentResult> {
    switch (payload.intent) {

      // ── ACCESS_FREE_FEATURE ─────────────────────────────────
      case 'ACCESS_FREE_FEATURE': {
        const { feature_id, plan } = payload.data as { feature_id: string; plan?: string };
        const userId = payload.userId ?? 'demo';
        const feature = FEATURE_REGISTRY[feature_id];

        if (!feature) {
          return { success: false, intent: 'ACCESS_FREE_FEATURE', error: `Unknown feature: ${feature_id}` };
        }

        // Always free — grant immediately
        if (feature.tier === 'always_free') {
          return { success: true, intent: 'ACCESS_FREE_FEATURE', data: { granted: true, feature, remaining: null } };
        }

        // Premium only — check plan
        if (feature.tier === 'premium_only') {
          const hasPlan = plan === feature.requires_plan || plan === 'premium';
          if (!hasPlan) {
            return { success: false, intent: 'ACCESS_FREE_FEATURE',
              data: { granted: false, reason: 'requires_plan', requires_plan: feature.requires_plan, feature } };
          }
          return { success: true, intent: 'ACCESS_FREE_FEATURE', data: { granted: true, feature, remaining: null } };
        }

        // Daily limited / premium trial — check quota
        const used = await getDailyUses(db, userId, feature_id);
        const limit = feature.daily_limit ?? 999999;

        if (used >= limit) {
          return { success: false, intent: 'ACCESS_FREE_FEATURE',
            data: { granted: false, reason: 'daily_limit_reached', used, limit, remaining: 0, feature } };
        }

        // Grant and record use
        await recordUse(db, userId, payload.childId, feature_id);

        return { success: true, intent: 'ACCESS_FREE_FEATURE',
          data: { granted: true, feature, used: used + 1, limit, remaining: limit - used - 1 } };
      }

      // ── CHECK_FEATURE_GATE ──────────────────────────────────
      case 'CHECK_FEATURE_GATE': {
        const { feature_id, plan } = payload.data as { feature_id: string; plan?: string };
        const userId = payload.userId ?? 'demo';
        const feature = FEATURE_REGISTRY[feature_id];

        if (!feature) {
          return { success: false, intent: 'CHECK_FEATURE_GATE', error: `Unknown feature: ${feature_id}` };
        }

        if (feature.tier === 'always_free') {
          return { success: true, intent: 'CHECK_FEATURE_GATE', data: { available: true, feature, remaining: null } };
        }

        if (feature.tier === 'premium_only') {
          const available = plan === feature.requires_plan || plan === 'premium';
          return { success: true, intent: 'CHECK_FEATURE_GATE', data: { available, feature, requires_plan: feature.requires_plan } };
        }

        const used = await getDailyUses(db, userId, feature_id);
        const limit = feature.daily_limit ?? 999999;
        return { success: true, intent: 'CHECK_FEATURE_GATE',
          data: { available: used < limit, feature, used, limit, remaining: Math.max(0, limit - used) } };
      }

      // ── CONSUME_FREE_TRIAL ──────────────────────────────────
      case 'CONSUME_FREE_TRIAL': {
        const { feature_id } = payload.data as { feature_id: string };
        const userId = payload.userId ?? 'demo';
        const feature = FEATURE_REGISTRY[feature_id];

        if (!feature || !feature.daily_limit) {
          return { success: false, intent: 'CONSUME_FREE_TRIAL', error: 'Feature not trial-limited' };
        }

        const used = await getDailyUses(db, userId, feature_id);
        if (used >= feature.daily_limit) {
          return { success: false, intent: 'CONSUME_FREE_TRIAL',
            data: { consumed: false, reason: 'exhausted', remaining: 0 } };
        }

        await recordUse(db, userId, payload.childId, feature_id);
        return { success: true, intent: 'CONSUME_FREE_TRIAL',
          data: { consumed: true, used: used + 1, remaining: feature.daily_limit - used - 1 } };
      }

      default:
        return { success: false, intent: payload.intent as any, error: 'Unknown intent' };
    }
  }

  // ── Static helper: get all features with gating info ─────────
  static async getAllFeatureStatus(
    db: any, userId: string, plan: string
  ): Promise<Array<FeatureDefinition & { available: boolean; used?: number; remaining?: number }>> {
    const result = [];
    for (const feature of Object.values(FEATURE_REGISTRY)) {
      if (feature.tier === 'always_free') {
        result.push({ ...feature, available: true });
      } else if (feature.tier === 'premium_only') {
        const available = plan === feature.requires_plan || plan === 'premium';
        result.push({ ...feature, available });
      } else {
        const used = await getDailyUses(db, userId, feature.feature_id);
        const limit = feature.daily_limit ?? 0;
        result.push({ ...feature, available: used < limit, used, remaining: Math.max(0, limit - used) });
      }
    }
    return result;
  }
}
