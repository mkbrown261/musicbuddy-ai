// ============================================================
// API Routes — TTS (Text-to-Speech)
// src/routes/tts.ts
// ============================================================
// REST API facade over the Intent Layer TTS Orchestrator.
// All logic is delegated to src/lib/tts/ modules through the
// Intent Layer. No provider code lives here.
//
// Endpoints:
//   POST /api/tts              — generate / retrieve cached audio
//   POST /api/tts/fallback     — trigger fallback chain manually
//   GET  /api/tts/quota        — current usage + limits for user
//   GET  /api/tts/quota/status — full quota breakdown
//   GET  /api/tts/cache/stats  — cache hit rates, storage info
//   POST /api/tts/cache/evict  — purge expired cache entries
//   GET  /api/tts/prefs        — get voice preferences
//   PUT  /api/tts/prefs        — save voice preferences
//   GET  /api/tts/tier         — resolve voice tier for current user
//   GET  /api/tts/health       — system readiness check
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requestTTS } from '../lib/tts/orchestrator'
import { handleFallback } from '../lib/tts/fallback-handler'
import { evictExpiredCache, getCacheStats } from '../lib/tts/audio-cache'
import {
  getQuotaStatus, saveVoicePreferences, getVoicePreferences
} from '../lib/tts/usage-tracker'
import { resolveVoiceTier, buildRouterContext } from '../lib/tts/voice-router'
import type { TTSRequest, TTSStyle, TTSEmotion, TTSProvider } from '../lib/tts/types'

const app = new Hono<{ Bindings: Bindings }>()

// ── Helper: parse userId from auth header or query param ──────
function resolveUserId(c: any): string {
  // Try Authorization: Bearer <jwt_or_userid>
  const authHeader = c.req.header('Authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    // Basic: if token looks like a plain user ID (no dots), use it
    // Full JWT parsing handled by auth middleware — here we just want
    // a non-empty ID for demo mode detection
    if (token && !token.includes('.')) return token
    // For JWT tokens, fall through to query param
  }
  // Check query param / body userId
  return 'demo'
}

// ════════════════════════════════════════════════════════════
// POST /api/tts
// Generate TTS audio (or return cached hit)
//
// Body: {
//   text:          string        (required)
//   userId?:       string        (optional, default 'demo')
//   childId?:      number
//   sessionId?:    number
//   style?:        TTSStyle      (default 'children_host')
//   emotion?:      TTSEmotion    (default 'friendly')
//   voiceOverride?: string       (force specific voice ID)
//   skipCache?:    boolean       (force regeneration)
// }
//
// Response: TTSResponse (see src/lib/tts/types.ts)
// ════════════════════════════════════════════════════════════
app.post('/', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ success: false, error: 'Database not available' }, 503)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { text, userId, childId, sessionId, style, emotion, voiceOverride, skipCache } = body

  if (!text?.trim()) {
    return c.json({ success: false, error: 'text is required' }, 400)
  }

  const uid = userId ?? resolveUserId(c)

  const request: TTSRequest = {
    text,
    userId:       uid,
    childId:      childId    ? Number(childId)    : undefined,
    sessionId:    sessionId  ? Number(sessionId)  : undefined,
    style:        (style  as TTSStyle)    ?? 'children_host',
    emotion:      (emotion as TTSEmotion) ?? 'friendly',
    voiceOverride: voiceOverride,
    skipCache:    skipCache ?? false,
  }

  try {
    const response = await requestTTS(request, c.env, db)
    return c.json({ success: true, ...response })
  } catch (e: any) {
    console.error('[TTS Route] requestTTS error:', e)
    return c.json({ success: false, error: e.message ?? 'TTS generation failed' }, 500)
  }
})

// ════════════════════════════════════════════════════════════
// POST /api/tts/fallback
// Manually trigger fallback chain
//
// Body: {
//   text:                 string
//   providerPriorityList?: TTSProvider[]   default: ['openai', 'polly']
// }
// ════════════════════════════════════════════════════════════
app.post('/fallback', async (c) => {
  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { text, providerPriorityList } = body
  if (!text?.trim()) return c.json({ success: false, error: 'text is required' }, 400)

  const chain: TTSProvider[] = providerPriorityList ?? ['openai', 'polly']
  const result = await handleFallback(text, c.env, chain)

  return c.json({
    success:  !!(result.response.audioUrl),
    ...result.response,
    attemptedChain: result.attemptedChain,
  })
})

// ════════════════════════════════════════════════════════════
// GET /api/tts/quota
// Simple quota check for the current user
// Query params: userId (optional)
// ════════════════════════════════════════════════════════════
app.get('/quota', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  const userId = c.req.query('userId') ?? 'demo'

  const quota = await getQuotaStatus(
    db,
    userId,
    !!(c.env.ELEVENLABS_API_KEY),
    !!(c.env.OPENAI_API_KEY),
    !!(c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY)
  )

  return c.json({ success: true, userId, quota })
})

// ════════════════════════════════════════════════════════════
// GET /api/tts/quota/status  — alias with more detail
// ════════════════════════════════════════════════════════════
app.get('/quota/status', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  const userId = c.req.query('userId') ?? 'demo'

  const [quota, tier] = await Promise.all([
    getQuotaStatus(
      db, userId,
      !!(c.env.ELEVENLABS_API_KEY),
      !!(c.env.OPENAI_API_KEY),
      !!(c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY)
    ),
    resolveVoiceTier(
      buildRouterContext(c.env, db, userId),
      { text: '', userId, style: 'neutral', emotion: 'friendly' }
    ),
  ])

  return c.json({
    success: true,
    userId,
    currentTier: {
      tier:   tier.tier,
      reason: tier.reason,
      trialRemaining: tier.trialRemaining,
    },
    quota,
    providers: {
      elevenlabs: !!(c.env.ELEVENLABS_API_KEY),
      openai:     !!(c.env.OPENAI_API_KEY),
      polly:      !!(c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY),
    },
  })
})

// ════════════════════════════════════════════════════════════
// GET /api/tts/cache/stats
// Cache performance metrics
// ════════════════════════════════════════════════════════════
app.get('/cache/stats', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  const stats = await getCacheStats(db)
  return c.json({ success: true, stats })
})

// ════════════════════════════════════════════════════════════
// POST /api/tts/cache/evict
// Purge expired cache entries (maintenance endpoint)
// ════════════════════════════════════════════════════════════
app.post('/cache/evict', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  const evicted = await evictExpiredCache(db)
  return c.json({ success: true, evicted, message: `Evicted ${evicted} expired cache entries` })
})

// ════════════════════════════════════════════════════════════
// GET /api/tts/prefs
// Load voice preferences for a user (optionally per child)
// Query params: userId, childId (optional — loads child-specific prefs
//               if set, falls back to user-level if not found)
// ════════════════════════════════════════════════════════════
app.get('/prefs', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  const userId  = c.req.query('userId')  ?? 'demo'
  const childId = c.req.query('childId') ? parseInt(c.req.query('childId')!) : undefined
  const prefs   = await getVoicePreferences(db, userId, childId)

  // Normalize to what the frontend VOICE_PERSONALITY module expects
  if (prefs) {
    return c.json({
      success: true, userId, childId: childId ?? -1,
      isChildSpecific: prefs.isChildSpecific ?? false,
      data: {
        voiceGender:          prefs.voiceGender          ?? 'female',
        voiceCharacter:       prefs.voiceCharacter       ?? 'luna',
        voiceStyle:           prefs.voiceStyle           ?? 'default',
        stability:            prefs.stability            ?? 0.35,
        styleBoost:           prefs.styleBoost           ?? 0.75,
        similarity:           prefs.similarity           ?? 0.60,
        groqPersonality:      prefs.groqPersonality      ?? true,
        singingMode:          prefs.singingMode          ?? false,
        speed:                prefs.speed                ?? 0.95,
        preferredProvider:    prefs.preferredProvider,
        elevenlabsVoice:      prefs.elevenlabsVoice,
        elevenlabsVoiceName:  prefs.elevenlabsVoiceName  ?? 'Luna',
        openaiVoice:          prefs.openaiVoice,
        openaiVoiceLabel:     prefs.openaiVoiceLabel     ?? 'Nova (Warm female)',
      },
      prefs,
    })
  }
  return c.json({ success: true, userId, childId: childId ?? -1, data: null, prefs: null })
})

// ════════════════════════════════════════════════════════════
// PUT /api/tts/prefs
// Save voice preferences for a user (or a specific child)
//
// Body: {
//   userId?:              string
//   childId?:             number   (pass > 0 to save per-child prefs)
//   preferredProvider?:  'openai' | 'elevenlabs' | 'polly'
//   openaiVoice?:         string   (shimmer | nova | alloy | echo | fable | onyx)
//   openaiVoiceLabel?:    string   (human-readable label)
//   elevenlabsVoice?:     string   (voice ID, e.g. EXAVITQu4vr4xnSDxMaL)
//   elevenlabsVoiceName?: string   (human-readable, e.g. Luna)
//   pollyVoice?:          string   (joanna | salli | kendra | ivy | amy | brian)
//   speed?:               number   (0.5–2.0)
//   defaultEmotion?:      string
//   singingMode?:         boolean
// }
// ════════════════════════════════════════════════════════════
app.put('/prefs', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const userId  = body.userId  ?? 'demo'
  const childId = body.childId ? Number(body.childId) : -1
  const {
    preferredProvider, openaiVoice, openaiVoiceLabel,
    elevenlabsVoice, elevenlabsVoiceName,
    pollyVoice, speed, defaultEmotion, singingMode,
    // Phase 2: full VOICE_PERSONALITY fields from frontend
    voiceGender, voiceStyle, stability, styleBoost, similarity,
    groqPersonality, voiceCharacter,
  } = body

  await saveVoicePreferences(db, userId, {
    preferredProvider, openaiVoice, openaiVoiceLabel,
    elevenlabsVoice, elevenlabsVoiceName,
    pollyVoice, speed, defaultEmotion, singingMode,
    voiceGender,
    voiceCharacter,
    voiceStyle,
    stability:       stability   != null ? parseFloat(stability)   : undefined,
    styleBoost:      styleBoost  != null ? parseFloat(styleBoost)  : undefined,
    similarity:      similarity  != null ? parseFloat(similarity)  : undefined,
    groqPersonality: groqPersonality != null ? Boolean(groqPersonality) : undefined,
    childId,
  })

  return c.json({ success: true, userId, childId, message: 'Voice preferences saved' })
})

// ════════════════════════════════════════════════════════════
// GET /api/tts/tier
// Resolve voice tier for current user (no generation)
// Query params: userId (optional)
// ════════════════════════════════════════════════════════════
app.get('/tier', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'Database not available' }, 503)

  const userId  = c.req.query('userId') ?? 'demo'
  const ctx     = buildRouterContext(c.env, db, userId)
  const request: TTSRequest = {
    text: '', userId, style: 'neutral', emotion: 'friendly',
  }

  const resolution = await resolveVoiceTier(ctx, request)
  return c.json({
    success: true,
    userId,
    tier:           resolution.tier,
    reason:         resolution.reason,
    trialRemaining: resolution.trialRemaining,
    voiceConfig:    resolution.voiceConfig,
    providers: {
      elevenlabs: !!(c.env.ELEVENLABS_API_KEY),
      openai:     !!(c.env.OPENAI_API_KEY),
      polly:      !!(c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY),
    },
  })
})

// ════════════════════════════════════════════════════════════
// GET /api/tts/health
// System readiness check — verifies keys configured, DB alive
// ════════════════════════════════════════════════════════════
app.get('/health', async (c) => {
  const db = c.env.DB
  let dbAlive = false
  try {
    await db.prepare('SELECT 1').first()
    dbAlive = true
  } catch { /* DB not ready */ }

  const providers = {
    elevenlabs: { configured: !!(c.env.ELEVENLABS_API_KEY), tier: 'premium/trial' },
    openai:     { configured: !!(c.env.OPENAI_API_KEY),     tier: 'free (default)' },
    polly:      { configured: !!(c.env.AWS_ACCESS_KEY_ID && c.env.AWS_SECRET_ACCESS_KEY), tier: 'fallback' },
  }

  const anyProviderConfigured = Object.values(providers).some(p => p.configured)

  return c.json({
    status:   dbAlive && anyProviderConfigured ? 'ok' : (dbAlive ? 'demo' : 'degraded'),
    db:       dbAlive,
    providers,
    mode:     !anyProviderConfigured
      ? 'demo (browser Web Speech API)'
      : (providers.elevenlabs.configured ? 'premium (ElevenLabs)' : 'free (OpenAI)'),
    architecture: 'RequestTTS → VoiceRouter → Cache → Provider → TrackUsage',
    timestamp: new Date().toISOString(),
  })
})

export { app as tts }
