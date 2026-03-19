// ============================================================
// TTS Provider Adapter — Amazon Polly
// src/lib/tts/providers/polly.ts
// ============================================================
// Fallback TTS: ultra-reliable, low cost, global scaling.
// Engine: Neural (NTTS) — much better than standard.
// Auth: AWS Signature V4 (HMAC-SHA256) — no SDK required.
//
// COST: ~$0.004 per 1,000 characters (NTTS)
// LATENCY: ~200-600ms
// BEST FOR: system stability, failover, high-volume scaling
//
// Required env vars:
//   AWS_ACCESS_KEY_ID
//   AWS_SECRET_ACCESS_KEY
//   AWS_REGION  (default: us-east-1)
// ============================================================

import type { VoiceConfig, TTSResponse } from '../types';
import { COST_PER_CHAR, POLLY_VOICES } from '../types';
import { sanitizeForTTS } from './openai';

// ── AWS Signature V4 helpers ──────────────────────────────────
async function hmacSHA256(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyData = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return hexEncode(buffer);
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const kDate    = await hmacSHA256(enc.encode('AWS4' + secretKey), dateStamp);
  const kRegion  = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  return hmacSHA256(kService, 'aws4_request');
}

// ── Resolve Polly voice ID ─────────────────────────────────────
function resolvePollyVoice(voiceId: string): string {
  const lower = voiceId.toLowerCase();
  if (POLLY_VOICES[lower]) return POLLY_VOICES[lower].id;
  // Check if it's already a valid Polly voice ID
  const allIds = Object.values(POLLY_VOICES).map(v => v.id);
  if (allIds.includes(voiceId)) return voiceId;
  return 'Joanna'; // default fallback
}

// ── Main Polly call (AWS SigV4 signed) ────────────────────────
export async function generatePollyTTS(
  text: string,
  config: VoiceConfig,
  credentials: { accessKeyId: string; secretAccessKey: string; region?: string }
): Promise<TTSResponse> {
  const startMs  = Date.now();
  const region   = credentials.region ?? 'us-east-1';
  const cleanText = sanitizeForTTS(text);

  if (!cleanText) {
    return {
      audioUrl: null, provider: 'polly', voiceId: config.voiceId,
      tier: 'fallback', cacheHit: false, charCount: 0,
      error: 'Empty text after sanitization',
    };
  }

  const voiceId    = resolvePollyVoice(config.voiceId);
  const truncated  = cleanText.slice(0, 3000); // Polly limit per call

  // Polly supports SSML — use it for children's app expressiveness
  const isSinging = config.emotion === 'singing' || config.style === 'singing';
  let inputText: string;
  let textType: string;

  if (isSinging) {
    // SSML with prosody for singing effect
    inputText = `<speak><prosody rate="${Math.round((config.speed ?? 0.95) * 100)}%" pitch="+10%">${
      truncated.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }</prosody></speak>`;
    textType = 'ssml';
  } else {
    inputText = truncated;
    textType  = 'text';
  }

  // Build request body
  const requestBody = JSON.stringify({
    Text:         inputText,
    TextType:     textType,
    VoiceId:      voiceId,
    Engine:       'neural',           // NTTS — much better quality
    OutputFormat: 'mp3',
    SampleRate:   '24000',
  });

  // ── AWS Signature V4 signing ──────────────────────────────
  const now       = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate   = now.toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z';
  const service   = 'polly';
  const host      = `polly.${region}.amazonaws.com`;
  const endpoint  = `https://${host}/v1/speech`;
  const method    = 'POST';
  const path      = '/v1/speech';

  const payloadHash = await sha256Hex(requestBody);

  const canonicalHeaders = [
    `content-type:application/json`,
    `host:${host}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';

  const signedHeaders    = 'content-type;host;x-amz-date';
  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const canonicalHash    = await sha256Hex(canonicalRequest);
  const credentialScope  = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign     = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalHash].join('\n');

  const signingKey  = await getSigningKey(credentials.secretAccessKey, dateStamp, region, service);
  const encoder     = new TextEncoder();
  const sigCrypto   = await crypto.subtle.importKey(
    'raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer   = await crypto.subtle.sign('HMAC', sigCrypto, encoder.encode(stringToSign));
  const signature   = hexEncode(sigBuffer);
  const authHeader  = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host':         host,
        'X-Amz-Date':  amzDate,
        'Authorization': authHeader,
      },
      body: requestBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      let userError = `Polly ${res.status}`;
      if (res.status === 403) userError = 'Amazon Polly: invalid credentials';
      else if (res.status === 400) userError = 'Amazon Polly: invalid request';

      return {
        audioUrl: null, provider: 'polly', voiceId,
        tier: 'fallback', cacheHit: false, charCount: truncated.length,
        latencyMs: Date.now() - startMs,
        error: userError,
      };
    }

    // Polly returns raw audio bytes directly
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) {
      return {
        audioUrl: null, provider: 'polly', voiceId,
        tier: 'fallback', cacheHit: false, charCount: truncated.length,
        latencyMs: Date.now() - startMs,
        error: 'Polly returned empty audio',
      };
    }

    const bytes = new Uint8Array(buffer);
    let binary  = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength)));
    }
    const audioUrl = `data:audio/mpeg;base64,${btoa(binary)}`;

    return {
      audioUrl,
      provider:  'polly',
      voiceId,
      tier:      'fallback',
      cacheHit:  false,
      charCount: truncated.length,
      latencyMs: Date.now() - startMs,
      // @ts-ignore
      _costUnits: truncated.length * COST_PER_CHAR.polly,
    };
  } catch (e: any) {
    return {
      audioUrl: null, provider: 'polly', voiceId,
      tier: 'fallback', cacheHit: false, charCount: truncated.length,
      latencyMs: Date.now() - startMs,
      error: `Polly network error: ${e.message}`,
    };
  }
}
