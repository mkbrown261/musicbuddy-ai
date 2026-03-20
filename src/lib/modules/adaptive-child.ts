// ============================================================
// MODULE: Adaptive Child Engine
// src/lib/modules/adaptive-child.ts
// ============================================================
// Handles ALL age/personality/emotion/game/usage logic.
// Every public function is reachable ONLY through IntentLayer.
//
// Intents handled:
//   GET_AGE_PROFILE        — age group config (speech, games, style)
//   GENERATE_ADAPTIVE_BEHAVIOR — Groq + age + personality + emotion merged
//   GET_AGE_GAMES          — games list for this age group
//   APPLY_PERSONALITY      — personality settings for a user
//   UPDATE_EMOTION_STATE   — update emotion from engagement metrics
//   CHECK_USAGE_LIMIT      — check persistent usage limit
//   TRACK_USAGE            — record one use of a feature
//   GET_USAGE_SUMMARY      — all feature usage for a user
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type AgeGroup = 'infant' | 'toddler' | 'early_learning' | 'advanced';
export type PersonalityType = 'energetic' | 'calm' | 'playful' | 'nurturing' | 'teacher';
export type EmotionState = 'happy' | 'excited' | 'proud' | 'encouraging' | 'concerned' | 'neutral';
export type GameId =
  // infant
  | 'clap_game' | 'peekaboo' | 'sound_imitation' | 'color_flash' | 'gentle_bounce'
  // toddler
  | 'counting_game' | 'repeat_after_me' | 'animal_sounds' | 'simple_matching' | 'call_response'
  // early_learning
  | 'math_mini' | 'spelling_game' | 'pattern_match' | 'memory_cards' | 'rhythm_match'
  // advanced
  | 'music_quiz' | 'logic_rhythm' | 'story_song' | 'beat_maker' | 'lyric_fill';

export interface AgeProfile {
  group: AgeGroup;
  label: string;
  ageRange: string;
  speechStyle: {
    speed: 'very_slow' | 'slow' | 'normal' | 'conversational';
    pitch: 'very_high' | 'high' | 'medium' | 'normal';
    repetition: boolean;
    exaggeration: boolean;
    sentenceLength: 'single_word' | 'short' | 'medium' | 'full';
  };
  ttsEmotion: string;
  ttsStyle: string;
  groqInstructions: string;
  freeGames: GameId[];
  maxSentenceWords: number;
  preferredTone: string;
}

export interface PersonalityConfig {
  type: PersonalityType;
  label: string;
  toneDescriptor: string;
  energyMultiplier: number;    // 0.5–2.0
  stabilityOverride?: number;
  styleBoostOverride?: number;
  examplePhrase: string;
  groqPersonalityHint: string;
}

export interface EmotionConfig {
  state: EmotionState;
  ttsEmotion: string;
  stabilityOverride: number;
  styleBoostOverride: number;
  groqHint: string;
}

export interface GameDefinition {
  id: GameId;
  label: string;
  emoji: string;
  description: string;
  ageGroups: AgeGroup[];
  isFree: boolean;
  minAge: number;
  instructions: string;
  type: 'voice' | 'tap' | 'visual' | 'listen';
}

export interface UsageLimit {
  featureId: string;
  label: string;
  freeLimit: number;         // -1 = unlimited
  periodHours: number;       // 24 = daily, 0 = lifetime, 168 = weekly
  requiresPlan?: string;
}

// ─────────────────────────────────────────────────────────────
// AGE PROFILES
// ─────────────────────────────────────────────────────────────

export const AGE_PROFILES: Record<AgeGroup, AgeProfile> = {
  infant: {
    group: 'infant',
    label: 'Baby',
    ageRange: '0–2',
    speechStyle: {
      speed: 'very_slow',
      pitch: 'very_high',
      repetition: true,
      exaggeration: true,
      sentenceLength: 'single_word',
    },
    ttsEmotion: 'calm',
    ttsStyle: 'children_host',
    groqInstructions: `You are speaking to an infant (0-2 years).
Use 1-3 word phrases only. Repeat key words. Use musical, sing-song delivery.
Examples: "Hello baby! Hello! Yes! Good baby! Clap clap! Clap clap!"
Never use complex sentences. Pure sensory engagement only.`,
    freeGames: ['clap_game', 'peekaboo', 'sound_imitation', 'color_flash', 'gentle_bounce'],
    maxSentenceWords: 5,
    preferredTone: 'warm',
  },
  toddler: {
    group: 'toddler',
    label: 'Toddler',
    ageRange: '3–5',
    speechStyle: {
      speed: 'slow',
      pitch: 'high',
      repetition: true,
      exaggeration: true,
      sentenceLength: 'short',
    },
    ttsEmotion: 'excited',
    ttsStyle: 'children_host',
    groqInstructions: `You are speaking to a toddler (3-5 years).
Use short, energetic sentences (5-8 words max). Use lots of call-and-response.
Be enthusiastic! Ask simple yes/no questions. Use their name often.
Examples: "WOW! Can you clap with me? CLAP CLAP! You did it! AMAZING!"
Focus on repetition, rhythm, and excitement.`,
    freeGames: ['counting_game', 'repeat_after_me', 'animal_sounds', 'simple_matching', 'call_response'],
    maxSentenceWords: 10,
    preferredTone: 'excited',
  },
  early_learning: {
    group: 'early_learning',
    label: 'Early Learner',
    ageRange: '6–8',
    speechStyle: {
      speed: 'normal',
      pitch: 'medium',
      repetition: false,
      exaggeration: false,
      sentenceLength: 'medium',
    },
    ttsEmotion: 'encouraging',
    ttsStyle: 'children_host',
    groqInstructions: `You are speaking to a child aged 6-8.
Use guided learning style. Ask thinking questions. Reward effort with specific praise.
Medium sentences (8-12 words). Teach concepts interactively.
Examples: "Great job! Can you figure out what comes next in the pattern?"
Balance fun with gentle learning. Celebrate thinking, not just answers.`,
    freeGames: ['math_mini', 'spelling_game', 'pattern_match', 'memory_cards', 'rhythm_match'],
    maxSentenceWords: 15,
    preferredTone: 'encouraging',
  },
  advanced: {
    group: 'advanced',
    label: 'Advanced',
    ageRange: '9+',
    speechStyle: {
      speed: 'conversational',
      pitch: 'normal',
      repetition: false,
      exaggeration: false,
      sentenceLength: 'full',
    },
    ttsEmotion: 'friendly',
    ttsStyle: 'children_host',
    groqInstructions: `You are speaking to a child aged 9+.
Use conversational, peer-like tone. Less exaggeration. Give them autonomy.
Full sentences. Challenge them. Ask open questions. Respect their intelligence.
Examples: "That was a tricky rhythm — how did you figure it out? Want to try a harder one?"`,
    freeGames: ['music_quiz', 'logic_rhythm', 'story_song', 'beat_maker', 'lyric_fill'],
    maxSentenceWords: 25,
    preferredTone: 'friendly',
  },
};

export function getAgeGroup(age: number): AgeGroup {
  if (age <= 2) return 'infant';
  if (age <= 5) return 'toddler';
  if (age <= 8) return 'early_learning';
  return 'advanced';
}

// ─────────────────────────────────────────────────────────────
// PERSONALITY CONFIGS
// ─────────────────────────────────────────────────────────────

export const PERSONALITIES: Record<PersonalityType, PersonalityConfig> = {
  energetic: {
    type: 'energetic',
    label: '⚡ Energetic',
    toneDescriptor: 'explosive, super-excited, CAPS, triple exclamation',
    energyMultiplier: 2.0,
    stabilityOverride: 0.25,
    styleBoostOverride: 0.95,
    examplePhrase: 'WOW!!! That was AMAZING!! Let\'s do it AGAIN!!!',
    groqPersonalityHint: 'Be EXTREMELY energetic! Use caps, triple exclamation points, lots of energy words like AMAZING, WOW, INCREDIBLE. Make everything feel like the most exciting thing ever!',
  },
  calm: {
    type: 'calm',
    label: '😌 Calm',
    toneDescriptor: 'gentle, slow, soft, reassuring ellipses',
    energyMultiplier: 0.5,
    stabilityOverride: 0.70,
    styleBoostOverride: 0.20,
    examplePhrase: 'That was really nice… let\'s try again together 😊',
    groqPersonalityHint: 'Be gentle, slow, and reassuring. Use soft language, gentle pauses (ellipses), and a nurturing tone. Never use exclamation points. Speak quietly and warmly.',
  },
  playful: {
    type: 'playful',
    label: '🎉 Playful',
    toneDescriptor: 'silly, fun, jokes, giggles, rhymes',
    energyMultiplier: 1.5,
    stabilityOverride: 0.30,
    styleBoostOverride: 0.85,
    examplePhrase: 'Ooooh la la! You are SO silly! Tee hee hee! 🎵',
    groqPersonalityHint: 'Be silly and playful! Use rhymes, funny sounds, giggle words. Make jokes appropriate for children. Use "tee hee", "oops", "whoopsie", fun sound effects in text.',
  },
  nurturing: {
    type: 'nurturing',
    label: '💖 Nurturing',
    toneDescriptor: 'warm, loving, supportive, motherly/fatherly',
    energyMultiplier: 0.8,
    stabilityOverride: 0.55,
    styleBoostOverride: 0.45,
    examplePhrase: 'I am so proud of you, sweetheart. You are doing beautifully.',
    groqPersonalityHint: 'Be deeply nurturing and loving. Use warm, supportive language. Emphasize how proud you are. Be encouraging when they struggle. Use endearments like "sweetheart", "superstar".',
  },
  teacher: {
    type: 'teacher',
    label: '🎓 Teacher',
    toneDescriptor: 'educational, structured, question-based, praise specific efforts',
    energyMultiplier: 1.0,
    stabilityOverride: 0.50,
    styleBoostOverride: 0.60,
    examplePhrase: 'Excellent thinking! Now, can you tell me what comes next?',
    groqPersonalityHint: 'Be an engaged, curious teacher. Ask guided questions. Praise specific efforts, not just outcomes. Explain concepts clearly. Build on what they already know.',
  },
};

// ─────────────────────────────────────────────────────────────
// EMOTION CONFIGS
// ─────────────────────────────────────────────────────────────

export const EMOTION_CONFIGS: Record<EmotionState, EmotionConfig> = {
  happy: {
    state: 'happy',
    ttsEmotion: 'friendly',
    stabilityOverride: 0.40,
    styleBoostOverride: 0.65,
    groqHint: 'The child seems happy and engaged. Match their positive energy.',
  },
  excited: {
    state: 'excited',
    ttsEmotion: 'excited',
    stabilityOverride: 0.28,
    styleBoostOverride: 0.90,
    groqHint: 'The child is excited! Amplify their excitement with celebration and energy.',
  },
  proud: {
    state: 'proud',
    ttsEmotion: 'excited',
    stabilityOverride: 0.35,
    styleBoostOverride: 0.75,
    groqHint: 'The child just accomplished something. Celebrate their achievement specifically.',
  },
  encouraging: {
    state: 'encouraging',
    ttsEmotion: 'encouraging',
    stabilityOverride: 0.45,
    styleBoostOverride: 0.55,
    groqHint: 'The child needs encouragement. Be warm and supportive.',
  },
  concerned: {
    state: 'concerned',
    ttsEmotion: 'calm',
    stabilityOverride: 0.65,
    styleBoostOverride: 0.30,
    groqHint: 'The child seems disengaged or distracted. Gently re-engage with something new and interesting.',
  },
  neutral: {
    state: 'neutral',
    ttsEmotion: 'friendly',
    stabilityOverride: 0.45,
    styleBoostOverride: 0.55,
    groqHint: 'Neutral engagement. Maintain steady, warm interaction.',
  },
};

export function detectEmotionFromMetrics(metrics: {
  smileCount: number;
  laughCount: number;
  attentionLoss: number;
  engScore: number;
  voiceDetected: boolean;
}): EmotionState {
  const { smileCount, laughCount, attentionLoss, engScore, voiceDetected } = metrics;
  if (laughCount > 3) return 'excited';
  if (smileCount > 5) return 'happy';
  if (voiceDetected && engScore > 60) return 'proud';
  if (attentionLoss > 3 || engScore < 25) return 'concerned';
  if (engScore > 50) return 'happy';
  if (voiceDetected) return 'encouraging';
  return 'neutral';
}

// ─────────────────────────────────────────────────────────────
// GAME DEFINITIONS
// ─────────────────────────────────────────────────────────────

export const GAME_DEFINITIONS: Record<GameId, GameDefinition> = {
  // INFANT (0-2)
  clap_game: {
    id: 'clap_game', label: 'Clap With Me!', emoji: '👏', ageGroups: ['infant'],
    description: 'Clap along to a simple beat', isFree: true, minAge: 0,
    instructions: 'Watch and clap along! Clap clap clap!', type: 'tap',
  },
  peekaboo: {
    id: 'peekaboo', label: 'Peekaboo!', emoji: '🙈', ageGroups: ['infant'],
    description: 'Classic peek-a-boo with sounds', isFree: true, minAge: 0,
    instructions: 'Where am I? PEEKABOO! There I am!', type: 'visual',
  },
  sound_imitation: {
    id: 'sound_imitation', label: 'Copy That Sound!', emoji: '🔊', ageGroups: ['infant'],
    description: 'Listen and make the same sound', isFree: true, minAge: 1,
    instructions: 'I make a sound, you make it too!', type: 'voice',
  },
  color_flash: {
    id: 'color_flash', label: 'Color Flash!', emoji: '🌈', ageGroups: ['infant'],
    description: 'Bright colors with cheerful sounds', isFree: true, minAge: 0,
    instructions: 'Watch the pretty colors dance!', type: 'visual',
  },
  gentle_bounce: {
    id: 'gentle_bounce', label: 'Bouncy Time!', emoji: '🎈', ageGroups: ['infant'],
    description: 'Gentle bouncing to music', isFree: true, minAge: 0,
    instructions: 'Bounce bounce bounce to the beat!', type: 'visual',
  },
  // TODDLER (3-5)
  counting_game: {
    id: 'counting_game', label: 'Count With Me!', emoji: '🔢', ageGroups: ['toddler'],
    description: 'Count objects to a beat', isFree: true, minAge: 3,
    instructions: 'Let\'s count together! One, two, THREE!', type: 'voice',
  },
  repeat_after_me: {
    id: 'repeat_after_me', label: 'Repeat After Me!', emoji: '🎤', ageGroups: ['toddler', 'early_learning'],
    description: 'Echo back phrases and sounds', isFree: true, minAge: 3,
    instructions: 'I say it, then YOU say it back!', type: 'voice',
  },
  animal_sounds: {
    id: 'animal_sounds', label: 'Animal Sounds!', emoji: '🐾', ageGroups: ['toddler'],
    description: 'Guess and make animal sounds', isFree: true, minAge: 2,
    instructions: 'What does a cow say? MOO! Your turn!', type: 'voice',
  },
  simple_matching: {
    id: 'simple_matching', label: 'Match It!', emoji: '🃏', ageGroups: ['toddler'],
    description: 'Match sounds or colors', isFree: true, minAge: 3,
    instructions: 'Find the matching one! Tap when you see it!', type: 'tap',
  },
  call_response: {
    id: 'call_response', label: 'Call & Response!', emoji: '🎵', ageGroups: ['toddler', 'early_learning'],
    description: 'Musical call and response singing', isFree: true, minAge: 3,
    instructions: 'I sing, you sing back! La la LA!', type: 'voice',
  },
  // EARLY LEARNING (6-8)
  math_mini: {
    id: 'math_mini', label: 'Music Math!', emoji: '🎼', ageGroups: ['early_learning'],
    description: 'Count beats and solve patterns', isFree: true, minAge: 6,
    instructions: 'How many beats did you hear? Count them!', type: 'voice',
  },
  spelling_game: {
    id: 'spelling_game', label: 'Spell It Out!', emoji: '🔤', ageGroups: ['early_learning'],
    description: 'Spell music words to a beat', isFree: true, minAge: 6,
    instructions: 'Spell it out loud with the beat!', type: 'voice',
  },
  pattern_match: {
    id: 'pattern_match', label: 'Pattern Power!', emoji: '🎯', ageGroups: ['early_learning'],
    description: 'Identify rhythm patterns', isFree: true, minAge: 6,
    instructions: 'Listen to the pattern. What comes next?', type: 'tap',
  },
  memory_cards: {
    id: 'memory_cards', label: 'Sound Memory!', emoji: '🧠', ageGroups: ['early_learning'],
    description: 'Remember and match sounds', isFree: true, minAge: 6,
    instructions: 'Listen carefully, then find the match!', type: 'tap',
  },
  rhythm_match: {
    id: 'rhythm_match', label: 'Match the Rhythm!', emoji: '🥁', ageGroups: ['early_learning', 'advanced'],
    description: 'Tap the rhythm you heard', isFree: true, minAge: 6,
    instructions: 'Hear the rhythm, then tap it back!', type: 'tap',
  },
  // ADVANCED (9+)
  music_quiz: {
    id: 'music_quiz', label: 'Music Quiz!', emoji: '🎓', ageGroups: ['advanced'],
    description: 'Answer music knowledge questions', isFree: true, minAge: 9,
    instructions: 'Test your music knowledge!', type: 'voice',
  },
  logic_rhythm: {
    id: 'logic_rhythm', label: 'Logic Beats!', emoji: '🧩', ageGroups: ['advanced'],
    description: 'Complex rhythm logic puzzles', isFree: true, minAge: 9,
    instructions: 'Solve the rhythm puzzle!', type: 'tap',
  },
  story_song: {
    id: 'story_song', label: 'Story Song!', emoji: '📖', ageGroups: ['advanced'],
    description: 'Build a story through music', isFree: true, minAge: 9,
    instructions: 'Continue the musical story!', type: 'voice',
  },
  beat_maker: {
    id: 'beat_maker', label: 'Beat Maker!', emoji: '🎛️', ageGroups: ['advanced'],
    description: 'Create your own beat pattern', isFree: true, minAge: 9,
    instructions: 'Build your own beat — tap the pads!', type: 'tap',
  },
  lyric_fill: {
    id: 'lyric_fill', label: 'Fill The Lyric!', emoji: '✍️', ageGroups: ['advanced'],
    description: 'Complete the song lyric', isFree: true, minAge: 9,
    instructions: 'What word comes next in the song?', type: 'voice',
  },
};

// ─────────────────────────────────────────────────────────────
// USAGE LIMITS — persistent across sessions
// ─────────────────────────────────────────────────────────────

export const USAGE_LIMITS: Record<string, UsageLimit> = {
  songs_per_day: {
    featureId: 'songs_per_day',
    label: 'Daily Songs',
    freeLimit: 5,
    periodHours: 24,
  },
  premium_voice: {
    featureId: 'premium_voice',
    label: 'Premium Voice (ElevenLabs)',
    freeLimit: 5,
    periodHours: 24,
  },
  tts_basic: {
    featureId: 'tts_basic',
    label: 'Basic Voice (OpenAI)',
    freeLimit: 50,
    periodHours: 24,
  },
  games_free: {
    featureId: 'games_free',
    label: 'Free Games',
    freeLimit: -1,  // unlimited
    periodHours: 0,
  },
  ai_behavior: {
    featureId: 'ai_behavior',
    label: 'AI Behavior (Groq)',
    freeLimit: 30,
    periodHours: 24,
  },
};

async function getUsageCount(db: any, userId: string, featureId: string, periodHours: number): Promise<number> {
  if (!db) return 0;
  try {
    if (periodHours <= 0) {
      // lifetime
      const row = await db.prepare(
        `SELECT COUNT(*) as cnt FROM adaptive_usage WHERE user_id=? AND feature_id=?`
      ).bind(userId, featureId).first();
      return (row as any)?.cnt ?? 0;
    }
    const since = new Date(Date.now() - periodHours * 3600 * 1000).toISOString();
    const row = await db.prepare(
      `SELECT COUNT(*) as cnt FROM adaptive_usage WHERE user_id=? AND feature_id=? AND used_at > ?`
    ).bind(userId, featureId, since).first();
    return (row as any)?.cnt ?? 0;
  } catch { return 0; }
}

async function recordUsage(db: any, userId: string, featureId: string, childId?: number): Promise<void> {
  if (!db) return;
  try {
    await db.prepare(
      `INSERT INTO adaptive_usage (user_id, child_id, feature_id, used_at) VALUES (?,?,?,?)`
    ).bind(userId, childId ?? null, featureId, new Date().toISOString()).run();
  } catch { /* silently ignore */ }
}

// ─────────────────────────────────────────────────────────────
// THE MODULE
// ─────────────────────────────────────────────────────────────

export class AdaptiveChildModule implements IntentModule {
  handles = [
    'GET_AGE_PROFILE',
    'GENERATE_ADAPTIVE_BEHAVIOR',
    'GET_AGE_GAMES',
    'APPLY_PERSONALITY',
    'UPDATE_EMOTION_STATE',
    'CHECK_USAGE_LIMIT',
    'TRACK_USAGE',
    'GET_USAGE_SUMMARY',
    // Engagement state persistence
    'SAVE_ENGAGEMENT_STATE',
    'LOAD_ENGAGEMENT_STATE',
    // Personality preference persistence
    'SAVE_PERSONALITY_PREF',
    'LOAD_PERSONALITY_PREF',
    // Full session state (voice + personality + emotion + usage)
    'GET_FULL_SESSION_STATE',
  ] as any[];

  async handle(payload: IntentPayload, env: any, db: any): Promise<IntentResult> {
    switch (payload.intent as string) {

      // ─────────────────────────────────────────────────────
      // GET_AGE_PROFILE — return full age config for a given age
      // Input: { age: number }
      // ─────────────────────────────────────────────────────
      case 'GET_AGE_PROFILE': {
        const { age } = payload.data as { age: number };
        const group = getAgeGroup(age ?? 5);
        const profile = AGE_PROFILES[group];
        return {
          success: true,
          intent: payload.intent as any,
          data: { profile, group, availablePersonalities: Object.values(PERSONALITIES) },
        };
      }

      // ─────────────────────────────────────────────────────
      // GENERATE_ADAPTIVE_BEHAVIOR
      // Merges age profile + personality + emotion into a Groq prompt
      // Input: { age, personalityType, emotionState, context, engagementMetrics }
      // ─────────────────────────────────────────────────────
      case 'GENERATE_ADAPTIVE_BEHAVIOR': {
        const d = payload.data as {
          age: number;
          personalityType?: PersonalityType;
          emotionState?: EmotionState;
          engagementMetrics?: {
            smileCount: number;
            laughCount: number;
            attentionLoss: number;
            engScore: number;
            voiceDetected: boolean;
          };
          childName?: string;
          trigger?: string;
          currentMode?: string;
        };

        const age = d.age ?? 5;
        const group = getAgeGroup(age);
        const profile = AGE_PROFILES[group];
        const personality = PERSONALITIES[d.personalityType ?? 'playful'];

        // Auto-detect emotion from metrics if not provided
        const emotionState: EmotionState = d.emotionState ??
          (d.engagementMetrics ? detectEmotionFromMetrics(d.engagementMetrics) : 'neutral');
        const emotion = EMOTION_CONFIGS[emotionState];

        // Build merged TTS config
        const ttsConfig = {
          emotion: emotion.ttsEmotion,
          stability: emotion.stabilityOverride * (personality.stabilityOverride ?? 1),
          styleBoost: Math.min(1, emotion.styleBoostOverride + (personality.styleBoostOverride ?? 0) * 0.2),
          style: profile.ttsStyle,
        };

        // Build enriched Groq context
        const adaptedContext = {
          ageGroup: group,
          ageProfile: profile.label,
          childName: d.childName ?? 'friend',
          personality: personality.type,
          emotionState,
          ttsConfig,
          groqSystemHint: [
            profile.groqInstructions,
            personality.groqPersonalityHint,
            emotion.groqHint,
            `Max ${profile.maxSentenceWords} words per sentence.`,
            `Preferred tone: ${profile.preferredTone}.`,
          ].join('\n\n'),
        };

        return {
          success: true,
          intent: payload.intent as any,
          data: {
            adaptedContext,
            ttsConfig,
            profile,
            personality,
            emotion: emotionState,
            emotionConfig: emotion,
            recommendedGames: profile.freeGames.slice(0, 3),
          },
        };
      }

      // ─────────────────────────────────────────────────────
      // GET_AGE_GAMES — return games for age group
      // Input: { age: number, all?: boolean }
      // ─────────────────────────────────────────────────────
      case 'GET_AGE_GAMES': {
        const { age, all } = payload.data as { age: number; all?: boolean };
        const group = getAgeGroup(age ?? 5);
        const profile = AGE_PROFILES[group];

        const games = profile.freeGames.map(id => GAME_DEFINITIONS[id]).filter(Boolean);

        // If 'all' requested, also include adjacent age group games
        let bonusGames: GameDefinition[] = [];
        if (all) {
          bonusGames = Object.values(GAME_DEFINITIONS)
            .filter(g => g.ageGroups.includes(group) && !profile.freeGames.includes(g.id));
        }

        return {
          success: true,
          intent: payload.intent as any,
          data: {
            ageGroup: group,
            ageLabel: profile.label,
            games,
            bonusGames,
            totalFree: games.length,
          },
        };
      }

      // ─────────────────────────────────────────────────────
      // APPLY_PERSONALITY — get personality config
      // Input: { personalityType: PersonalityType }
      // ─────────────────────────────────────────────────────
      case 'APPLY_PERSONALITY': {
        const { personalityType } = payload.data as { personalityType: PersonalityType };
        const personality = PERSONALITIES[personalityType ?? 'playful'];
        return {
          success: true,
          intent: payload.intent as any,
          data: {
            personality,
            ttsAdjustments: {
              stability: personality.stabilityOverride,
              styleBoost: personality.styleBoostOverride,
            },
            allPersonalities: Object.values(PERSONALITIES),
          },
        };
      }

      // ─────────────────────────────────────────────────────
      // UPDATE_EMOTION_STATE — detect emotion from engagement
      // Input: { smileCount, laughCount, attentionLoss, engScore, voiceDetected }
      // ─────────────────────────────────────────────────────
      case 'UPDATE_EMOTION_STATE': {
        const metrics = payload.data as {
          smileCount: number;
          laughCount: number;
          attentionLoss: number;
          engScore: number;
          voiceDetected: boolean;
        };
        const emotionState = detectEmotionFromMetrics(metrics);
        const emotionConfig = EMOTION_CONFIGS[emotionState];
        return {
          success: true,
          intent: payload.intent as any,
          data: { emotionState, emotionConfig },
        };
      }

      // ─────────────────────────────────────────────────────
      // CHECK_USAGE_LIMIT — check if feature has uses left
      // Input: { featureId: string }
      // Returns: { allowed, used, limit, remaining, periodHours }
      // ─────────────────────────────────────────────────────
      case 'CHECK_USAGE_LIMIT': {
        const { featureId } = payload.data as { featureId: string };
        const userId = payload.userId ?? 'demo';
        const limit = USAGE_LIMITS[featureId];

        if (!limit) {
          return { success: true, intent: payload.intent as any, data: { allowed: true, unlimited: true } };
        }

        if (limit.freeLimit === -1) {
          return { success: true, intent: payload.intent as any, data: { allowed: true, unlimited: true, featureId } };
        }

        const used = await getUsageCount(db, userId, featureId, limit.periodHours);
        const allowed = used < limit.freeLimit;
        const remaining = Math.max(0, limit.freeLimit - used);

        return {
          success: true,
          intent: payload.intent as any,
          data: {
            featureId,
            allowed,
            used,
            limit: limit.freeLimit,
            remaining,
            periodHours: limit.periodHours,
            label: limit.label,
          },
        };
      }

      // ─────────────────────────────────────────────────────
      // TRACK_USAGE — record one use, returns updated remaining
      // Input: { featureId: string }
      // ─────────────────────────────────────────────────────
      case 'TRACK_USAGE': {
        const { featureId } = payload.data as { featureId: string };
        const userId = payload.userId ?? 'demo';
        const limit = USAGE_LIMITS[featureId];

        if (!limit || limit.freeLimit === -1) {
          return { success: true, intent: payload.intent as any, data: { tracked: false, unlimited: true } };
        }

        await recordUsage(db, userId, featureId, payload.childId);
        const used = await getUsageCount(db, userId, featureId, limit.periodHours);
        const remaining = Math.max(0, limit.freeLimit - used);

        return {
          success: true,
          intent: payload.intent as any,
          data: {
            tracked: true,
            featureId,
            used,
            limit: limit.freeLimit,
            remaining,
            exhausted: remaining === 0,
          },
        };
      }

      // ─────────────────────────────────────────────────────
      // GET_USAGE_SUMMARY — all features for a user
      // Input: {}
      // ─────────────────────────────────────────────────────
      case 'GET_USAGE_SUMMARY': {
        const userId = payload.userId ?? 'demo';
        const summary: Record<string, any> = {};

        for (const [featureId, limit] of Object.entries(USAGE_LIMITS)) {
          if (limit.freeLimit === -1) {
            summary[featureId] = { allowed: true, unlimited: true, label: limit.label };
          } else {
            const used = await getUsageCount(db, userId, featureId, limit.periodHours);
            const remaining = Math.max(0, limit.freeLimit - used);
            summary[featureId] = {
              label: limit.label,
              used,
              limit: limit.freeLimit,
              remaining,
              allowed: used < limit.freeLimit,
              periodHours: limit.periodHours,
            };
          }
        }

        return {
          success: true,
          intent: payload.intent as any,
          data: { userId, summary },
        };
      }

      // ─────────────────────────────────────────────────────
      // SAVE_ENGAGEMENT_STATE — persist engagement + emotion across restarts
      // Input: { emotion, personality, smileCount, laughCount, attentionLoss,
      //          engScore, voiceDetected, currentSong?, currentGame?, lastResponse? }
      // ─────────────────────────────────────────────────────
      case 'SAVE_ENGAGEMENT_STATE': {
        if (!db) return { success: true, intent: payload.intent as any, data: { saved: false, reason: 'no-db' } };
        const d = payload.data as any;
        const userId = payload.userId ?? 'demo';
        const childId = payload.childId ?? -1;
        try {
          await db.prepare(`
            INSERT INTO engagement_state
              (user_id, child_id, session_id, emotion, personality, smile_count, laugh_count,
               attention_loss, eng_score, voice_detected, current_song, current_game, last_response, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
            ON CONFLICT(user_id, child_id) DO UPDATE SET
              session_id=excluded.session_id, emotion=excluded.emotion,
              personality=excluded.personality, smile_count=excluded.smile_count,
              laugh_count=excluded.laugh_count, attention_loss=excluded.attention_loss,
              eng_score=excluded.eng_score, voice_detected=excluded.voice_detected,
              current_song=excluded.current_song, current_game=excluded.current_game,
              last_response=excluded.last_response, updated_at=excluded.updated_at
          `).bind(
            userId, childId, payload.sessionId ?? null,
            d.emotion ?? 'neutral', d.personality ?? 'playful',
            d.smileCount ?? 0, d.laughCount ?? 0,
            d.attentionLoss ?? 0, d.engScore ?? 0,
            d.voiceDetected ? 1 : 0,
            d.currentSong ?? null, d.currentGame ?? null, d.lastResponse ?? null
          ).run();
          return { success: true, intent: payload.intent as any, data: { saved: true } };
        } catch (e: any) {
          return { success: false, intent: payload.intent as any, error: e?.message };
        }
      }

      // ─────────────────────────────────────────────────────
      // LOAD_ENGAGEMENT_STATE — restore engagement state after restart
      // ─────────────────────────────────────────────────────
      case 'LOAD_ENGAGEMENT_STATE': {
        if (!db) return { success: true, intent: payload.intent as any, data: { found: false } };
        const userId = payload.userId ?? 'demo';
        const childId = payload.childId ?? -1;
        try {
          const row = await db.prepare(
            `SELECT * FROM engagement_state WHERE user_id=? AND child_id=? LIMIT 1`
          ).bind(userId, childId).first() as any;
          if (!row) return { success: true, intent: payload.intent as any, data: { found: false } };
          return {
            success: true, intent: payload.intent as any,
            data: {
              found: true,
              emotion: row.emotion ?? 'neutral',
              personality: row.personality ?? 'playful',
              smileCount: row.smile_count ?? 0,
              laughCount: row.laugh_count ?? 0,
              attentionLoss: row.attention_loss ?? 0,
              engScore: row.eng_score ?? 0,
              voiceDetected: !!row.voice_detected,
              currentSong: row.current_song ?? null,
              currentGame: row.current_game ?? null,
              lastResponse: row.last_response ?? null,
              updatedAt: row.updated_at,
            },
          };
        } catch {
          return { success: true, intent: payload.intent as any, data: { found: false } };
        }
      }

      // ─────────────────────────────────────────────────────
      // SAVE_PERSONALITY_PREF — persist personality choice
      // Input: { personality: PersonalityType }
      // ─────────────────────────────────────────────────────
      case 'SAVE_PERSONALITY_PREF': {
        if (!db) return { success: true, intent: payload.intent as any, data: { saved: false } };
        const d = payload.data as { personality: PersonalityType };
        const userId = payload.userId ?? 'demo';
        const childId = payload.childId ?? -1;
        try {
          await db.prepare(`
            INSERT INTO personality_prefs (user_id, child_id, personality, updated_at)
            VALUES (?,?,?,datetime('now'))
            ON CONFLICT(user_id, child_id) DO UPDATE SET
              personality=excluded.personality, updated_at=excluded.updated_at
          `).bind(userId, childId, d.personality ?? 'playful').run();
          return { success: true, intent: payload.intent as any, data: { saved: true, personality: d.personality } };
        } catch (e: any) {
          return { success: false, intent: payload.intent as any, error: e?.message };
        }
      }

      // ─────────────────────────────────────────────────────
      // LOAD_PERSONALITY_PREF — restore personality choice
      // ─────────────────────────────────────────────────────
      case 'LOAD_PERSONALITY_PREF': {
        if (!db) return { success: true, intent: payload.intent as any, data: { personality: 'playful', found: false } };
        const userId = payload.userId ?? 'demo';
        const childId = payload.childId ?? -1;
        try {
          const row = await db.prepare(
            `SELECT personality FROM personality_prefs WHERE user_id=? AND child_id=? LIMIT 1`
          ).bind(userId, childId).first() as any;
          return {
            success: true, intent: payload.intent as any,
            data: { personality: row?.personality ?? 'playful', found: !!row },
          };
        } catch {
          return { success: true, intent: payload.intent as any, data: { personality: 'playful', found: false } };
        }
      }

      // ─────────────────────────────────────────────────────
      // GET_FULL_SESSION_STATE — load everything needed to restore a session
      // Returns: engagement_state + personality_pref + usage summary
      // ─────────────────────────────────────────────────────
      case 'GET_FULL_SESSION_STATE': {
        const userId = payload.userId ?? 'demo';
        const childId = payload.childId ?? -1;

        // Load engagement state
        let engState: any = { found: false, emotion: 'neutral', personality: 'playful', engScore: 0 };
        let personalityPref = 'playful';
        const usageSummary: Record<string, any> = {};

        if (db) {
          try {
            const engRow = await db.prepare(
              `SELECT * FROM engagement_state WHERE user_id=? AND child_id=? LIMIT 1`
            ).bind(userId, childId).first() as any;
            if (engRow) {
              engState = {
                found: true,
                emotion: engRow.emotion, personality: engRow.personality,
                smileCount: engRow.smile_count, laughCount: engRow.laugh_count,
                attentionLoss: engRow.attention_loss, engScore: engRow.eng_score,
                voiceDetected: !!engRow.voice_detected,
                currentSong: engRow.current_song, currentGame: engRow.current_game,
              };
              personalityPref = engRow.personality ?? 'playful';
            }
          } catch { /* ignore */ }

          try {
            const pRow = await db.prepare(
              `SELECT personality FROM personality_prefs WHERE user_id=? AND child_id=? LIMIT 1`
            ).bind(userId, childId).first() as any;
            if (pRow) personalityPref = pRow.personality ?? 'playful';
          } catch { /* ignore */ }

          // Build usage summary
          for (const [featureId, limit] of Object.entries(USAGE_LIMITS)) {
            if (limit.freeLimit === -1) {
              usageSummary[featureId] = { allowed: true, unlimited: true, label: limit.label };
            } else {
              const used = await getUsageCount(db, userId, featureId, limit.periodHours);
              const remaining = Math.max(0, limit.freeLimit - used);
              usageSummary[featureId] = {
                label: limit.label, used, limit: limit.freeLimit,
                remaining, allowed: used < limit.freeLimit, periodHours: limit.periodHours,
              };
            }
          }
        }

        return {
          success: true,
          intent: payload.intent as any,
          data: {
            engagementState: engState,
            personality: personalityPref,
            usageSummary,
            availablePersonalities: Object.values(PERSONALITIES),
            emotionConfig: EMOTION_CONFIGS[engState.emotion as EmotionState] ?? EMOTION_CONFIGS.neutral,
          },
        };
      }

      default:
        return { success: false, intent: payload.intent as any, error: `Unknown adaptive intent: ${payload.intent}` };
    }
  }
}
