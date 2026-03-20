// ============================================================
// Groq Personality Engine
// src/lib/groq/personality.ts
// ============================================================
// STAGE 1 of the 3-stage TTS pipeline:
//   RAW TEXT → GROQ PERSONALITY REWRITE → expressive children's host speech
//
// This runs BEFORE every TTS call. It transforms flat/robotic
// text into warm, upbeat, rhythmic speech that sounds like a
// real live children's host (Ms. Rachel / Gracie's Corner style).
//
// Pipeline:
//   1. Groq rewrites text with personality rules
//   2. Selects voice gender / style based on user preference
//   3. Returns expressive TTS-ready payload with correct ElevenLabs settings
//
// If Groq unavailable: deterministic enrichment runs locally (always works).
// ============================================================

import type { TTSEmotion, TTSStyle } from '../tts/types';

// ── Groq constants ────────────────────────────────────────────
const GROQ_API_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL     = 'llama-3.1-8b-instant';
const GROQ_TIMEOUT   = 5000;   // 5s — allow enough time for full JSON response

// ── Voice gender → ElevenLabs voice IDs ──────────────────────
// These are REAL ElevenLabs voice IDs verified to exist.
// Female default: Rachel (warm nurturing host)
// Female alt:     Matilda (playful, bright)
// Male default:   Charlie (friendly, upbeat narrator)
// Male alt:       Liam (warm encouraging coach)
export const VOICE_GENDER_MAP = {
  female: {
    default:     '21m00Tcm4TlvDq8ikWAM', // Rachel — warm Ms. Rachel style
    playful:     'XrExE9yKIg1WjnnlVkGX', // Matilda — playful, bright
    soothing:    'EXAVITQu4vr4xnSDxMaL', // Bella — soft, lullaby
    energetic:   'MF3mGyEYCl7XYWbV9V6O', // Elli — young, energetic
  },
  male: {
    default:     'IKne3meq5aSn9XLyUdCD', // Charlie — friendly narrator
    playful:     'bIHbv24MWmeRgasZH58o', // Will — playful, light
    energetic:   'TxGEqnHWrfWFTfGW9XjX', // Josh — warm energetic male
    soothing:    'N2lVS1w4EtoT3dr4eOWO', // Callum — calm, warm
  },
} as const;

export type VoiceGender = 'female' | 'male';
export type VoiceStyle  = 'default' | 'playful' | 'soothing' | 'energetic';

// ── Personality output payload ────────────────────────────────
export interface PersonalityOutput {
  text:     string;           // rewritten expressive text
  voice: {
    gender:   VoiceGender;
    style:    VoiceStyle;
    voiceId:  string;         // resolved ElevenLabs voice ID
  };
  tts_settings: {
    stability:         number;  // 0.3 = very expressive
    similarity_boost:  number;  // 0.6 = natural
    style:             number;  // 0.9 = max character
    use_speaker_boost: boolean;
  };
  emotion:   TTSEmotion;
  ttsStyle:  TTSStyle;
  fromGroq:  boolean;
}

// ── The master system prompt for Stage 1 ─────────────────────
const PERSONALITY_SYSTEM_PROMPT = `You are the orchestration brain of MusicBuddy, a child-friendly AI music assistant.
You MUST process every request through a strict 3-layer pipeline:

═══════════════════════════════════════
STAGE 1: PERSONALITY ENGINE (MANDATORY)
═══════════════════════════════════════
Rewrite every response to sound:
- Upbeat, energetic, friendly, human-like (NOT robotic)
- Fun and engaging for children aged 2-8
- Natural speech flow with rhythm and warmth
- NEVER return plain or flat text
- NEVER sound like a machine
- Use natural speech — commas for pauses, ellipses for suspense
- Add excitement and warmth but keep it child-appropriate
- Sentences must be short, rhythmic, easy to understand

TRANSFORMATION EXAMPLES:
BAD: "Your song is ready."
GOOD: "Hey!! Your song is ready... want to hear something AMAZING? 🎶"

BAD: "Great job today."
GOOD: "WOW... you did SO great today! I am so proud of you! 🌟"

BAD: "Let's sing together."
GOOD: "Ooh, ooh! Let's SING together! Ready? One, two, three... GO! 🎵"

═══════════════════════════════════════
STAGE 2: VOICE SELECTION ENGINE
═══════════════════════════════════════
Determine voice config based on emotion and content:
- excited/celebrating → energetic style
- calm/lullaby/soothing → soothing style
- singing/playful/games → playful style
- default/talking → default style

═══════════════════════════════════════
STAGE 3: TTS OPTIMIZATION
═══════════════════════════════════════
Format for maximum ElevenLabs expressiveness:
- stability: 0.3 (very expressive)
- similarity_boost: 0.6 (natural)
- style: 0.9 (maximum character)
- use_speaker_boost: true
For calm/lullaby: stability 0.65, style 0.4
For whisper: stability 0.8, style 0.2

═══════════════════════════════════════
OUTPUT FORMAT — return ONLY valid JSON:
═══════════════════════════════════════
{
  "text": "<rewritten expressive text — NO emojis, just words and punctuation>",
  "voice_style": "default|playful|soothing|energetic",
  "tts_settings": {
    "stability": 0.3,
    "similarity_boost": 0.6,
    "style": 0.9,
    "use_speaker_boost": true
  }
}

FAILSAFE: If output sounds robotic, rewrite before returning.
NEVER include emojis in the "text" field — ElevenLabs speaks them aloud.
You are responsible for making MusicBuddy feel alive.`;

// ── Parse Groq personality response ──────────────────────────
function parsePersonalityResponse(raw: string): {
  text: string;
  voiceStyle: VoiceStyle;
  ttsSettings: PersonalityOutput['tts_settings'];
} | null {
  try {
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // First: try full JSON parse
    let obj: any = null;
    try {
      obj = JSON.parse(clean);
    } catch {
      // If full parse fails (e.g. max_tokens truncation), try to salvage the
      // "text" field by extracting the value from an incomplete JSON string.
      // Pattern: "text": "...some text that may be cut off
      const textMatch = clean.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (textMatch) {
        // We recovered the text — use defaults for everything else
        return {
          text: textMatch[1].slice(0, 400),
          voiceStyle: 'default',
          ttsSettings: {
            stability: 0.3, similarity_boost: 0.6, style: 0.9, use_speaker_boost: true,
          },
        };
      }
      return null;
    }

    const validStyles: VoiceStyle[] = ['default', 'playful', 'soothing', 'energetic'];
    const voiceStyle: VoiceStyle = validStyles.includes(obj.voice_style)
      ? obj.voice_style
      : 'default';

    const s = obj.tts_settings ?? {};
    return {
      text: String(obj.text || '').slice(0, 400),
      voiceStyle,
      ttsSettings: {
        stability:         typeof s.stability === 'number'        ? s.stability        : 0.3,
        similarity_boost:  typeof s.similarity_boost === 'number' ? s.similarity_boost : 0.6,
        style:             typeof s.style === 'number'            ? s.style            : 0.9,
        use_speaker_boost: true,
      },
    };
  } catch {
    return null;
  }
}

// ── Deterministic local enrichment (always works, no API) ─────
// Runs when Groq is unavailable or times out.
function enrichLocally(
  text: string,
  emotion: TTSEmotion,
  style: TTSStyle
): { text: string; voiceStyle: VoiceStyle; ttsSettings: PersonalityOutput['tts_settings'] } {

  let enriched = text
    // Strip emojis (ElevenLabs speaks them)
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
    .replace(/[♪♫♩♬♭♮♯]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Add pauses and emphasis based on emotion
  if (emotion === 'excited' || emotion === 'encouraging') {
    // Uppercase key words for ElevenLabs emphasis
    enriched = enriched.replace(
      /\b(amazing|great|wow|yes|awesome|fantastic|wonderful|superstar|incredible)\b/gi,
      (m) => m.toUpperCase()
    );
    // Add ellipsis for suspense
    enriched = enriched.replace(/\.\s+/g, '... ');
  }

  if (emotion === 'singing' || style === 'lullaby') {
    enriched = enriched.replace(/([.!?])\s+/g, '$1... ');
  }

  if (emotion === 'whisper') {
    enriched = enriched.replace(/,\s*/g, '... ');
  }

  // Determine voice style and TTS settings from emotion
  let voiceStyle: VoiceStyle = 'default';
  let stability   = 0.35;
  let styleBoost  = 0.75;

  switch (emotion) {
    case 'excited':
    case 'encouraging':
      voiceStyle = 'energetic'; stability = 0.30; styleBoost = 0.90;
      break;
    case 'singing':
      voiceStyle = 'playful';   stability = 0.35; styleBoost = 0.80;
      break;
    case 'calm':
      voiceStyle = 'soothing';  stability = 0.65; styleBoost = 0.40;
      break;
    case 'whisper':
      voiceStyle = 'soothing';  stability = 0.80; styleBoost = 0.20;
      break;
    case 'surprised':
      voiceStyle = 'energetic'; stability = 0.28; styleBoost = 0.90;
      break;
    case 'friendly':
    default:
      voiceStyle = 'default';   stability = 0.35; styleBoost = 0.70;
  }

  if (style === 'lullaby') {
    voiceStyle = 'soothing'; stability = 0.70; styleBoost = 0.30;
  }
  if (style === 'song_intro' || style === 'call_response') {
    voiceStyle = 'playful'; stability = 0.30; styleBoost = 0.90;
  }

  return {
    text: enriched,
    voiceStyle,
    ttsSettings: {
      stability,
      similarity_boost: 0.60,
      style: styleBoost,
      use_speaker_boost: true,
    },
  };
}

// ── Select voice ID from gender + style ──────────────────────
function selectVoiceId(gender: VoiceGender, style: VoiceStyle): string {
  return VOICE_GENDER_MAP[gender][style] ?? VOICE_GENDER_MAP[gender].default;
}

// ── Main exported function ────────────────────────────────────
// Called by the TTS Orchestrator BEFORE calling ElevenLabs.
// Returns a fully enriched PersonalityOutput ready for TTS.
export async function applyPersonality(
  text: string,
  emotion: TTSEmotion,
  style: TTSStyle,
  gender: VoiceGender = 'female',
  groqApiKey?: string,
  voiceOverrideId?: string
): Promise<PersonalityOutput> {

  // ── Try Groq Stage 1 rewrite ─────────────────────────────
  let groqResult: ReturnType<typeof parsePersonalityResponse> = null;

  if (groqApiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT);

    try {
      const res = await fetch(GROQ_API_URL, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:       GROQ_MODEL,
          messages:    [
            { role: 'system', content: PERSONALITY_SYSTEM_PROMPT },
            { role: 'user',   content: `Emotion: ${emotion}\nStyle: ${style}\nText: ${text}` },
          ],
          max_tokens:  400,      // 200 was too low — JSON often got truncated mid-string
          temperature: 0.8,
          top_p:       0.9,
          stream:      false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json() as any;
        const raw = data.choices?.[0]?.message?.content ?? '';
        groqResult = parsePersonalityResponse(raw);
      }
    } catch {
      clearTimeout(timer);
      // Timeout or network error — fall through to local enrichment
    }
  }

  // ── Local enrichment fallback ────────────────────────────
  const result = groqResult ?? enrichLocally(text, emotion, style);

  // ── Resolve final voice ID ───────────────────────────────
  const voiceId = voiceOverrideId ?? selectVoiceId(gender, result.voiceStyle);

  return {
    text:         result.text,
    voice: {
      gender,
      style:    result.voiceStyle,
      voiceId,
    },
    tts_settings: result.ttsSettings,
    emotion,
    ttsStyle:     style,
    fromGroq:     !!groqResult,
  };
}

// ── Apply personality settings to ElevenLabs VoiceConfig ─────
// Merges the PersonalityOutput back into the VoiceConfig the
// ElevenLabs adapter understands.
export function mergePersonalityIntoConfig(
  config: import('../tts/types').VoiceConfig,
  personality: PersonalityOutput
): import('../tts/types').VoiceConfig {
  return {
    ...config,
    voiceId:    personality.voice.voiceId,
    emotion:    personality.emotion,
    stability:  personality.tts_settings.stability,
    similarity: personality.tts_settings.similarity_boost,
    styleBoost: personality.tts_settings.style,
  };
}
