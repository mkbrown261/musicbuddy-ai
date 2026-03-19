// ============================================================
// MODULE 4: Behavior Retention Loop — src/lib/modules/behavior-loop.ts
// ============================================================
// Intent Layer Intents handled:
//   APPLY_BEHAVIOR_LOOP     — decide next action based on engagement
//   ADAPT_BEHAVIOR          — update strategy weights after outcome
//   RECORD_BEHAVIOR_OUTCOME — persist strategy outcome for learning
//
// This module extends IntentEngine with:
//   • Session-persistent strategy scores
//   • Cross-session retention (survives restarts)
//   • Multi-modal adaptation (gaze + face + audio cues)
//   • Parent-controlled engagement limits
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';

export interface BehaviorContext {
  child_id: number;
  session_id?: number;
  engagement_score: number;     // 0–1
  smile_count: number;
  laughter_count: number;
  attention_loss_count: number;
  fixation_count: number;
  consecutive_songs: number;
  screen_time_minutes: number;
  screen_time_limit: number;
  last_action: 'talk' | 'sing' | 'wait' | null;
  last_action_ms_ago: number;
  preferred_style: string;
  child_name: string;
  child_age: number;
}

export interface BehaviorDecision {
  action: 'talk' | 'sing' | 'wait' | 'mini_game' | 'reward' | 'break_prompt';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  tts_text: string;
  style: string;
  tempo: string;
  energy_level: 'low' | 'medium' | 'high';
  strategy_key: string;
  reason: string;
  confidence: number;         // 0–1
  reward_trigger?: string;    // if action === 'reward'
  mini_game_type?: string;    // if action === 'mini_game'
}

// ── Strategy weights (tuned for children 0–12) ───────────────
const STRATEGIES: Record<string, {
  condition: (ctx: BehaviorContext) => boolean;
  weight: number;
  build: (ctx: BehaviorContext) => Partial<BehaviorDecision>;
}> = {
  screen_time_warning: {
    condition: ctx => ctx.screen_time_minutes >= ctx.screen_time_limit * 0.9,
    weight: 100,
    build: ctx => ({
      action: 'talk',
      priority: 'urgent',
      tts_text: `${ctx.child_name}, we have been playing for a while! Let's finish with one more fun song, okay?`,
      strategy_key: 'screen_time_warning',
      reason: 'Screen time limit approaching',
      confidence: 1.0,
    })
  },
  joy_positive_loop: {
    condition: ctx => ctx.laughter_count > 0 && ctx.engagement_score > 0.75 && ctx.consecutive_songs < 3,
    weight: 90,
    build: ctx => ({
      action: 'sing',
      priority: 'high',
      tts_text: pickFrom([
        `Haha ${ctx.child_name}! I can see you are loving this! Keep smiling!`,
        `Your smile is amazing, ${ctx.child_name}! More music coming!`,
        `Look at you go, ${ctx.child_name}! Another song just for you!`,
      ]),
      style: ctx.preferred_style,
      tempo: 'upbeat',
      energy_level: 'high',
      strategy_key: 'joy_positive_loop',
      confidence: 0.95,
    })
  },
  reengage_attention_loss: {
    condition: ctx => ctx.attention_loss_count > 0 && ctx.engagement_score < 0.3,
    weight: 85,
    build: ctx => ({
      action: 'talk',
      priority: 'high',
      tts_text: pickFrom([
        `Hey ${ctx.child_name}! I have got something extra special... want to see?`,
        `Psst, ${ctx.child_name}! Want to hear the silliest song ever?`,
        `${ctx.child_name}! Oh no, I almost forgot your FAVORITE song!`,
      ]),
      strategy_key: 'reengage_attention_loss',
      confidence: 0.85,
    })
  },
  mini_game_trigger: {
    condition: ctx => ctx.consecutive_songs >= 3 && ctx.engagement_score > 0.5,
    weight: 80,
    build: ctx => ({
      action: 'mini_game',
      priority: 'high',
      tts_text: `${ctx.child_name}, let's take a break and play a quick game!`,
      strategy_key: 'mini_game_trigger',
      confidence: 0.80,
      mini_game_type: 'rhythm_tap',
    })
  },
  reward_milestone: {
    condition: ctx => ctx.smile_count >= 5 && ctx.laughter_count >= 2,
    weight: 75,
    build: ctx => ({
      action: 'reward',
      priority: 'high',
      tts_text: `Wow ${ctx.child_name}! You are doing AMAZING! Here is a special reward!`,
      strategy_key: 'reward_milestone',
      confidence: 0.90,
      reward_trigger: 'high_engagement',
    })
  },
  idle_too_long: {
    condition: ctx => ctx.last_action_ms_ago > 15000 && ctx.last_action !== null,
    weight: 70,
    build: ctx => ({
      action: 'talk',
      priority: 'normal',
      tts_text: pickFrom([
        `Hey ${ctx.child_name}! Are you ready for another song?`,
        `${ctx.child_name}! I have been waiting for you! Let's play!`,
      ]),
      strategy_key: 'idle_reengage',
      confidence: 0.70,
    })
  },
  low_engagement_calm: {
    condition: ctx => ctx.engagement_score < 0.2,
    weight: 65,
    build: ctx => ({
      action: 'sing',
      priority: 'normal',
      tts_text: `${ctx.child_name}, here is a gentle song just for you...`,
      style: 'lullaby',
      tempo: 'slow',
      energy_level: 'low',
      strategy_key: 'low_energy_calm',
      confidence: 0.65,
    })
  },
  normal_cycle: {
    condition: () => true,  // always fires as fallback
    weight: 10,
    build: ctx => ({
      action: ctx.last_action === 'talk' ? 'sing' : 'talk',
      priority: 'normal',
      tts_text: ctx.last_action === 'talk'
        ? `Ready ${ctx.child_name}? Here comes the music!`
        : pickFrom([
            `Great job ${ctx.child_name}! Did you like that?`,
            `Yay! What did you think, ${ctx.child_name}?`,
          ]),
      strategy_key: 'normal_cycle',
      confidence: 0.60,
    })
  }
};

function pickFrom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickBestStrategy(ctx: BehaviorContext): typeof STRATEGIES[string] & { key: string } {
  let best: (typeof STRATEGIES[string] & { key: string }) | null = null;
  let bestWeight = -1;

  for (const [key, strategy] of Object.entries(STRATEGIES)) {
    if (strategy.condition(ctx) && strategy.weight > bestWeight) {
      bestWeight = strategy.weight;
      best = { ...strategy, key };
    }
  }

  return best!;
}

// ── Behavior Loop Module ──────────────────────────────────────
export class BehaviorLoopModule implements IntentModule {
  handles = ['APPLY_BEHAVIOR_LOOP', 'ADAPT_BEHAVIOR', 'RECORD_BEHAVIOR_OUTCOME'] as any[];

  async handle(payload: IntentPayload, _env: any, db: any): Promise<IntentResult> {
    switch (payload.intent) {

      // ── APPLY_BEHAVIOR_LOOP ─────────────────────────────────
      case 'APPLY_BEHAVIOR_LOOP': {
        const ctx = payload.data as BehaviorContext;

        // Load historical strategy performance
        const historyRow = await db.prepare(
          'SELECT strategy_data FROM behavior_strategies WHERE child_id = ?'
        ).bind(ctx.child_id).first();

        let strategyScores: Record<string, number> = {};
        if (historyRow?.strategy_data) {
          try { strategyScores = JSON.parse(historyRow.strategy_data); } catch {}
        }

        // Pick best strategy
        const best = pickBestStrategy(ctx);
        const parts = best.build(ctx);

        const decision: BehaviorDecision = {
          action: parts.action ?? 'wait',
          priority: parts.priority ?? 'normal',
          tts_text: parts.tts_text ?? '',
          style: parts.style ?? ctx.preferred_style ?? 'playful',
          tempo: parts.tempo ?? (ctx.engagement_score > 0.6 ? 'upbeat' : 'medium'),
          energy_level: parts.energy_level ?? (ctx.engagement_score > 0.6 ? 'high' : ctx.engagement_score > 0.3 ? 'medium' : 'low'),
          strategy_key: best.key,
          reason: parts.reason ?? best.key,
          confidence: parts.confidence ?? 0.5,
          reward_trigger: parts.reward_trigger,
          mini_game_type: parts.mini_game_type,
        };

        // Persist decision for outcome tracking
        await db.prepare(
          `INSERT INTO behavior_loop_log
             (child_id, session_id, strategy_key, action, engagement_score_at_decision)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(ctx.child_id, ctx.session_id ?? null, best.key, decision.action, ctx.engagement_score).run();

        return { success: true, intent: 'APPLY_BEHAVIOR_LOOP', data: decision };
      }

      // ── ADAPT_BEHAVIOR ──────────────────────────────────────
      case 'ADAPT_BEHAVIOR': {
        const d = payload.data as {
          child_id: number;
          strategy_key: string;
          outcome_score: number;  // 0–1 engagement after this strategy
        };

        const row = await db.prepare(
          'SELECT strategy_data FROM behavior_strategies WHERE child_id = ?'
        ).bind(d.child_id).first();

        let scores: Record<string, number> = {};
        if (row?.strategy_data) {
          try { scores = JSON.parse(row.strategy_data); } catch {}
        }

        // Exponential moving average: new = 0.7 * old + 0.3 * outcome
        const old = scores[d.strategy_key] ?? 0.5;
        scores[d.strategy_key] = parseFloat((old * 0.7 + d.outcome_score * 0.3).toFixed(3));

        await db.prepare(
          `INSERT INTO behavior_strategies (child_id, strategy_data)
           VALUES (?, ?)
           ON CONFLICT(child_id) DO UPDATE SET strategy_data = excluded.strategy_data, updated_at = CURRENT_TIMESTAMP`
        ).bind(d.child_id, JSON.stringify(scores)).run();

        return { success: true, intent: 'ADAPT_BEHAVIOR', data: { updated: true, scores } };
      }

      // ── RECORD_BEHAVIOR_OUTCOME ─────────────────────────────
      case 'RECORD_BEHAVIOR_OUTCOME': {
        const d = payload.data as {
          child_id: number; session_id?: number;
          strategy_key: string; action: string;
          pre_score: number; post_score: number;
        };

        const improvement = d.post_score - d.pre_score;

        await db.prepare(
          `UPDATE behavior_loop_log SET
             post_engagement_score = ?, improvement = ?, resolved_at = CURRENT_TIMESTAMP
           WHERE child_id = ? AND strategy_key = ? AND action = ?
           AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1`
        ).bind(d.post_score, improvement, d.child_id, d.strategy_key, d.action).run();

        return { success: true, intent: 'RECORD_BEHAVIOR_OUTCOME', data: { improvement } };
      }

      default:
        return { success: false, intent: payload.intent as any, error: 'Unknown intent' };
    }
  }
}
