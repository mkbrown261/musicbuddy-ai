// ============================================================
// TTS Fallback Handler
// src/lib/tts/fallback-handler.ts
// ============================================================
// Automatically switches providers when the primary fails.
//
// Fallback chain (configurable):
//   ElevenLabs → OpenAI → Amazon Polly → demo
//
// Triggers:
//   - HTTP error from provider (4xx, 5xx)
//   - Timeout (> 8 seconds)
//   - Empty audio response
//   - Quota exceeded (429)
//
// Returns the first successful response plus an audit trail
// of every attempt made, for logging and debugging.
// ============================================================

import type { VoiceConfig, TTSResponse, FallbackResult, TTSProvider } from './types';
import { TIER_DEFAULTS } from './types';
import { generateOpenAITTS } from './providers/openai';
import { generateElevenLabsTTS } from './providers/elevenlabs';
import { generatePollyTTS } from './providers/polly';

// ── Timeout wrapper ───────────────────────────────────────────
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer!);
    return result;
  } catch (e) {
    clearTimeout(timer!);
    throw e;
  }
}

// ── Provider call registry ────────────────────────────────────
async function callProvider(
  provider: TTSProvider,
  text: string,
  env: any,
  overrideConfig?: Partial<VoiceConfig>
): Promise<TTSResponse> {
  const TIMEOUT_MS = 8000; // 8s max per provider attempt

  switch (provider) {
    case 'elevenlabs': {
      if (!env.ELEVENLABS_API_KEY) {
        return {
          audioUrl: null, provider: 'elevenlabs', voiceId: 'rachel',
          tier: 'premium', cacheHit: false, charCount: 0,
          error: 'ElevenLabs API key not configured',
        };
      }
      const config: VoiceConfig = {
        ...TIER_DEFAULTS.premium,
        ...overrideConfig,
      };
      return withTimeout(
        generateElevenLabsTTS(text, config, env.ELEVENLABS_API_KEY),
        TIMEOUT_MS,
        'ElevenLabs timeout after 8s'
      );
    }

    case 'openai': {
      if (!env.OPENAI_API_KEY) {
        return {
          audioUrl: null, provider: 'openai', voiceId: 'shimmer',
          tier: 'free', cacheHit: false, charCount: 0,
          error: 'OpenAI API key not configured',
        };
      }
      const config: VoiceConfig = {
        ...TIER_DEFAULTS.free,
        ...overrideConfig,
      };
      return withTimeout(
        generateOpenAITTS(text, config, env.OPENAI_API_KEY),
        TIMEOUT_MS,
        'OpenAI TTS timeout after 8s'
      );
    }

    case 'polly': {
      if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
        return {
          audioUrl: null, provider: 'polly', voiceId: 'Joanna',
          tier: 'fallback', cacheHit: false, charCount: 0,
          error: 'AWS credentials not configured',
        };
      }
      const config: VoiceConfig = {
        ...TIER_DEFAULTS.fallback,
        ...overrideConfig,
      };
      return withTimeout(
        generatePollyTTS(text, config, {
          accessKeyId:     env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          region:          env.AWS_REGION ?? 'us-east-1',
        }),
        TIMEOUT_MS,
        'Amazon Polly timeout after 8s'
      );
    }

    case 'demo':
    default:
      return {
        audioUrl: null, provider: 'demo', voiceId: 'browser',
        tier: 'demo', cacheHit: false, charCount: 0,
        error: 'No TTS providers available — using browser speech',
      };
  }
}

// ── Is this response a success? ───────────────────────────────
function isSuccess(response: TTSResponse): boolean {
  return !!(response.audioUrl && !response.error);
}

// ── Main fallback handler ─────────────────────────────────────
export async function handleFallback(
  text: string,
  env: any,
  priorityList: TTSProvider[] = ['elevenlabs', 'openai', 'polly'],
  overrideConfig?: Partial<VoiceConfig>
): Promise<FallbackResult> {
  const attemptedChain: Array<{ provider: TTSProvider; error: string }> = [];
  const chain = [...priorityList, 'demo' as TTSProvider]; // always end with demo

  for (const provider of chain) {
    let response: TTSResponse;

    try {
      response = await callProvider(provider, text, env, overrideConfig);
    } catch (e: any) {
      response = {
        audioUrl: null, provider, voiceId: 'unknown',
        tier: 'fallback', cacheHit: false, charCount: 0,
        error: `Unexpected error: ${e.message}`,
      };
    }

    if (isSuccess(response)) {
      // Mark response as having used fallback if not the first provider
      const usedFallback = attemptedChain.length > 0;
      return {
        response: {
          ...response,
          fallbackUsed:   usedFallback,
          fallbackChain:  attemptedChain.map(a => a.provider),
        },
        attemptedChain,
      };
    }

    // Record failed attempt
    attemptedChain.push({ provider, error: response.error ?? 'Unknown error' });

    // If this is the demo provider and it returned null, we're done
    if (provider === 'demo') break;
  }

  // All providers failed — return demo fallback
  return {
    response: {
      audioUrl:     null,
      provider:     'demo',
      voiceId:      'browser',
      tier:         'demo',
      cacheHit:     false,
      charCount:    0,
      fallbackUsed: true,
      fallbackChain: attemptedChain.map(a => a.provider),
      error:        `All TTS providers failed: ${attemptedChain.map(a => `${a.provider}(${a.error})`).join(', ')}`,
    },
    attemptedChain,
  };
}

// ── Determine fallback chain from error type ──────────────────
// Context-aware: e.g. if ElevenLabs 429s, skip it next time
export function buildFallbackChain(
  failedProvider: TTSProvider,
  allAvailableProviders: TTSProvider[]
): TTSProvider[] {
  return allAvailableProviders.filter(p => p !== failedProvider);
}
