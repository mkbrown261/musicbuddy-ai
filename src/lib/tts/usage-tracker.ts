// ============================================================
// TTS Usage Tracker Module
// src/lib/tts/usage-tracker.ts
// ============================================================
// Tracks:
//   - Per-user daily usage per provider (free limits)
//   - Per-user lifetime premium trial usage
//   - Billing trigger events (trial exhaustion, upgrade prompts)
//   - Cost unit accumulation for budget monitoring
//
// ARCHITECTURAL RULE: This module only writes to the DB and
// returns structured data. It never calls providers directly.
// All decisions based on usage data are made by VoiceRouter.
// ============================================================

import type { UsageRecord, VoiceTier, TTSProvider } from './types';

// ── Limit constants ───────────────────────────────────────────
export const LIMITS = {
  FREE_OPENAI_DAILY:       50,    // OpenAI TTS calls per day (free tier)
  FREE_POLLY_DAILY:       200,    // Polly calls per day (fallback tier)
  TRIAL_ELEVENLABS_TOTAL:  15,    // Lifetime ElevenLabs uses (trial)
  TRIAL_ELEVENLABS_DAILY:   5,    // Daily cap within trial period
  PREMIUM_DAILY_CAP:      500,    // Soft cap to prevent abuse
  COST_BUDGET_DAILY:        1.0,  // $1/day max generation budget per account
} as const;

// ── Log a usage event ─────────────────────────────────────────
export async function logUsage(
  db: D1Database,
  record: UsageRecord & { sessionId?: number }
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO tts_usage_log
         (user_id, child_id, session_id, provider, voice_id, char_count,
          tier, cache_hit, cost_units, latency_ms, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      record.userId ?? 'demo',
      record.childId ?? null,
      record.sessionId ?? null,
      record.provider,
      record.voiceId,
      record.charCount,
      record.tier,
      record.cacheHit ? 1 : 0,
      record.costUnits ?? 0,
      record.latencyMs ?? null,
      record.error ?? null
    ).run();

    // If ElevenLabs was used: increment lifetime trial counter
    if (record.provider === 'elevenlabs' && !record.cacheHit) {
      await incrementTrialCounter(db, record.userId);
    }
  } catch (e) {
    console.error('[UsageTracker] logUsage error:', e);
  }
}

// ── Get today's usage for a user+provider ─────────────────────
export async function getDailyUsage(
  db: D1Database,
  userId: string,
  provider: TTSProvider
): Promise<number> {
  try {
    const r = await db.prepare(
      `SELECT COUNT(*) as cnt FROM tts_usage_log
       WHERE user_id = ? AND provider = ?
         AND DATE(used_at) = DATE('now')
         AND cache_hit = 0`
    ).bind(userId, provider).first() as any;
    return r?.cnt ?? 0;
  } catch { return 0; }
}

// ── Get today's total cost units ──────────────────────────────
export async function getDailyCostUnits(
  db: D1Database,
  userId: string
): Promise<number> {
  try {
    const r = await db.prepare(
      `SELECT SUM(cost_units) as total FROM tts_usage_log
       WHERE user_id = ? AND DATE(used_at) = DATE('now') AND cache_hit = 0`
    ).bind(userId).first() as any;
    return r?.total ?? 0;
  } catch { return 0; }
}

// ── Get trial usage state for a user ─────────────────────────
export async function getTrialState(
  db: D1Database,
  userId: string
): Promise<{
  active: boolean;
  totalUsed: number;
  limit: number;
  remaining: number;
  dailyUsed: number;
  dailyLimit: number;
}> {
  try {
    // Ensure trial record exists
    await db.prepare(
      `INSERT OR IGNORE INTO tts_trial_usage (user_id) VALUES (?)`
    ).bind(userId).run();

    const row = await db.prepare(
      `SELECT elevenlabs_total, trial_limit, trial_active FROM tts_trial_usage WHERE user_id = ?`
    ).bind(userId).first() as any;

    const totalUsed  = row?.elevenlabs_total ?? 0;
    const limit      = row?.trial_limit ?? LIMITS.TRIAL_ELEVENLABS_TOTAL;
    const remaining  = Math.max(0, limit - totalUsed);
    const active     = (row?.trial_active ?? 1) === 1 && remaining > 0;
    const dailyUsed  = await getDailyUsage(db, userId, 'elevenlabs');

    return {
      active,
      totalUsed,
      limit,
      remaining,
      dailyUsed,
      dailyLimit: LIMITS.TRIAL_ELEVENLABS_DAILY,
    };
  } catch { return { active: false, totalUsed: 0, limit: LIMITS.TRIAL_ELEVENLABS_TOTAL, remaining: 0, dailyUsed: 0, dailyLimit: LIMITS.TRIAL_ELEVENLABS_DAILY }; }
}

// ── Increment lifetime trial counter ─────────────────────────
async function incrementTrialCounter(db: D1Database, userId: string): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO tts_trial_usage (user_id, elevenlabs_total) VALUES (?, 1)
       ON CONFLICT(user_id) DO UPDATE SET elevenlabs_total = elevenlabs_total + 1`
    ).bind(userId).run();
  } catch (e) {
    console.error('[UsageTracker] incrementTrialCounter error:', e);
  }
}

// ── Record a billing event ────────────────────────────────────
export async function recordBillingEvent(
  db: D1Database,
  userId: string,
  eventType: 'trial_exhausted' | 'quota_exceeded' | 'upgrade_prompted' | 'fallback_triggered',
  detail?: string,
  tierBefore?: VoiceTier,
  tierAfter?: VoiceTier,
  provider?: TTSProvider
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO tts_billing_events (user_id, event_type, provider, tier_before, tier_after, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(userId, eventType, provider ?? null, tierBefore ?? null, tierAfter ?? null, detail ?? null).run();
  } catch (e) {
    console.error('[UsageTracker] recordBillingEvent error:', e);
  }
}

// ── Full quota status for a user ──────────────────────────────
export async function getQuotaStatus(
  db: D1Database,
  userId: string,
  hasElevenLabsKey: boolean,
  hasOpenAIKey: boolean,
  hasPollyCredentials: boolean
): Promise<{
  openai:      { used: number; limit: number; remaining: number; available: boolean };
  elevenlabs:  { used: number; limit: number; remaining: number; available: boolean; trial: ReturnType<typeof getTrialState> extends Promise<infer T> ? T : never };
  polly:       { used: number; limit: number; remaining: number; available: boolean };
  costToday:   number;
  budgetLimit: number;
  budgetRemaining: number;
}> {
  const [openaiUsed, pollyUsed, trialState, costToday] = await Promise.all([
    getDailyUsage(db, userId, 'openai'),
    getDailyUsage(db, userId, 'polly'),
    getTrialState(db, userId),
    getDailyCostUnits(db, userId),
  ]);

  const elUsed = trialState.dailyUsed;

  return {
    openai: {
      used:       openaiUsed,
      limit:      LIMITS.FREE_OPENAI_DAILY,
      remaining:  Math.max(0, LIMITS.FREE_OPENAI_DAILY - openaiUsed),
      available:  hasOpenAIKey && openaiUsed < LIMITS.FREE_OPENAI_DAILY,
    },
    elevenlabs: {
      used:      elUsed,
      limit:     LIMITS.TRIAL_ELEVENLABS_DAILY,
      remaining: Math.max(0, LIMITS.TRIAL_ELEVENLABS_DAILY - elUsed),
      available: hasElevenLabsKey && trialState.active && elUsed < LIMITS.TRIAL_ELEVENLABS_DAILY,
      trial:     trialState as any,
    },
    polly: {
      used:      pollyUsed,
      limit:     LIMITS.FREE_POLLY_DAILY,
      remaining: Math.max(0, LIMITS.FREE_POLLY_DAILY - pollyUsed),
      available: hasPollyCredentials && pollyUsed < LIMITS.FREE_POLLY_DAILY,
    },
    costToday,
    budgetLimit:     LIMITS.COST_BUDGET_DAILY,
    budgetRemaining: Math.max(0, LIMITS.COST_BUDGET_DAILY - costToday),
  };
}

// ── Get voice preferences for a user ─────────────────────────
export async function getVoicePreferences(
  db: D1Database,
  userId: string
): Promise<{
  preferredProvider: string;
  openaiVoice: string;
  elevenlabsVoice: string;
  pollyVoice: string;
  speed: number;
  defaultEmotion: string;
  singingMode: boolean;
} | null> {
  try {
    const row = await db.prepare(
      `SELECT * FROM tts_voice_preferences WHERE user_id = ?`
    ).bind(userId).first() as any;
    if (!row) return null;
    return {
      preferredProvider: row.preferred_provider,
      openaiVoice:       row.openai_voice,
      elevenlabsVoice:   row.elevenlabs_voice,
      pollyVoice:        row.polly_voice,
      speed:             row.speed,
      defaultEmotion:    row.default_emotion,
      singingMode:       row.singing_mode === 1,
    };
  } catch { return null; }
}

// ── Save voice preferences ────────────────────────────────────
export async function saveVoicePreferences(
  db: D1Database,
  userId: string,
  prefs: {
    preferredProvider?: string;
    openaiVoice?: string;
    elevenlabsVoice?: string;
    pollyVoice?: string;
    speed?: number;
    defaultEmotion?: string;
    singingMode?: boolean;
  }
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO tts_voice_preferences
         (user_id, preferred_provider, openai_voice, elevenlabs_voice, polly_voice,
          speed, default_emotion, singing_mode, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         preferred_provider = COALESCE(excluded.preferred_provider, preferred_provider),
         openai_voice       = COALESCE(excluded.openai_voice, openai_voice),
         elevenlabs_voice   = COALESCE(excluded.elevenlabs_voice, elevenlabs_voice),
         polly_voice        = COALESCE(excluded.polly_voice, polly_voice),
         speed              = COALESCE(excluded.speed, speed),
         default_emotion    = COALESCE(excluded.default_emotion, default_emotion),
         singing_mode       = COALESCE(excluded.singing_mode, singing_mode),
         updated_at         = CURRENT_TIMESTAMP`
    ).bind(
      userId,
      prefs.preferredProvider ?? null,
      prefs.openaiVoice ?? null,
      prefs.elevenlabsVoice ?? null,
      prefs.pollyVoice ?? null,
      prefs.speed ?? null,
      prefs.defaultEmotion ?? null,
      prefs.singingMode != null ? (prefs.singingMode ? 1 : 0) : null
    ).run();
  } catch (e) {
    console.error('[UsageTracker] saveVoicePreferences error:', e);
  }
}
