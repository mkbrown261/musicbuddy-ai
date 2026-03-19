// ============================================================
// TTS Provider Adapter — Replicate (ElevenLabs v2-multilingual)
// src/lib/tts/providers/replicate.ts
// ============================================================
// Uses Replicate's API to run ElevenLabs v2-multilingual model.
// This enables free-tier users to access ElevenLabs-quality
// voice without needing a direct ElevenLabs API key.
//
// Model: elevenlabs/v2-multilingual
// Replicate endpoint: https://api.replicate.com/v1/models/elevenlabs/v2-multilingual/predictions
//
// Available voices:
//   Aria, Roger, Sarah, Laura, Charlie, George, Callum, River,
//   Liam, Charlotte, Alice, Matilda, Will, Jessica, Eric, Chris,
//   Brian, Daniel, Lily, Bill
//
// COST: ~$0.002/char on Replicate (cheaper than direct ElevenLabs)
// LATENCY: ~2-5s (Replicate cold starts)
// USE FOR: free-tier trial, fallback when ElevenLabs key missing
// ============================================================

import type { VoiceConfig, TTSResponse } from '../types';
import { COST_PER_CHAR } from '../types';
import { sanitizeForTTS } from './openai';

// ── Replicate constants ───────────────────────────────────────
const REPLICATE_BASE = 'https://api.replicate.com/v1';
const MODEL_VERSION  = 'elevenlabs/v2-multilingual';
const POLL_INTERVAL_MS = 500;
const MAX_POLLS        = 24;    // 12 seconds max wait
const TIMEOUT_MS       = 15000;

// ── Children's app voice choices (warm, child-friendly) ───────
export const REPLICATE_VOICES = {
  // Female voices (warm, nurturing — best for children's host)
  aria:      { name: 'Aria',      style: 'warm, nurturing — ideal for toddlers' },
  sarah:     { name: 'Sarah',     style: 'soft, friendly — great for preschool' },
  laura:     { name: 'Laura',     style: 'gentle, soothing — perfect for lullabies' },
  charlotte: { name: 'Charlotte', style: 'bright, cheerful — energetic sessions' },
  alice:     { name: 'Alice',     style: 'warm, professional — consistent quality' },
  matilda:   { name: 'Matilda',   style: 'playful, light — fun interactions' },
  jessica:   { name: 'Jessica',   style: 'upbeat, engaging — high energy games' },
  lily:      { name: 'Lily',      style: 'soft, natural — calm mode' },
  // Male voices (friendly, fun)
  charlie:   { name: 'Charlie',   style: 'friendly, approachable narrator' },
  liam:      { name: 'Liam',      style: 'warm, encouraging — great coach voice' },
  george:    { name: 'George',    style: 'warm British — storytelling' },
  eric:      { name: 'Eric',      style: 'enthusiastic, energetic' },
  brian:     { name: 'Brian',     style: 'friendly, professional' },
} as const;

// Default voice for children's app: Aria (warm, nurturing)
export const DEFAULT_REPLICATE_VOICE = 'Aria';

// ── Map TTS emotion → best Replicate voice ────────────────────
function emotionToVoice(emotion: string): string {
  const map: Record<string, string> = {
    friendly:    'Aria',
    excited:     'Jessica',
    singing:     'Charlotte',
    calm:        'Laura',
    encouraging: 'Sarah',
    surprised:   'Jessica',
    whisper:     'Lily',
    celebratory: 'Charlotte',
    playful:     'Matilda',
    warm:        'Aria',
    soothing:    'Laura',
    curious:     'Alice',
    gentle:      'Lily',
  };
  return map[emotion] ?? DEFAULT_REPLICATE_VOICE;
}

// ── Submit prediction to Replicate ────────────────────────────
async function submitPrediction(
  apiKey: string,
  text: string,
  voice: string,
  languageCode = 'en'
): Promise<{ id: string; urls: { get: string } }> {
  const res = await fetch(`${REPLICATE_BASE}/models/${MODEL_VERSION}/predictions`, {
    method:  'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'wait',  // wait up to 60s for sync response
    },
    body: JSON.stringify({
      input: {
        prompt:        text,
        voice:         voice,
        language_code: languageCode,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Replicate submit ${res.status}: ${err.slice(0, 200)}`);
  }

  return res.json();
}

// ── Poll for completed prediction ─────────────────────────────
async function pollPrediction(
  apiKey: string,
  predictionId: string,
  getUrl: string
): Promise<string | null> {  // returns audio URL or null

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(getUrl, {
      headers: { 'Authorization': `Token ${apiKey}` },
    });

    if (!res.ok) throw new Error(`Replicate poll ${res.status}`);

    const data = await res.json() as any;

    if (data.status === 'succeeded') {
      // output is a FileOutput object with a .url() method or a plain URL string
      if (typeof data.output === 'string') return data.output;
      if (data.output?.url) return data.output.url;
      // Sometimes Replicate wraps it
      if (Array.isArray(data.output) && data.output[0]) return String(data.output[0]);
      return null;
    }

    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate prediction ${data.status}: ${data.error ?? 'unknown'}`);
    }
    // status: 'starting' | 'processing' → keep polling
  }

  throw new Error('Replicate polling timeout');
}

// ── Fetch audio URL and convert to base64 data URL ───────────
async function fetchAudioAsBase64(audioUrl: string): Promise<string> {
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`Audio fetch ${res.status}`);

  const buffer = await res.arrayBuffer();
  const bytes   = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength)));
  }
  return `data:audio/mpeg;base64,${btoa(binary)}`;
}

// ── Main adapter ──────────────────────────────────────────────
export async function generateReplicateTTS(
  text: string,
  config: VoiceConfig,
  apiKey: string
): Promise<TTSResponse> {
  const startMs = Date.now();
  const cleanText = sanitizeForTTS(text);

  if (!cleanText) {
    return {
      audioUrl: null, provider: 'elevenlabs', voiceId: config.voiceId,
      tier: 'trial', cacheHit: false, charCount: 0,
      error: 'Empty text after sanitization',
    };
  }

  const truncated = cleanText.slice(0, 2500); // Replicate model limit

  // Choose voice: respect config override, otherwise map from emotion
  const voiceName = REPLICATE_VOICES[config.voiceId?.toLowerCase() as keyof typeof REPLICATE_VOICES]?.name
    ?? emotionToVoice(config.emotion)
    ?? DEFAULT_REPLICATE_VOICE;

  try {
    // ── Submit prediction ───────────────────────────────────────
    const prediction = await submitPrediction(apiKey, truncated, voiceName);

    let audioUrl: string | null = null;

    // ── Check if we got instant result (Prefer: wait header) ────
    if ((prediction as any).status === 'succeeded') {
      const output = (prediction as any).output;
      if (typeof output === 'string') audioUrl = output;
      else if (output?.url) audioUrl = output.url;
    }

    // ── Otherwise poll ──────────────────────────────────────────
    if (!audioUrl && prediction.id && prediction.urls?.get) {
      audioUrl = await pollPrediction(apiKey, prediction.id, prediction.urls.get);
    }

    if (!audioUrl) {
      return {
        audioUrl: null, provider: 'elevenlabs', voiceId: voiceName,
        tier: 'trial', cacheHit: false, charCount: truncated.length,
        latencyMs: Date.now() - startMs,
        error: 'Replicate returned no audio URL',
      };
    }

    // ── Fetch and convert to base64 (for caching) ─────────────
    const base64Audio = await fetchAudioAsBase64(audioUrl);

    const wordCount  = truncated.split(/\s+/).length;
    const durationMs = Math.round((wordCount / 150) * 60 * 1000);

    return {
      audioUrl: base64Audio,
      provider:  'elevenlabs',   // treated as elevenlabs quality
      voiceId:   voiceName,
      tier:      'trial',
      cacheHit:  false,
      charCount: truncated.length,
      latencyMs: Date.now() - startMs,
      // @ts-ignore
      _costUnits:  truncated.length * COST_PER_CHAR.elevenlabs,
      _durationMs: durationMs,
      _replicateProvider: true,  // internal marker
    };

  } catch (e: any) {
    return {
      audioUrl: null, provider: 'elevenlabs', voiceId: voiceName,
      tier: 'trial', cacheHit: false, charCount: truncated.length,
      latencyMs: Date.now() - startMs,
      error: `Replicate ElevenLabs error: ${e.message}`,
    };
  }
}
