// ============================================================
// Emotion Engine — src/lib/emotion/engine.ts
// ============================================================
// PHASE 2: MusicBuddy "Alive System"
//
// Pipeline position:
//   Input → Intent Detection → [EMOTION ENGINE] → Memory
//   → Personality (Groq) → Music → Voice (ElevenLabs) → Output
//
// Detects emotion from:
//   1. userText  — keyword / semantic analysis of what child said
//   2. engagement — smile/laugh/attention signals from camera
//   3. behaviorTone — from Groq cognitive layer
//
// Returns EmotionState used by:
//   - Groq personality.ts  (system prompt enrichment)
//   - TTS orchestrator     (voice_settings override)
//   - Music ambient engine (background vibe selection)
// ============================================================

// ── Emotion types ─────────────────────────────────────────────
export type EmotionLabel =
  | 'excited'   // high energy — celebration, song intro
  | 'happy'     // baseline joy — default children's host
  | 'calm'      // low energy — lullaby, wind-down, sleepy
  | 'comfort'   // child expressed sadness / frustration
  | 'curious'   // questioning, wondering, learning moment
  | 'surprised' // unexpected delight, hook moment
  | 'singing';  // active music participation mode

export interface EmotionState {
  label:       EmotionLabel;
  confidence:  number;        // 0–1
  source:      'text' | 'engagement' | 'tone' | 'combined' | 'fallback';
  ttsSettings: {
    stability:        number;
    similarity_boost: number;
    style:            number;
    use_speaker_boost: boolean;
    pacing:           'fast' | 'normal' | 'slow' | 'gentle';
  };
  musicVibe: MusicVibe;
}

export type MusicVibe =
  | 'upbeat'     // excited / happy
  | 'playful'    // curious / games
  | 'soothing'   // calm / lullaby
  | 'warm'       // comfort / support
  | 'celebratory'// winning / milestone
  | 'none';      // silence / no background music

// ── TTS settings per emotion ──────────────────────────────────
// These are the exact values from the Phase 2 spec, merged with
// our ElevenLabs knowledge of what sounds expressive to children.
const EMOTION_TTS: Record<EmotionLabel, EmotionState['ttsSettings']> = {
  excited:   { stability: 0.25, similarity_boost: 0.65, style: 1.0,  use_speaker_boost: true, pacing: 'fast'   },
  happy:     { stability: 0.30, similarity_boost: 0.60, style: 0.90, use_speaker_boost: true, pacing: 'normal' },
  calm:      { stability: 0.55, similarity_boost: 0.55, style: 0.50, use_speaker_boost: true, pacing: 'slow'   },
  comfort:   { stability: 0.45, similarity_boost: 0.60, style: 0.65, use_speaker_boost: true, pacing: 'gentle' },
  curious:   { stability: 0.35, similarity_boost: 0.60, style: 0.80, use_speaker_boost: true, pacing: 'normal' },
  surprised: { stability: 0.22, similarity_boost: 0.65, style: 1.0,  use_speaker_boost: true, pacing: 'fast'   },
  singing:   { stability: 0.35, similarity_boost: 0.60, style: 0.85, use_speaker_boost: true, pacing: 'normal' },
};

// ── Music vibe per emotion ────────────────────────────────────
const EMOTION_MUSIC: Record<EmotionLabel, MusicVibe> = {
  excited:   'upbeat',
  happy:     'playful',
  calm:      'soothing',
  comfort:   'warm',
  curious:   'playful',
  surprised: 'celebratory',
  singing:   'upbeat',
};

// ── Keyword detection (text → emotion) ───────────────────────
const KEYWORD_MAP: Array<{ words: string[]; emotion: EmotionLabel; weight: number }> = [
  { words: ['sad','cry','crying','bad','hurt','miss','lonely','scared','afraid','tired','boring'],   emotion: 'comfort',   weight: 0.9 },
  { words: ['sleep','sleepy','bed','night','quiet','calm','relax','slow','lullaby','peaceful'],      emotion: 'calm',      weight: 0.85 },
  { words: ['wow','amazing','yay','woohoo','awesome','best','love','happy','fun','excited','yess'],  emotion: 'excited',   weight: 0.85 },
  { words: ['sing','song','music','la','do re mi','melody','beat','rhythm','dance'],                 emotion: 'singing',   weight: 0.80 },
  { words: ['why','what','how','tell me','explain','i wonder','question','curious','show me'],       emotion: 'curious',   weight: 0.75 },
  { words: ['surprise','oh my','whoa','oh wow','no way','really','omg','unbelievable'],              emotion: 'surprised', weight: 0.80 },
];

// ── BehaviorTone → EmotionLabel map ──────────────────────────
const TONE_TO_EMOTION: Record<string, EmotionLabel> = {
  excited:      'excited',
  celebratory:  'excited',
  playful:      'happy',
  warm:         'happy',
  encouraging:  'happy',
  curious:      'curious',
  soothing:     'calm',
  gentle:       'calm',
};

// ── Engagement signal → emotion modifier ──────────────────────
interface EngagementSignals {
  smileCount?:    number;
  laughCount?:    number;
  attentionLoss?: number;
  intensity?:     number;   // 0–1
  voiceDetected?: boolean;
}

function emotionFromEngagement(eng: EngagementSignals): { emotion: EmotionLabel; confidence: number } | null {
  if (!eng) return null;

  const smiles  = eng.smileCount  ?? 0;
  const laughs  = eng.laughCount  ?? 0;
  const attnLoss= eng.attentionLoss ?? 0;
  const intens  = eng.intensity   ?? 0.5;

  // High positive signal → excited
  if (laughs >= 2 || (smiles >= 3 && intens > 0.7)) {
    return { emotion: 'excited', confidence: 0.85 };
  }
  // Low engagement → comfort (might be bored/frustrated)
  if (attnLoss >= 2 && intens < 0.3) {
    return { emotion: 'comfort', confidence: 0.70 };
  }
  // Moderate positive → happy
  if (smiles >= 1 || intens > 0.5) {
    return { emotion: 'happy', confidence: 0.65 };
  }
  return null;
}

// ── Main exported function ────────────────────────────────────
// Called by the Intent Layer. Combines all signals → one EmotionState.
export function detectEmotion(
  userText    = '',
  engagement?: EngagementSignals,
  behaviorTone?: string,
): EmotionState {
  const text = userText.toLowerCase().trim();

  // ── 1. Text keyword detection ─────────────────────────
  let textEmotion:  EmotionLabel | null = null;
  let textConfidence = 0;
  for (const entry of KEYWORD_MAP) {
    for (const word of entry.words) {
      if (text.includes(word)) {
        if (entry.weight > textConfidence) {
          textEmotion = entry.emotion;
          textConfidence = entry.weight;
        }
      }
    }
  }

  // ── 2. Engagement signals ─────────────────────────────
  const engResult = emotionFromEngagement(engagement ?? {});

  // ── 3. Behavior tone from Groq ────────────────────────
  const toneEmotion: EmotionLabel | null = behaviorTone
    ? (TONE_TO_EMOTION[behaviorTone] ?? null)
    : null;

  // ── 4. Combine: text > engagement > tone > fallback ───
  let finalEmotion: EmotionLabel;
  let finalConfidence: number;
  let source: EmotionState['source'];

  if (textEmotion && textConfidence >= 0.80) {
    // Strong keyword match wins
    finalEmotion    = textEmotion;
    finalConfidence = textConfidence;
    source          = 'text';
  } else if (textEmotion && engResult) {
    // Combine text + engagement
    finalEmotion    = textEmotion;
    finalConfidence = (textConfidence + engResult.confidence) / 2;
    source          = 'combined';
  } else if (textEmotion) {
    finalEmotion    = textEmotion;
    finalConfidence = textConfidence;
    source          = 'text';
  } else if (engResult) {
    finalEmotion    = engResult.emotion;
    finalConfidence = engResult.confidence;
    source          = 'engagement';
  } else if (toneEmotion) {
    finalEmotion    = toneEmotion;
    finalConfidence = 0.60;
    source          = 'tone';
  } else {
    finalEmotion    = 'happy';
    finalConfidence = 0.50;
    source          = 'fallback';
  }

  return {
    label:       finalEmotion,
    confidence:  Math.round(finalConfidence * 100) / 100,
    source,
    ttsSettings: EMOTION_TTS[finalEmotion],
    musicVibe:   EMOTION_MUSIC[finalEmotion],
  };
}

// ── Merge emotion settings into a VoiceConfig ─────────────────
// Used by the TTS orchestrator to override tier defaults with
// emotion-specific expressiveness settings.
export function applyEmotionToVoiceConfig(
  config: Record<string, any>,
  emotion: EmotionState,
): Record<string, any> {
  return {
    ...config,
    stability:  emotion.ttsSettings.stability,
    similarity: emotion.ttsSettings.similarity_boost,
    styleBoost: emotion.ttsSettings.style,
  };
}
