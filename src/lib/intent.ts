// ============================================================
// INTENT LAYER — src/lib/intent.ts
// ============================================================
// ARCHITECTURAL RULE (non-negotiable):
//   ALL intelligence and decision-making lives here.
//   The Action Layer (routes, playAudio, speakText) is NEVER
//   modified by this layer — it only RECEIVES typed Intent objects.
//
// Data flow:
//   INPUT (engagement events, child profile, shared intelligence)
//   → IntentEngine.decide()
//   → Intent object
//   → Action Layer executes it unchanged
// ============================================================

import type { AdaptiveProfile, ChildProfile } from '../types';

// ── Age group classifier ──────────────────────────────────────
export function getAgeGroup(age: number): string {
  if (age <= 2) return '0-2';
  if (age <= 5) return '3-5';
  if (age <= 8) return '6-8';
  return '9-12';
}

// ── Typed Intent objects ──────────────────────────────────────
export interface Intent {
  action: 'talk' | 'sing' | 'wait' | 'group_engage' | 'predict_play';
  tts_text: string;
  music_style: string;
  music_tempo: string;
  music_mood: string;
  energy_level: 'low' | 'medium' | 'high';
  use_preloaded: boolean;
  social_cue: string | null;          // "3 kids your age love this!" etc.
  predicted_next_style: string | null; // predictive play
  strategy_key: string;               // for shared learning feedback
  reason: string;
  confidence: number;                 // 0–1: how confident this decision is
}

// ── Shared Intelligence snapshot (anonymized) ─────────────────
export interface SharedIntelligence {
  age_group: string;
  top_styles: Record<string, number>;
  top_tempos: Record<string, number>;
  effective_strategies: Record<string, number>;
  engagement_patterns: Record<string, number>;
  total_sessions_aggregated: number;
}

// ── Child context fed into the Intent Engine ─────────────────
export interface ChildContext {
  profile: ChildProfile;
  adaptive: AdaptiveProfile | null;
  recentEngagement: {
    hasSmile: boolean;
    hasLaughter: boolean;
    hasFixation: boolean;
    hasAttentionLoss: boolean;
    avgIntensity: number;
    dominantEvent: string | null;
  };
  sessionActive: boolean;
  screenTimeMinutes: number;
  consecutiveSongs: number;
  lastAction: 'talk' | 'sing' | 'wait' | null;
  timeSinceLastActionMs: number;
  engagementScore: number;           // 0–100
}

// ══════════════════════════════════════════════════════════════
// INTENT ENGINE
// ══════════════════════════════════════════════════════════════
export class IntentEngine {
  private static readonly MIN_GAP_MS = 1500;
  private static readonly TALK_COMPLETE_MS = 3500;
  private static readonly SONG_COMPLETE_MS = 22000;

  /**
   * Core decision function.
   * Combines individual child data + shared intelligence → Intent.
   * Never touches the Action Layer.
   */
  static decide(
    ctx: ChildContext,
    shared: SharedIntelligence | null,
    trigger: string = 'auto'
  ): Intent {
    const { profile, adaptive, recentEngagement: eng } = ctx;
    const ageGroup = getAgeGroup(profile.age);

    // ── Safety: screen time ────────────────────────────────
    if (ctx.screenTimeMinutes >= profile.screen_time_limit * 0.9) {
      return this.buildIntent('talk', ctx, shared, {
        tts_text: `${profile.name}, we have been playing for a while! One last song for today!`,
        strategy_key: 'screen_time_warning',
        reason: 'Screen time limit approaching',
        confidence: 1.0,
      });
    }

    // ── Too soon since last action ────────────────────────
    if (ctx.timeSinceLastActionMs < this.MIN_GAP_MS) {
      return this.waitIntent('Too soon since last action');
    }

    // ── Session just started: greet ───────────────────────
    if (ctx.lastAction === null) {
      return this.buildIntent('talk', ctx, shared, {
        tts_text: this.pickGreeting(profile.name),
        strategy_key: 'greeting',
        reason: 'Session start',
        confidence: 1.0,
      });
    }

    // ── Still in talk phase, hasn't completed ─────────────
    if (ctx.lastAction === 'talk' && ctx.timeSinceLastActionMs < this.TALK_COMPLETE_MS) {
      return this.waitIntent('Talk still completing');
    }

    // ── Song still playing ────────────────────────────────
    if (ctx.lastAction === 'sing' && ctx.timeSinceLastActionMs < this.SONG_COMPLETE_MS) {
      return this.waitIntent('Song still playing');
    }

    // ── Determine best music strategy ─────────────────────
    const style = this.pickBestStyle(ctx, shared);
    const tempo = this.pickBestTempo(ctx, shared);
    const energyLevel = this.computeEnergy(ctx);
    const mood = energyLevel === 'high' ? 'energetic'
               : energyLevel === 'low'  ? 'calm' : 'happy';

    // ── After talk → sing ─────────────────────────────────
    if (ctx.lastAction === 'talk') {
      const transText = this.pickTransition(profile.name, energyLevel);
      return this.buildIntent('sing', ctx, shared, {
        tts_text: transText,
        music_style: style,
        music_tempo: tempo,
        music_mood: mood,
        energy_level: energyLevel,
        strategy_key: 'talk_to_sing',
        reason: 'Natural talk→sing cycle',
        confidence: 0.9,
        social_cue: this.buildSocialCue(ageGroup, style, shared),
        predicted_next_style: this.predictNextStyle(ctx, shared),
      });
    }

    // ── After sing → determine response ───────────────────
    if (ctx.lastAction === 'sing') {
      // High joy + under 2 consecutive songs → positive loop
      if (eng.hasLaughter && eng.avgIntensity > 0.7 && ctx.consecutiveSongs < 2) {
        return this.buildIntent('talk', ctx, shared, {
          tts_text: this.pickJoyResponse(profile.name),
          strategy_key: 'joy_positive_loop',
          reason: 'High joy detected — reinforcing',
          confidence: 0.95,
        });
      }

      // Attention lost → re-engage
      if (eng.hasAttentionLoss) {
        return this.buildIntent('talk', ctx, shared, {
          tts_text: this.pickReengage(profile.name),
          strategy_key: 'reengage_attention_loss',
          reason: 'Attention loss — re-engaging',
          confidence: 0.85,
        });
      }

      // Normal: after song → talk
      const afterText = eng.hasSmile
        ? this.pickJoyResponse(profile.name)
        : this.pickAfterSong(profile.name);

      return this.buildIntent('talk', ctx, shared, {
        tts_text: afterText,
        strategy_key: 'normal_post_song',
        reason: 'Natural sing→talk cycle',
        confidence: 0.8,
      });
    }

    // ── Idle: check for engagement cues ───────────────────
    if (eng.hasFixation || eng.hasSmile) {
      return this.buildIntent('sing', ctx, shared, {
        tts_text: this.pickTransition(profile.name, energyLevel),
        music_style: style,
        music_tempo: tempo,
        music_mood: mood,
        energy_level: energyLevel,
        strategy_key: 'engagement_triggered',
        reason: 'Engagement cue detected',
        confidence: 0.85,
        social_cue: this.buildSocialCue(ageGroup, style, shared),
        predicted_next_style: this.predictNextStyle(ctx, shared),
      });
    }

    // ── Idle too long ─────────────────────────────────────
    if (ctx.timeSinceLastActionMs > 12000) {
      return this.buildIntent('talk', ctx, shared, {
        tts_text: this.pickReengage(profile.name),
        strategy_key: 'idle_reengage',
        reason: 'Idle too long',
        confidence: 0.7,
      });
    }

    return this.waitIntent('Awaiting engagement');
  }

  // ── Style picker: individual first, shared fallback ──────────
  static pickBestStyle(ctx: ChildContext, shared: SharedIntelligence | null): string {
    // 1. Individual adaptive data (strongest signal)
    if (ctx.adaptive?.favorite_styles) {
      try {
        const styles: Record<string, number> = JSON.parse(ctx.adaptive.favorite_styles);
        const best = Object.entries(styles).sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 1) return best[0]; // needs at least 2 reinforcements
      } catch {}
    }
    // 2. Shared intelligence fallback (cross-child wisdom)
    if (shared?.top_styles) {
      const best = Object.entries(shared.top_styles).sort((a, b) => b[1] - a[1])[0];
      if (best) return best[0];
    }
    // 3. Profile default
    return ctx.profile.preferred_style || 'playful';
  }

  static pickBestTempo(ctx: ChildContext, shared: SharedIntelligence | null): string {
    if (ctx.adaptive?.favorite_tempos) {
      try {
        const tempos: Record<string, number> = JSON.parse(ctx.adaptive.favorite_tempos);
        const best = Object.entries(tempos).sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 1) return best[0];
      } catch {}
    }
    if (shared?.top_tempos) {
      const best = Object.entries(shared.top_tempos).sort((a, b) => b[1] - a[1])[0];
      if (best) return best[0];
    }
    return 'medium';
  }

  // ── Energy computation ────────────────────────────────────
  static computeEnergy(ctx: ChildContext): 'low' | 'medium' | 'high' {
    if (ctx.engagementScore >= 70) return 'high';
    if (ctx.engagementScore >= 35) return 'medium';
    return 'low';
  }

  // ── Social cue builder (anonymized — no PII) ─────────────
  static buildSocialCue(
    ageGroup: string,
    style: string,
    shared: SharedIntelligence | null
  ): string | null {
    if (!shared || shared.total_sessions_aggregated < 5) return null;
    const topStyle = Object.entries(shared.top_styles || {})
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!topStyle || topStyle !== style) return null;
    const ageLabel = ageGroup === '3-5' ? '3 to 5' : ageGroup === '6-8' ? '6 to 8' : 'your age';
    return `Kids ages ${ageLabel} love this style right now!`;
  }

  // ── Predictive play: what will the child want next? ───────
  static predictNextStyle(
    ctx: ChildContext,
    shared: SharedIntelligence | null
  ): string | null {
    // After high-engagement song → predict similar style
    if (ctx.recentEngagement.hasLaughter || ctx.recentEngagement.hasSmile) {
      return this.pickBestStyle(ctx, shared); // more of the same
    }
    // After attention loss → predict novelty (different style)
    if (ctx.recentEngagement.hasAttentionLoss) {
      const styles = ['playful', 'upbeat', 'lullaby', 'energetic', 'classical'];
      const current = this.pickBestStyle(ctx, shared);
      return styles.find(s => s !== current) || 'upbeat';
    }
    return null;
  }

  // ── Text pools ────────────────────────────────────────────
  private static pickGreeting(name: string): string {
    const opts = [
      `Hi ${name}! Ready to play and sing some songs today?`,
      `Hey there, ${name}! Let's have some music fun!`,
      `Yaaayyy, ${name} is here! Time for music magic!`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  private static pickTransition(name: string, energy: string): string {
    const high = [
      `Ready ${name}? Here we GO!`,
      `One, two, three, let's go ${name}!`,
      `Get those dancing feet ready ${name}!`,
    ];
    const normal = [
      `Okay ${name}, get ready... the music is starting!`,
      `Listen carefully ${name}! This one is super special!`,
      `Here we go!`,
    ];
    const low = [
      `Ready ${name}? Something gentle for you...`,
      `Let's listen to this together, ${name}.`,
    ];
    const pool = energy === 'high' ? high : energy === 'low' ? low : normal;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private static pickAfterSong(name: string): string {
    const opts = [
      `You liked that one, huh ${name}? Let's try another!`,
      `Woohoo! That was so fun! Ready for more?`,
      `Great listening, ${name}! Did that make you want to dance?`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  private static pickJoyResponse(name: string): string {
    const opts = [
      `Yaaayyy! I can see you are loving this, ${name}! Keep smiling!`,
      `Look at you, ${name}! You are making me so happy too!`,
      `Your energy is incredible, ${name}! More music coming!`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  private static pickReengage(name: string): string {
    const opts = [
      `Hey ${name}, I have got something even more fun! Listen...`,
      `Psst, ${name}! Want to hear a really silly song?`,
      `Oh ${name}! I almost forgot — I have your favorite kind of song!`,
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // ── Intent builder helpers ────────────────────────────────
  private static buildIntent(
    action: Intent['action'],
    ctx: ChildContext,
    shared: SharedIntelligence | null,
    overrides: Partial<Intent>
  ): Intent {
    const style = overrides.music_style ?? this.pickBestStyle(ctx, shared);
    const tempo = overrides.music_tempo ?? this.pickBestTempo(ctx, shared);
    const energy = overrides.energy_level ?? this.computeEnergy(ctx);
    return {
      action,
      tts_text: overrides.tts_text ?? '',
      music_style: style,
      music_tempo: tempo,
      music_mood: overrides.music_mood ?? (energy === 'high' ? 'energetic' : 'happy'),
      energy_level: energy,
      use_preloaded: action === 'sing' && !!(ctx as any)._hasPreloaded,
      social_cue: overrides.social_cue ?? null,
      predicted_next_style: overrides.predicted_next_style ?? null,
      strategy_key: overrides.strategy_key ?? 'default',
      reason: overrides.reason ?? '',
      confidence: overrides.confidence ?? 0.7,
    };
  }

  private static waitIntent(reason: string): Intent {
    return {
      action: 'wait',
      tts_text: '',
      music_style: 'playful',
      music_tempo: 'medium',
      music_mood: 'happy',
      energy_level: 'medium',
      use_preloaded: false,
      social_cue: null,
      predicted_next_style: null,
      strategy_key: 'wait',
      reason,
      confidence: 1.0,
    };
  }

  // ── Shared intelligence updater ───────────────────────────
  // Call after every interaction to update the shared model.
  // NEVER includes child_id, name, or any PII.
  static buildSharedUpdate(
    ageGroup: string,
    style: string,
    tempo: string,
    engagementScore: number,
    strategyKey: string,
    currentShared: SharedIntelligence | null
  ): Partial<SharedIntelligence> {
    const weight = engagementScore > 0.7 ? 1.5
                 : engagementScore > 0.4 ? 1.0 : 0.6;

    const topStyles = { ...(currentShared?.top_styles ?? {}) };
    topStyles[style] = ((topStyles[style] ?? 0) + weight);

    const topTempos = { ...(currentShared?.top_tempos ?? {}) };
    topTempos[tempo] = ((topTempos[tempo] ?? 0) + weight);

    const strategies = { ...(currentShared?.effective_strategies ?? {}) };
    strategies[strategyKey] = ((strategies[strategyKey] ?? 0) + (engagementScore > 0.5 ? 1 : 0));

    const patterns = { ...(currentShared?.engagement_patterns ?? {}) };
    patterns[style] = parseFloat(
      (((patterns[style] ?? 0) * 0.8) + (engagementScore * 0.2)).toFixed(3)
    );

    return {
      age_group: ageGroup,
      top_styles: topStyles,
      top_tempos: topTempos,
      effective_strategies: strategies,
      engagement_patterns: patterns,
      total_sessions_aggregated: (currentShared?.total_sessions_aggregated ?? 0) + 1,
    };
  }
}
