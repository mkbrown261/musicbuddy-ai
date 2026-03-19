// ============================================================
// TTS System — Shared Types
// src/lib/tts/types.ts
// ============================================================
// All modules in the TTS system use these types exclusively.
// The Intent Layer is the only public API — no module reaches
// directly into another.
// ============================================================

// ── Voice Tier ───────────────────────────────────────────────
export type VoiceTier = 'free' | 'trial' | 'premium' | 'fallback' | 'demo';

// ── Provider identifiers ──────────────────────────────────────
export type TTSProvider = 'openai' | 'elevenlabs' | 'polly' | 'demo';

// ── Emotion / Style tags ──────────────────────────────────────
export type TTSEmotion =
  | 'friendly'    // default warm children's voice
  | 'excited'     // high energy, song intro
  | 'singing'     // melodic, rhythmic phrasing
  | 'calm'        // soothing, lullaby tone
  | 'encouraging' // "you can do it!" energy
  | 'surprised'   // reaction hook
  | 'whisper';    // soft focus / attention grab

export type TTSStyle =
  | 'neutral'
  | 'children_host'   // Ms. Rachel style — warm, engaging host
  | 'song_intro'      // dramatic, high energy
  | 'post_song'       // celebratory wind-down
  | 'call_response'   // interactive, short phrases
  | 'lullaby';        // slow, soothing

// ── Voice Configuration ───────────────────────────────────────
export interface VoiceConfig {
  provider:    TTSProvider;
  voiceId:     string;
  style:       TTSStyle;
  emotion:     TTSEmotion;
  speed:       number;         // 0.5 – 2.0
  stability?:  number;         // ElevenLabs: 0–1
  similarity?: number;         // ElevenLabs: 0–1
  styleBoost?: number;         // ElevenLabs: 0–1
}

// ── Standard TTS Request ──────────────────────────────────────
export interface TTSRequest {
  text:        string;
  userId:      string;
  childId?:    number;
  sessionId?:  number;
  style?:      TTSStyle;
  emotion?:    TTSEmotion;
  voiceOverride?: string;      // force a specific voice ID
  skipCache?:  boolean;        // force fresh generation
  maxCostUnits?: number;       // budget cap per call
  // ── Phase 2: Alive System ──────────────────────────────────
  userText?:   string;         // raw child input for emotion detection
  engagement?: {               // camera engagement signals
    smileCount?:    number;
    laughCount?:    number;
    attentionLoss?: number;
    intensity?:     number;
    voiceDetected?: boolean;
  };
  behaviorTone?: string;       // from Groq cognitive layer
}

// ── Standard TTS Response ─────────────────────────────────────
export interface TTSResponse {
  audioUrl:    string | null;   // base64 data URL or null
  provider:    TTSProvider;
  voiceId:     string;
  tier:        VoiceTier;
  cacheHit:    boolean;
  cacheKey?:   string;
  charCount:   number;
  latencyMs?:  number;
  quotaUsed?:  number;
  quotaLimit?: number;
  quotaRemaining?: number;
  trialRemaining?: number;
  billingTrigger?: boolean;    // true = should prompt upgrade
  error?:      string;
  fallbackUsed?: boolean;
  fallbackChain?: TTSProvider[]; // providers tried before success
  // ── Phase 2: Alive System ──────────────────────────────────
  emotion?:    string;          // detected EmotionLabel
  ambientMusic?: {              // background music for frontend to layer
    vibe:     string;
    trackUrl: string | null;
    volume:   number;
    loop:     boolean;
    fadeMs:   number;
    label:    string;
  };
  memoryUpdated?: boolean;      // true if child_memory was written
}

// ── Cache Entry ───────────────────────────────────────────────
export interface CacheEntry {
  cacheKey:   string;
  provider:   TTSProvider;
  voiceId:    string;
  audioData:  string;        // base64 data URL
  charCount:  number;
  hitCount:   number;
  createdAt:  string;
  lastUsedAt: string;
  expiresAt?: string;
}

// ── Usage Record ──────────────────────────────────────────────
export interface UsageRecord {
  userId:     string;
  provider:   TTSProvider;
  voiceId:    string;
  charCount:  number;
  tier:       VoiceTier;
  cacheHit:   boolean;
  costUnits:  number;
  latencyMs?: number;
  error?:     string;
}

// ── Tier Resolution Result ────────────────────────────────────
export interface TierResolution {
  tier:           VoiceTier;
  voiceConfig:    VoiceConfig;
  reason:         string;
  trialRemaining?: number;
}

// ── Fallback Chain ────────────────────────────────────────────
export interface FallbackResult {
  response:       TTSResponse;
  attemptedChain: Array<{ provider: TTSProvider; error: string }>;
}

// ── Per-provider cost units (chars) ──────────────────────────
// Used only for internal budget tracking — not billed to users.
export const COST_PER_CHAR: Record<TTSProvider, number> = {
  openai:      0.000015,   // $0.015 / 1000 chars (tts-1-hd)
  elevenlabs:  0.00003,    // ~$0.30 / 10k chars turbo
  polly:       0.000004,   // $0.004 / 1000 chars (neural)
  demo:        0,
};

// ── ElevenLabs voice roster ───────────────────────────────────
export const ELEVENLABS_VOICES: Record<string, { id: string; desc: string }> = {
  rachel:  { id: '21m00Tcm4TlvDq8ikWAM', desc: 'Rachel — warm, nurturing, Ms. Rachel style' },
  bella:   { id: 'EXAVITQu4vr4xnSDxMaL', desc: 'Bella — soft, soothing' },
  elli:    { id: 'MF3mGyEYCl7XYWbV9V6O', desc: 'Elli — young, energetic' },
  charlie: { id: 'IKne3meq5aSn9XLyUdCD', desc: 'Charlie — friendly narrator' },
  josh:    { id: 'TxGEqnHWrfWFTfGW9XjX', desc: 'Josh — warm male' },
};

// ── OpenAI voice roster ───────────────────────────────────────
export const OPENAI_VOICES: Record<string, string> = {
  shimmer: 'shimmer',  // warm, clear female — default for children
  nova:    'nova',     // bright, upbeat female
  alloy:   'alloy',   // neutral, balanced
  echo:    'echo',    // male, resonant
  fable:   'fable',   // soft, storytelling
  onyx:    'onyx',    // male, authoritative
};

// ── Amazon Polly voice roster (neural engine) ─────────────────
export const POLLY_VOICES: Record<string, { id: string; lang: string; desc: string }> = {
  joanna:  { id: 'Joanna',  lang: 'en-US', desc: 'Joanna — clear, professional female' },
  salli:   { id: 'Salli',   lang: 'en-US', desc: 'Salli — warm, friendly female' },
  kendra:  { id: 'Kendra',  lang: 'en-US', desc: 'Kendra — gentle female' },
  ivy:     { id: 'Ivy',     lang: 'en-US', desc: 'Ivy — child voice, ideal for kids' },
  amy:     { id: 'Amy',     lang: 'en-GB', desc: 'Amy — warm British female' },
  brian:   { id: 'Brian',   lang: 'en-GB', desc: 'Brian — friendly British male' },
};

// ── Default voice configs per tier ───────────────────────────
export const TIER_DEFAULTS: Record<VoiceTier, VoiceConfig> = {
  free: {
    provider: 'openai',
    voiceId:  'shimmer',
    style:    'children_host',
    emotion:  'friendly',
    speed:    0.92,
  },
  trial: {
    provider: 'elevenlabs',
    voiceId:  ELEVENLABS_VOICES.rachel.id,
    style:    'children_host',
    emotion:  'friendly',
    speed:    0.95,
    stability:  0.5,
    similarity: 0.85,
    styleBoost: 0.35,
  },
  premium: {
    provider:   'elevenlabs',
    voiceId:    ELEVENLABS_VOICES.rachel.id,
    style:      'children_host',
    emotion:    'excited',
    speed:      0.95,
    stability:  0.45,   // more expressive
    similarity: 0.85,
    styleBoost: 0.55,   // stronger character
  },
  fallback: {
    provider: 'polly',
    voiceId:  'Joanna',
    style:    'neutral',
    emotion:  'friendly',
    speed:    0.95,
  },
  demo: {
    provider: 'demo',
    voiceId:  'browser',
    style:    'neutral',
    emotion:  'friendly',
    speed:    0.9,
  },
};

// ── Emotion → ElevenLabs style/stability tuning ───────────────
export const EMOTION_TUNING: Record<TTSEmotion, { stability: number; styleBoost: number }> = {
  friendly:    { stability: 0.50, styleBoost: 0.35 },
  excited:     { stability: 0.35, styleBoost: 0.70 },  // max expressiveness
  singing:     { stability: 0.40, styleBoost: 0.60 },
  calm:        { stability: 0.75, styleBoost: 0.20 },
  encouraging: { stability: 0.40, styleBoost: 0.55 },
  surprised:   { stability: 0.30, styleBoost: 0.75 },
  whisper:     { stability: 0.85, styleBoost: 0.15 },
};
