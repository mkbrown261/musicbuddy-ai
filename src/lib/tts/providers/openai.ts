// ============================================================
// TTS Provider Adapter — OpenAI
// src/lib/tts/providers/openai.ts
// ============================================================
// Default TTS provider: low cost, high quality, fast.
// Model: tts-1-hd (highest quality variant)
// Returns base64 data URL (mp3) for direct browser playback.
//
// COST: ~$0.015 per 1,000 characters
// LATENCY: ~300-800ms
// BEST FOR: default users, free tier, fallback from ElevenLabs
// ============================================================

import type { VoiceConfig, TTSResponse } from '../types';
import { COST_PER_CHAR } from '../types';

// ── Text sanitizer ────────────────────────────────────────────
export function sanitizeForTTS(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\u200D/g, '')
    .replace(/[♪♫♩♬♭♮♯]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Emotion → OpenAI speed/pitch hint ─────────────────────────
// OpenAI TTS only supports speed (0.25–4.0); no pitch or style.
// We encode emotion through slight speed variation.
function emotionToSpeed(emotion: string, baseSpeed: number): number {
  const delta: Record<string, number> = {
    excited:     +0.08,
    singing:     -0.05,
    calm:        -0.10,
    whisper:     -0.12,
    encouraging: +0.05,
    surprised:   +0.10,
    friendly:     0,
  };
  return Math.max(0.7, Math.min(1.4, baseSpeed + (delta[emotion] ?? 0)));
}

// ── Main adapter ──────────────────────────────────────────────
export async function generateOpenAITTS(
  text: string,
  config: VoiceConfig,
  apiKey: string
): Promise<TTSResponse> {
  const startMs = Date.now();
  const cleanText = sanitizeForTTS(text);

  if (!cleanText) {
    return {
      audioUrl: null, provider: 'openai', voiceId: config.voiceId,
      tier: 'free', cacheHit: false, charCount: 0,
      error: 'Empty text after sanitization',
    };
  }

  const speed = emotionToSpeed(config.emotion, config.speed ?? 0.92);
  const truncated = cleanText.slice(0, 4096); // OpenAI hard limit

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: truncated,
        voice: config.voiceId || 'shimmer',
        speed,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        audioUrl: null, provider: 'openai', voiceId: config.voiceId,
        tier: 'free', cacheHit: false, charCount: truncated.length,
        latencyMs: Date.now() - startMs,
        error: `OpenAI TTS ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    // Convert ArrayBuffer → base64 data URL
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength)));
    }
    const audioUrl = `data:audio/mpeg;base64,${btoa(binary)}`;

    return {
      audioUrl,
      provider:   'openai',
      voiceId:    config.voiceId || 'shimmer',
      tier:       'free',
      cacheHit:   false,
      charCount:  truncated.length,
      latencyMs:  Date.now() - startMs,
      // Estimated cost tracking
      // @ts-ignore — extra field for orchestrator
      _costUnits: truncated.length * COST_PER_CHAR.openai,
    };
  } catch (e: any) {
    return {
      audioUrl: null, provider: 'openai', voiceId: config.voiceId,
      tier: 'free', cacheHit: false, charCount: truncated.length,
      latencyMs: Date.now() - startMs,
      error: `OpenAI TTS network error: ${e.message}`,
    };
  }
}
