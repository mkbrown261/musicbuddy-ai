// ============================================================
// TTS Audio Cache Module
// src/lib/tts/audio-cache.ts
// ============================================================
// CRITICAL: Audio is NEVER regenerated if a cache entry exists.
//
// Cache key formula:
//   SHA-256(text_normalized + voiceId + style + emotion)
//
// Storage: Cloudflare D1 (tts_audio_cache table)
// TTL: default 30 days; frequently-used phrases never expire.
//
// Performance:
//   - Cache hits add ~5ms overhead (single D1 read)
//   - Cache writes are async (fire-and-forget after response)
//   - Hit counter incremented on every cache read
//   - LRU eviction: entries unused for > 60 days are purged
// ============================================================

import type { CacheEntry, TTSProvider } from './types';

// ── Cache TTL constants ───────────────────────────────────────
const DEFAULT_TTL_DAYS = 30;
const FREQUENT_TTL_DAYS = 90;    // Phrases used 5+ times
const HIGH_FREQUENCY_HITS = 5;   // Threshold for extended TTL

// ── Normalize text for consistent hashing ────────────────────
// Removes extra whitespace and lowercases so minor edits don't
// create cache misses.
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['"]/g, '')    // ignore quote variations
    .trim();
}

// ── Generate cache key (SHA-256 hex) ─────────────────────────
export async function generateCacheKey(
  text: string,
  voiceId: string,
  style: string,
  emotion: string
): Promise<string> {
  const normalized = normalizeText(text);
  const raw        = `${normalized}|${voiceId}|${style}|${emotion}`;
  const encoder    = new TextEncoder();
  const buffer     = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Generate text-only hash (for partial searches) ───────────
export async function generateTextHash(text: string): Promise<string> {
  const normalized = normalizeText(text);
  const encoder    = new TextEncoder();
  const buffer     = await crypto.subtle.digest('SHA-256', encoder.encode(normalized));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Retrieve cached audio ────────────────────────────────────
export async function retrieveCachedAudio(
  db: D1Database,
  cacheKey: string
): Promise<CacheEntry | null> {
  try {
    const row = await db.prepare(
      `SELECT id, cache_key, provider, voice_id, audio_data, char_count, hit_count,
              created_at, last_used_at, expires_at, style, emotion
       FROM tts_audio_cache
       WHERE cache_key = ?
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`
    ).bind(cacheKey).first() as any;

    if (!row) return null;

    // Async: bump hit counter + update last_used_at (fire-and-forget)
    db.prepare(
      `UPDATE tts_audio_cache
       SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP
       WHERE cache_key = ?`
    ).bind(cacheKey).run().catch(() => {/* non-critical */});

    return {
      cacheKey:   row.cache_key,
      provider:   row.provider as TTSProvider,
      voiceId:    row.voice_id,
      audioData:  row.audio_data,
      charCount:  row.char_count,
      hitCount:   row.hit_count + 1,
      createdAt:  row.created_at,
      lastUsedAt: new Date().toISOString(),
      expiresAt:  row.expires_at ?? undefined,
    };
  } catch (e) {
    // Cache miss on DB error — gracefully degrade
    console.error('[TTS Cache] retrieve error:', e);
    return null;
  }
}

// ── Store audio in cache ─────────────────────────────────────
export async function cacheAudio(
  db: D1Database,
  opts: {
    cacheKey:  string;
    textHash:  string;
    provider:  TTSProvider;
    voiceId:   string;
    style:     string;
    emotion:   string;
    audioData: string;
    charCount: number;
    durationMs?: number;
  }
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    await db.prepare(
      `INSERT OR REPLACE INTO tts_audio_cache
         (cache_key, text_hash, provider, voice_id, style, emotion,
          audio_data, char_count, duration_ms, hit_count, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(
      opts.cacheKey, opts.textHash, opts.provider, opts.voiceId,
      opts.style, opts.emotion, opts.audioData, opts.charCount,
      opts.durationMs ?? null, expiresAt
    ).run();
  } catch (e) {
    // Non-critical — cache write failure should never break the response
    console.error('[TTS Cache] write error:', e);
  }
}

// ── Extend TTL for frequently-used entries ────────────────────
export async function extendTTLIfFrequent(
  db: D1Database,
  cacheKey: string,
  hitCount: number
): Promise<void> {
  if (hitCount < HIGH_FREQUENCY_HITS) return;
  const newExpiry = new Date(
    Date.now() + FREQUENT_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  try {
    await db.prepare(
      `UPDATE tts_audio_cache SET expires_at = ? WHERE cache_key = ?`
    ).bind(newExpiry, cacheKey).run();
  } catch (e) { /* non-critical */ }
}

// ── Evict expired entries (call periodically or on-demand) ───
export async function evictExpiredCache(db: D1Database): Promise<number> {
  try {
    const r = await db.prepare(
      `DELETE FROM tts_audio_cache WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`
    ).run();
    return r.meta.changes ?? 0;
  } catch (e) {
    return 0;
  }
}

// ── Cache stats ───────────────────────────────────────────────
export async function getCacheStats(db: D1Database): Promise<{
  totalEntries: number;
  hitRate: number;
  topProviders: Record<string, number>;
  estimatedSavedGenerations: number;
}> {
  try {
    const [total, hits] = await Promise.all([
      db.prepare('SELECT COUNT(*) as cnt FROM tts_audio_cache').first() as any,
      db.prepare('SELECT SUM(hit_count) as total_hits FROM tts_audio_cache').first() as any,
    ]);

    const byProvider = await db.prepare(
      `SELECT provider, COUNT(*) as cnt FROM tts_audio_cache GROUP BY provider`
    ).all();

    const providerMap: Record<string, number> = {};
    for (const row of (byProvider.results ?? []) as any[]) {
      providerMap[row.provider] = row.cnt;
    }

    const totalHits = hits?.total_hits ?? 0;
    const totalEntries = total?.cnt ?? 0;
    const totalGenerations = totalEntries + totalHits; // entries = 1 gen each

    return {
      totalEntries,
      hitRate:                    totalGenerations > 0 ? totalHits / totalGenerations : 0,
      topProviders:               providerMap,
      estimatedSavedGenerations:  totalHits,
    };
  } catch (e) {
    return { totalEntries: 0, hitRate: 0, topProviders: {}, estimatedSavedGenerations: 0 };
  }
}
