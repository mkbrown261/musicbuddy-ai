// ============================================================
// MODULE 2: TTS Management — src/lib/modules/tts-manager.ts
// ============================================================
// Intent Layer Intents handled:
//   USE_TTS          — generate TTS, respect quota & voice tier
//   TRACK_TTS_USAGE  — persist usage record after generation
//   GET_TTS_QUOTA    — return remaining free uses for a user
//
// Voice Tiers:
//   free     → OpenAI 'shimmer' (warm, friendly)
//   premium  → ElevenLabs Rachel / custom (ultra-expressive)
//   trial    → ElevenLabs Rachel with limited free uses (3 per day)
//
// ARCHITECTURAL RULE: no Action Layer changes.
// TTS audio is returned as base64 data URL or stream URL.
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';

// ── Free trial limits ─────────────────────────────────────────
const FREE_ELEVENLABS_DAILY = 3;
const FREE_OPENAI_DAILY = 50;   // generous — OpenAI TTS is cheap

// ── ElevenLabs Voice IDs ──────────────────────────────────────
// Rachel — warm, nurturing female voice (best for children's app)
const ELEVENLABS_VOICES = {
  rachel:  '21m00Tcm4TlvDq8ikWAM',   // Rachel — default premium
  elli:    'MF3mGyEYCl7XYWbV9V6O',   // Elli — young, energetic
  bella:   'EXAVITQu4vr4xnSDxMaL',   // Bella — soft, soothing
  charlie: 'IKne3meq5aSn9XLyUdCD',   // Charlie — friendly
  josh:    'TxGEqnHWrfWFTfGW9XjX',   // Josh — warm male
};

// ── Sanitize text before TTS ──────────────────────────────────
function sanitize(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
    .replace(/[♪♫♩♬♭♮♯]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── OpenAI TTS ────────────────────────────────────────────────
async function openaiTTS(
  text: string,
  voice: string,
  speed: number,
  apiKey: string
): Promise<{ audio_url: string | null; provider: string; error?: string }> {
  const cleanText = sanitize(text);
  if (!cleanText) return { audio_url: null, provider: 'demo' };

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',          // HD model for better quality
        input: cleanText.slice(0, 4096),
        voice: voice || 'shimmer',
        speed: speed || 0.92,       // Slightly slow for children
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { audio_url: null, provider: 'openai_error', error: err };
    }

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return { audio_url: `data:audio/mp3;base64,${btoa(binary)}`, provider: 'openai' };
  } catch (e: any) {
    return { audio_url: null, provider: 'openai_error', error: e.message };
  }
}

// ── ElevenLabs TTS ────────────────────────────────────────────
async function elevenlabsTTS(
  text: string,
  voiceId: string,
  stability: number,
  similarity: number,
  apiKey: string
): Promise<{ audio_url: string | null; provider: string; error?: string }> {
  const cleanText = sanitize(text);
  if (!cleanText) return { audio_url: null, provider: 'demo' };

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: cleanText.slice(0, 5000),
        model_id: 'eleven_turbo_v2_5',    // Fast + high quality
        voice_settings: {
          stability: stability ?? 0.5,     // 0.5 = natural variation
          similarity_boost: similarity ?? 0.85,
          style: 0.2,                      // slight expressiveness
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { audio_url: null, provider: 'elevenlabs_error', error: err };
    }

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return { audio_url: `data:audio/mpeg;base64,${btoa(binary)}`, provider: 'elevenlabs' };
  } catch (e: any) {
    return { audio_url: null, provider: 'elevenlabs_error', error: e.message };
  }
}

// ── Usage DB helpers ──────────────────────────────────────────
async function getTodayUsage(
  db: any, userId: string, provider: string
): Promise<number> {
  const r = await db.prepare(
    `SELECT COUNT(*) as cnt FROM tts_usage_log
     WHERE user_id = ? AND provider = ? AND DATE(used_at) = DATE('now')`
  ).bind(userId, provider).first();
  return r?.cnt ?? 0;
}

async function logUsage(
  db: any, userId: string, childId: number | undefined,
  provider: string, voice: string, charCount: number, tier: string
): Promise<void> {
  await db.prepare(
    `INSERT INTO tts_usage_log (user_id, child_id, provider, voice_id, char_count, tier)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(userId ?? 'demo', childId ?? null, provider, voice, charCount, tier).run();
}

// ── TTS Manager Module ────────────────────────────────────────
export class TTSManagerModule implements IntentModule {
  handles = ['USE_TTS', 'TRACK_TTS_USAGE', 'GET_TTS_QUOTA'] as any[];

  async handle(payload: IntentPayload, env: any, db: any): Promise<IntentResult> {
    switch (payload.intent) {

      // ── USE_TTS ─────────────────────────────────────────────
      case 'USE_TTS': {
        const d = payload.data as {
          text: string;
          voice?: string;             // voice name key or ElevenLabs ID
          tier?: 'free' | 'trial' | 'premium';
          speed?: number;
          stability?: number;
          similarity?: number;
        };
        const userId = payload.userId ?? 'demo';
        const childId = payload.childId;
        const tier = d.tier ?? 'free';
        const text = sanitize(d.text ?? '');

        if (!text) return { success: false, intent: 'USE_TTS', error: 'Empty text' };

        const elevenKey = env.ELEVENLABS_API_KEY;
        const openaiKey = env.OPENAI_API_KEY;

        // ── Premium / Trial path: ElevenLabs ────────────────
        if ((tier === 'premium' || tier === 'trial') && elevenKey) {
          // Check daily quota for trials
          if (tier === 'trial') {
            const used = await getTodayUsage(db, userId, 'elevenlabs');
            if (used >= FREE_ELEVENLABS_DAILY) {
              // Fall through to OpenAI
              if (!openaiKey) return { success: false, intent: 'USE_TTS', error: 'TTS quota exhausted', data: { quota_exhausted: true } };
              const voiceName = 'shimmer';
              const r = await openaiTTS(text, voiceName, d.speed ?? 0.92, openaiKey);
              await logUsage(db, userId, childId, 'openai', voiceName, text.length, 'free_fallback');
              return { success: true, intent: 'USE_TTS', data: { ...r, tier: 'free_fallback', quota_used: used, quota_limit: FREE_ELEVENLABS_DAILY } };
            }
          }

          // Resolve voice ID
          const voiceKey = d.voice && (ELEVENLABS_VOICES as any)[d.voice]
            ? (ELEVENLABS_VOICES as any)[d.voice]
            : d.voice ?? ELEVENLABS_VOICES.rachel;

          const r = await elevenlabsTTS(text, voiceKey, d.stability ?? 0.5, d.similarity ?? 0.85, elevenKey);

          if (r.audio_url) {
            await logUsage(db, userId, childId, 'elevenlabs', voiceKey, text.length, tier);
            const usedToday = tier === 'trial' ? await getTodayUsage(db, userId, 'elevenlabs') : null;
            return {
              success: true, intent: 'USE_TTS',
              data: { ...r, tier, quota_used: usedToday, quota_limit: tier === 'trial' ? FREE_ELEVENLABS_DAILY : null }
            };
          }
          // ElevenLabs failed — fall through to OpenAI
        }

        // ── Free path: OpenAI TTS ────────────────────────────
        if (openaiKey) {
          const voiceName = d.voice === 'nova' ? 'nova'
                          : d.voice === 'alloy' ? 'alloy'
                          : d.voice === 'echo' ? 'echo'
                          : 'shimmer';
          const usedToday = await getTodayUsage(db, userId, 'openai');
          if (usedToday >= FREE_OPENAI_DAILY) {
            return { success: false, intent: 'USE_TTS', error: 'Daily TTS limit reached', data: { quota_exhausted: true } };
          }
          const r = await openaiTTS(text, voiceName, d.speed ?? 0.92, openaiKey);
          if (r.audio_url) {
            await logUsage(db, userId, childId, 'openai', voiceName, text.length, 'free');
            return { success: true, intent: 'USE_TTS', data: { ...r, tier: 'free', quota_used: usedToday + 1, quota_limit: FREE_OPENAI_DAILY } };
          }
        }

        // ── No key: demo mode ────────────────────────────────
        return {
          success: true, intent: 'USE_TTS', fallback: true,
          data: { audio_url: null, provider: 'demo', tier: 'demo', message: 'Using Web Speech API — configure API keys to enable premium TTS' }
        };
      }

      // ── TRACK_TTS_USAGE ─────────────────────────────────────
      case 'TRACK_TTS_USAGE': {
        const d = payload.data as {
          provider: string; voice: string; char_count: number; tier: string;
        };
        await logUsage(db, payload.userId ?? 'demo', payload.childId, d.provider, d.voice, d.char_count, d.tier);
        return { success: true, intent: 'TRACK_TTS_USAGE', data: { tracked: true } };
      }

      // ── GET_TTS_QUOTA ────────────────────────────────────────
      case 'GET_TTS_QUOTA': {
        const userId = payload.userId ?? 'demo';
        const elevenUsed = await getTodayUsage(db, userId, 'elevenlabs');
        const openaiUsed = await getTodayUsage(db, userId, 'openai');
        return {
          success: true, intent: 'GET_TTS_QUOTA',
          data: {
            elevenlabs: { used: elevenUsed, limit: FREE_ELEVENLABS_DAILY, remaining: Math.max(0, FREE_ELEVENLABS_DAILY - elevenUsed) },
            openai: { used: openaiUsed, limit: FREE_OPENAI_DAILY, remaining: Math.max(0, FREE_OPENAI_DAILY - openaiUsed) },
            has_premium_tts: !!(env.ELEVENLABS_API_KEY),
            default_voice: env.ELEVENLABS_API_KEY ? 'rachel' : 'shimmer',
          }
        };
      }

      default:
        return { success: false, intent: payload.intent as any, error: 'Unknown intent' };
    }
  }
}
