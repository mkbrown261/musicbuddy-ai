// ============================================================
// TTS Provider Adapter — ElevenLabs
// src/lib/tts/providers/elevenlabs.ts
// ============================================================
// Premium TTS: ultra-expressive, emotional, "Ms. Rachel style"
// Model: eleven_turbo_v2_5 (fastest + highest quality)
//
// COST: ~$0.30 per 10,000 characters
// LATENCY: ~400-1200ms (stream endpoint used for faster TTFB)
// BEST FOR: premium users, trial users, singing mode, hooks
//
// Voice settings are tuned per emotion using EMOTION_TUNING map.
// Returns base64 data URL (mpeg) for direct browser playback.
// ============================================================

import type { VoiceConfig, TTSResponse, TTSEmotion } from '../types';
import { COST_PER_CHAR, EMOTION_TUNING, ELEVENLABS_VOICES } from '../types';
import { sanitizeForTTS } from './openai';

// ── Model constants ───────────────────────────────────────────
const MODEL_TURBO    = 'eleven_turbo_v2_5';   // fastest, best quality
const MODEL_STANDARD = 'eleven_multilingual_v2'; // highest quality, slower

// ── Resolve voice ID ──────────────────────────────────────────
// Accepts: voiceName key ('rachel'), full EL ID, or falls back to Rachel
function resolveVoiceId(voiceId: string): string {
  // Check if it's a named key
  if (ELEVENLABS_VOICES[voiceId.toLowerCase()]) {
    return ELEVENLABS_VOICES[voiceId.toLowerCase()].id;
  }
  // Looks like a raw ID (32+ chars hex-like)
  if (voiceId.length >= 20) return voiceId;
  // Default: Rachel
  return ELEVENLABS_VOICES.rachel.id;
}

// ── Build voice settings from emotion + config ─────────────────
function buildVoiceSettings(config: VoiceConfig) {
  const tuning = EMOTION_TUNING[config.emotion as TTSEmotion] ?? EMOTION_TUNING.friendly;
  return {
    stability:        config.stability  ?? tuning.stability,
    similarity_boost: config.similarity ?? 0.85,
    style:            config.styleBoost ?? tuning.styleBoost,
    use_speaker_boost: true,
  };
}

// ── SSML-style text enrichment for children's host style ──────
// ElevenLabs doesn't support SSML but responds to punctuation.
// We add natural pauses and emphasis markers.
function enrichText(text: string, emotion: TTSEmotion, style: string): string {
  let t = text;

  if (style === 'singing' || emotion === 'singing') {
    // Add melodic spacing between lyric lines
    t = t.replace(/([.!?])\s+/g, '$1... ');
  }

  if (emotion === 'excited' || emotion === 'encouraging') {
    // Emphasise key words with capitalisation (ElevenLabs responds to this)
    t = t.replace(/\b(amazing|wonderful|great|wow|yes|yay|awesome|fantastic)\b/gi,
      (m) => m.toUpperCase());
  }

  if (emotion === 'whisper') {
    // Short pauses to simulate soft delivery
    t = t.replace(/,\s*/g, '... ');
  }

  return t;
}

// ── Main adapter ──────────────────────────────────────────────
export async function generateElevenLabsTTS(
  text: string,
  config: VoiceConfig,
  apiKey: string,
  useStreaming = true  // use /stream endpoint for lower TTFB
): Promise<TTSResponse> {
  const startMs = Date.now();
  const cleanText = sanitizeForTTS(text);

  if (!cleanText) {
    return {
      audioUrl: null, provider: 'elevenlabs', voiceId: config.voiceId,
      tier: 'premium', cacheHit: false, charCount: 0,
      error: 'Empty text after sanitization',
    };
  }

  const voiceId       = resolveVoiceId(config.voiceId);
  const enriched      = enrichText(cleanText, config.emotion, config.style);
  const truncated     = enriched.slice(0, 5000); // ElevenLabs turbo limit
  const voiceSettings = buildVoiceSettings(config);
  const endpoint      = useStreaming
    ? `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`
    : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify({
        text:           truncated,
        model_id:       MODEL_TURBO,
        voice_settings: voiceSettings,
        // Optimize for children's app: lower latency, stable pacing
        pronunciation_dictionary_locators: [],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      let userError = `ElevenLabs ${res.status}`;

      // Parse common error types
      if (res.status === 401) userError = 'ElevenLabs: invalid API key';
      else if (res.status === 429) userError = 'ElevenLabs: rate limit / quota exceeded';
      else if (res.status === 422) userError = 'ElevenLabs: invalid voice ID';

      return {
        audioUrl: null, provider: 'elevenlabs', voiceId,
        tier: 'premium', cacheHit: false, charCount: truncated.length,
        latencyMs: Date.now() - startMs,
        error: userError,
      };
    }

    // Buffer the streaming response
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      return {
        audioUrl: null, provider: 'elevenlabs', voiceId,
        tier: 'premium', cacheHit: false, charCount: truncated.length,
        latencyMs: Date.now() - startMs,
        error: 'ElevenLabs returned empty audio',
      };
    }

    // Convert to base64 data URL
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength)));
    }
    const audioUrl = `data:audio/mpeg;base64,${btoa(binary)}`;

    // Estimate duration (rough: ~150 words/min at 0.95 speed)
    const wordCount    = truncated.split(/\s+/).length;
    const durationMs   = Math.round((wordCount / 150) * 60 * 1000 / (config.speed ?? 0.95));

    return {
      audioUrl,
      provider:   'elevenlabs',
      voiceId,
      tier:       'premium',
      cacheHit:   false,
      charCount:  truncated.length,
      latencyMs:  Date.now() - startMs,
      // @ts-ignore — extra field for orchestrator
      _costUnits: truncated.length * COST_PER_CHAR.elevenlabs,
      _durationMs: durationMs,
    };
  } catch (e: any) {
    return {
      audioUrl: null, provider: 'elevenlabs', voiceId,
      tier: 'premium', cacheHit: false, charCount: truncated.length,
      latencyMs: Date.now() - startMs,
      error: `ElevenLabs network error: ${e.message}`,
    };
  }
}
