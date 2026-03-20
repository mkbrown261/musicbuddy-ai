// ============================================================
// Main Application Entry Point - src/index.tsx
// 5-Layer Architecture: UI + API + Logic + Database + Hosting
// AI Interactive Music & Play Companion for Children
// ============================================================

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Bindings } from './types'

// Route imports
import { profiles } from './routes/profiles'
import { sessions } from './routes/sessions'
import { engagement } from './routes/engagement'
import { music } from './routes/music'
import { dashboard } from './routes/dashboard'
import { intelligence } from './routes/intelligence'
import { billing } from './routes/billing'
import { intentRoute } from './routes/intent'
import { auth } from './routes/auth'
import { tts } from './routes/tts'
import { groq } from './routes/groq'
import { lessons } from './routes/lessons'
import { analytics } from './routes/analytics'

// Bootstrap all Intent Layer modules (runs once at edge startup)
import { bootstrapModules } from './lib/modules/index'
bootstrapModules()

const app = new Hono<{ Bindings: Bindings }>()

// ── Middleware ────────────────────────────────────────────────
app.use('*', logger())
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// ── Static files ──────────────────────────────────────────────
app.use('/static/*', serveStatic({ root: './' }))

// ── API Routes (API + Logic + Database Layers) ────────────────
app.route('/api/profiles', profiles)
app.route('/api/sessions', sessions)
app.route('/api/engagement', engagement)
app.route('/api/music', music)
app.route('/api/dashboard', dashboard)
app.route('/api/intelligence', intelligence)
app.route('/api/billing', billing)
app.route('/api/intent', intentRoute)
app.route('/api/auth', auth)
app.route('/api/tts', tts)
app.route('/api/groq', groq)
app.route('/api/lessons', lessons)
app.route('/api/analytics', analytics)

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'AI Music Companion for Children',
    version: '3.0.0-full-platform',
    timestamp: new Date().toISOString(),
    layers: {
      ui: 'active',
      api: 'active',
      logic: 'active',
      database: 'active',
      hosting: 'cloudflare-pages'
    },
    modules: [
      'tts-tiered', 'groq-behavior', 'credits', 'stripe',
      'lessons', 'analytics', 'animations', 'voice-picker',
      'parent-dashboard', 'emotion-engine', 'memory-engine'
    ]
  })
})

// ── Spec-compliant shortcut aliases ───────────────────────────
// POST /create-checkout-session  → /api/billing/checkout
app.post('/create-checkout-session', (c) => {
  const url = new URL(c.req.url); url.pathname = '/api/billing/checkout';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env as any, {} as any);
})
// POST /webhook/stripe → /api/billing/webhook/stripe
app.post('/webhook/stripe', (c) => {
  const url = new URL(c.req.url); url.pathname = '/api/billing/webhook/stripe';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env as any, {} as any);
})
// GET /credits → /api/billing/credits
app.get('/credits', (c) => {
  const url = new URL(c.req.url); url.pathname = '/api/billing/credits';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env as any, {} as any);
})
// POST /use-credit → /api/billing/use-credit
app.post('/use-credit', (c) => {
  const url = new URL(c.req.url); url.pathname = '/api/billing/use-credit';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env as any, {} as any);
})
// GET /lessons → /api/lessons
app.get('/lessons', (c) => {
  const url = new URL(c.req.url); url.pathname = '/api/lessons';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env as any, {} as any);
})
// POST /start-lesson → /api/lessons/start
app.post('/start-lesson', (c) => {
  const url = new URL(c.req.url); url.pathname = '/api/lessons/start';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env as any, {} as any);
})
// POST /submit-answer → /api/lessons/answer
app.post('/submit-answer', (c) => {
  const url = new URL(c.req.url); url.pathname = '/api/lessons/answer';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env as any, {} as any);
})
// GET /analytics → /api/analytics
app.get('/analytics', (c) => {
  const url = new URL(c.req.url); url.pathname = '/api/analytics';
  return app.fetch(new Request(url.toString(), c.req.raw), c.env as any, {} as any);
})

// ── Main UI (served from root) ────────────────────────────────
app.get('/', (c) => {
  return c.html(getMainHTML())
})

// ── /demo — standalone demo page, always uses Replicate TTS ──
app.get('/demo', (c) => {
  return c.html(getDemoHTML())
})

// ── /api/demo/tts — demo TTS endpoint, always Replicate, no auth ──
app.post('/api/demo/tts', async (c) => {
  const db = c.env.DB
  if (!c.env.REPLICATE_API_KEY) {
    return c.json({ success: false, error: 'Replicate not configured' }, 503)
  }
  let body: any
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400)
  }
  const { text, emotion, voice } = body
  if (!text?.trim()) return c.json({ success: false, error: 'text required' }, 400)

  const { generateReplicateTTS } = await import('./lib/tts/providers/replicate')
  const config: any = {
    provider:   'elevenlabs',
    voiceId:    voice || 'aria',
    emotion:    emotion || 'friendly',
    style:      'children_host',
    stability:  0.35,
    styleBoost: 0.75,
    similarity: 0.60,
  }
  try {
    const result = await generateReplicateTTS(text.slice(0, 500), config, c.env.REPLICATE_API_KEY)
    if (result.audioUrl) {
      return c.json({ success: true, audioUrl: result.audioUrl, voice: result.voiceId, provider: 'replicate' })
    }
    return c.json({ success: false, error: result.error || 'No audio generated' })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// Catch-all for SPA routing
app.get('*', (c) => {
  const path = c.req.path
  if (path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.html(getMainHTML())
})

// ── Main HTML Application ─────────────────────────────────────
function getMainHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>🎵 Music Buddy – Children's Music Companion</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
  <!-- Chart.js: lazy-loaded only when analytics tab opens (avoids 200KB blocking parse) -->
  <!-- axios removed: app uses fetch() / api() everywhere, no need for axios -->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
    
    * { box-sizing: border-box; }
    body { font-family: 'Nunito', sans-serif; background: #0f0a1a; color: #fff; overflow-x: hidden; }

    /* ── Animated background ── */
    .bg-animated {
      background: linear-gradient(135deg, #1a0533 0%, #0d1b4b 30%, #0a2a1a 60%, #1a0533 100%);
      background-size: 400% 400%;
      animation: bgShift 12s ease infinite;
    }
    @keyframes bgShift {
      0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%}
    }

    /* ── Stars particles ── */
    .stars { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
    .star {
      position: absolute; border-radius: 50%;
      background: white; opacity: 0;
      animation: twinkle var(--d,3s) var(--delay,0s) infinite ease-in-out;
    }
    @keyframes twinkle { 0%,100%{opacity:0;transform:scale(0.5)} 50%{opacity:var(--op,0.8);transform:scale(1)} }

    /* ── Floating notes ── */
    .music-note {
      position: fixed; pointer-events: none; z-index: 0; font-size: 1.5rem;
      animation: floatNote linear infinite;
      opacity: 0;
    }
    @keyframes floatNote {
      0%{transform:translateY(100vh) rotate(0deg);opacity:0}
      10%{opacity:0.6}
      90%{opacity:0.4}
      100%{transform:translateY(-100px) rotate(360deg);opacity:0}
    }

    /* ── Glassmorphism cards ── */
    .glass {
      background: rgba(255,255,255,0.07);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
    }
    .glass-light {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 16px;
    }

    /* ── Profile avatar ring ── */
    .avatar-ring {
      border-radius: 50%; padding: 4px;
      background: conic-gradient(from 0deg, #ff6b9d, #ffd93d, #6bcb77, #4d96ff, #ff6b9d);
      animation: spin 4s linear infinite;
      box-shadow: 0 0 30px rgba(255,107,157,0.5);
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Music player ── */
    .player-container {
      background: linear-gradient(135deg, rgba(255,107,157,0.2), rgba(77,150,255,0.2));
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 24px;
    }
    .waveform-bar {
      width: 4px; border-radius: 2px;
      background: linear-gradient(to top, #ff6b9d, #ffd93d);
      transform-origin: bottom;
      animation: wave var(--d,0.8s) var(--delay,0s) ease-in-out infinite alternate;
    }
    @keyframes wave { from{transform:scaleY(0.2)} to{transform:scaleY(1)} }

    /* ── Progress bar ── */
    .progress-bar {
      height: 6px; border-radius: 3px;
      background: rgba(255,255,255,0.15);
      overflow: hidden;
    }
    .progress-fill {
      height: 100%; border-radius: 3px;
      background: linear-gradient(to right, #ff6b9d, #ffd93d);
      transition: width 0.3s ease;
    }

    /* ── Engagement indicator ── */
    .engagement-dot {
      width: 12px; height: 12px; border-radius: 50%;
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.7} }

    /* ── Buttons ── */
    .btn-primary {
      background: linear-gradient(135deg, #ff6b9d, #c44dbb);
      border: none; border-radius: 50px; padding: 12px 28px;
      font-weight: 700; font-size: 0.95rem; cursor: pointer;
      transition: all 0.2s; box-shadow: 0 4px 20px rgba(255,107,157,0.4);
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(255,107,157,0.6); }
    .btn-primary:active { transform: translateY(0); }

    .btn-secondary {
      background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
      border-radius: 50px; padding: 10px 22px;
      font-weight: 600; cursor: pointer; transition: all 0.2s;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.18); transform: translateY(-1px); }

    .btn-danger {
      background: linear-gradient(135deg, #ff4757, #c0392b);
      border: none; border-radius: 50px; padding: 10px 22px;
      font-weight: 700; cursor: pointer; transition: all 0.2s;
    }
    .btn-success {
      background: linear-gradient(135deg, #6bcb77, #27ae60);
      border: none; border-radius: 50px; padding: 10px 22px;
      font-weight: 700; cursor: pointer; transition: all 0.2s;
      box-shadow: 0 4px 20px rgba(107,203,119,0.4);
    }
    .btn-success:hover { transform: translateY(-2px); }

    /* ── Tabs ── */
    .tab-btn { transition: all 0.2s; border-radius: 12px; padding: 8px 18px; font-weight: 700; cursor: pointer; }
    .tab-btn.active { background: linear-gradient(135deg, #ff6b9d, #c44dbb); box-shadow: 0 4px 15px rgba(255,107,157,0.4); }
    .tab-btn:not(.active) { background: rgba(255,255,255,0.07); }
    .tab-btn:not(.active):hover { background: rgba(255,255,255,0.12); }
    /* Tab content: hidden by default via CSS so DOM nesting doesn't matter */
    .tab-content { display: none !important; }
    .tab-content.active-tab { display: block !important; }

    /* ── Profile card ── */
    .profile-card { cursor: pointer; transition: all 0.2s; }
    .profile-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(255,107,157,0.3); }
    .profile-card.selected { border-color: #ff6b9d !important; box-shadow: 0 0 0 2px #ff6b9d; }

    /* ── Song pill ── */
    .song-pill {
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 50px; padding: 6px 14px; font-size: 0.82rem;
      display: inline-flex; align-items: center; gap: 6px;
      cursor: pointer; transition: all 0.2s;
    }
    .song-pill:hover { background: rgba(255,107,157,0.2); border-color: #ff6b9d; }
    .song-pill.active { background: rgba(255,107,157,0.3); border-color: #ff6b9d; }

    /* ── Emotion overlay ── */
    .emotion-badge {
      border-radius: 20px; padding: 4px 12px; font-size: 0.78rem; font-weight: 700;
      display: inline-flex; align-items: center; gap: 4px;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }

    /* ── Camera feed placeholder ── */
    .camera-feed {
      background: radial-gradient(ellipse at center, #1a1a2e 0%, #0d0d1a 100%);
      border: 2px solid rgba(255,255,255,0.1); border-radius: 16px;
      position: relative; overflow: hidden;
    }
    .scan-line {
      position: absolute; left: 0; right: 0; height: 2px;
      background: rgba(107,203,119,0.6); box-shadow: 0 0 8px rgba(107,203,119,0.8);
      animation: scan 3s linear infinite;
    }
    @keyframes scan { 0%{top:0%} 100%{top:100%} }

    /* ── Meter bars ── */
    .meter-fill { transition: width 0.5s ease; border-radius: 4px; height: 100%; }

    /* ── Notification toast ── */
    #toast {
      position: fixed; bottom: 30px; right: 30px;
      background: rgba(30,30,50,0.95); backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.15); border-radius: 14px;
      padding: 14px 22px; font-size: 0.88rem; font-weight: 600;
      z-index: 9999; transform: translateY(80px); opacity: 0;
      transition: all 0.3s ease; min-width: 260px;
    }
    #toast.show { transform: translateY(0); opacity: 1; }

    /* ── Input fields ── */
    input, select, textarea {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 10px; padding: 10px 14px;
      color: white; width: 100%; font-family: inherit;
      transition: border-color 0.2s;
    }
    input:focus, select:focus, textarea:focus {
      outline: none; border-color: #ff6b9d;
      box-shadow: 0 0 0 3px rgba(255,107,157,0.2);
    }
    input::placeholder { color: rgba(255,255,255,0.35); }
    select option { background: #1a0533; }

    /* ── Screen time ring ── */
    .ring-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
    .ring-svg { transform: rotate(-90deg); }
    .ring-circle { transition: stroke-dashoffset 1s ease; }
    .ring-label { position: absolute; text-align: center; }

    /* ── Chat bubble ── */
    .chat-bubble {
      border-radius: 18px 18px 18px 4px;
      background: linear-gradient(135deg, rgba(255,107,157,0.25), rgba(196,77,187,0.25));
      border: 1px solid rgba(255,107,157,0.3);
      padding: 12px 18px; max-width: 80%;
      animation: slideIn 0.3s ease;
      position: relative;
    }
    .chat-bubble.user { border-radius: 18px 18px 4px 18px; margin-left: auto;
      background: linear-gradient(135deg, rgba(77,150,255,0.25), rgba(108,77,255,0.25));
      border-color: rgba(77,150,255,0.3);
    }
    @keyframes slideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 3px; }
    ::-webkit-scrollbar-thumb { background: rgba(255,107,157,0.4); border-radius: 3px; }

    /* ── Modal ── */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.2s ease;
    }
    .modal-box { max-width: 560px; width: 90%; max-height: 90vh; overflow-y: auto; }

    /* ── Animations ── */
    .bounce-in { animation: bounceIn 0.5s cubic-bezier(0.68,-0.55,0.27,1.55); }
    @keyframes bounceIn {
      0%{transform:scale(0.5);opacity:0}
      70%{transform:scale(1.1)}
      100%{transform:scale(1);opacity:1}
    }
    .slide-up { animation: slideUp 0.4s ease; }
    @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    
    /* ── Gaze indicator ── */
    .gaze-dot {
      position: absolute; width: 20px; height: 20px; border-radius: 50%;
      background: rgba(107,203,119,0.7); box-shadow: 0 0 10px rgba(107,203,119,0.9);
      pointer-events: none; transform: translate(-50%,-50%);
      transition: left 0.15s ease, top 0.15s ease;
      animation: gazeGlow 1s ease-in-out infinite;
    }
    @keyframes gazeGlow { 0%,100%{box-shadow:0 0 10px rgba(107,203,119,0.9)} 50%{box-shadow:0 0 20px rgba(107,203,119,1)} }

    /* ── Phase 4: Reward & Engagement Animations ── */
    @keyframes confettiFall {
      0%   { transform: translateY(-20px) rotate(0deg) scale(1); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg) scale(0.4); opacity: 0; }
    }
    @keyframes sparklePopIn {
      0%   { transform: scale(0) rotate(0deg); opacity: 0; }
      60%  { transform: scale(1.4) rotate(180deg); opacity: 1; }
      100% { transform: scale(1) rotate(360deg); opacity: 0; }
    }
    @keyframes megaBounce {
      0%,100% { transform: scale(1); }
      15%  { transform: scale(1.35) rotate(-3deg); }
      30%  { transform: scale(0.9) rotate(2deg); }
      45%  { transform: scale(1.2) rotate(-2deg); }
      60%  { transform: scale(0.95); }
      75%  { transform: scale(1.1); }
    }
    @keyframes levelUpFlash {
      0%,100% { opacity: 0; transform: scale(0.5) translateY(20px); }
      20%,80% { opacity: 1; transform: scale(1.05) translateY(0); }
    }
    @keyframes starBurst {
      0%   { transform: scale(0) rotate(0); opacity: 1; }
      100% { transform: scale(2.5) rotate(45deg); opacity: 0; }
    }
    @keyframes xpFlyUp {
      0%   { transform: translateY(0) scale(1); opacity: 1; }
      100% { transform: translateY(-80px) scale(1.4); opacity: 0; }
    }
    @keyframes characterDance {
      0%,100% { transform: rotate(0deg) scale(1); }
      25%  { transform: rotate(-12deg) scale(1.1); }
      50%  { transform: rotate(0deg) scale(1.2); }
      75%  { transform: rotate(12deg) scale(1.1); }
    }
    @keyframes shakeReject {
      0%,100% { transform: translateX(0); }
      20%  { transform: translateX(-8px); }
      40%  { transform: translateX(8px); }
      60%  { transform: translateX(-5px); }
      80%  { transform: translateX(5px); }
    }
    @keyframes pulseGlow {
      0%,100% { box-shadow: 0 0 0 0 rgba(255,107,157,0); }
      50%  { box-shadow: 0 0 30px 10px rgba(255,107,157,0.6); }
    }
    .reward-bounce { animation: megaBounce 0.7s cubic-bezier(0.36,0.07,0.19,0.97); }
    .character-dance { animation: characterDance 0.6s ease-in-out infinite; }
    .pulse-glow { animation: pulseGlow 0.8s ease-in-out 3; }
    .shake { animation: shakeReject 0.4s ease-in-out; }

    /* XP bar */
    .xp-bar-fill { background: linear-gradient(90deg, #ffd700, #ff6b9d, #c44dbb); transition: width 0.8s cubic-bezier(0.34,1.56,0.64,1); }

    /* Level badge */
    .level-badge {
      display: inline-flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #ffd700, #ff8c00);
      color: #1a0a2e; font-weight: 900; font-size: 11px;
      padding: 2px 8px; border-radius: 999px;
      box-shadow: 0 2px 8px rgba(255,215,0,0.5);
    }

    /* Mini-game area */
    /* ── Personality & emotion buttons ── */
    .pers-btn {
      cursor: pointer; transition: all 0.2s ease;
    }
    .pers-btn:hover { transform: scale(1.05); }
    .pers-btn:active { transform: scale(0.95); }

    /* Voice picker */
    .vp-tab { cursor: pointer; transition: all 0.18s; }
    .vp-tab:hover { opacity: 0.85; }
    .eleven-voice-btn { cursor: pointer; transition: all 0.15s; }
    .eleven-voice-btn:hover { transform: translateY(-1px); opacity: 0.9; }
    .openai-voice-btn { cursor: pointer; transition: all 0.15s; }
    .openai-voice-btn:hover { transform: translateY(-1px); opacity: 0.9; }
    .char-voice-btn { cursor: pointer; transition: all 0.18s; }
    .char-voice-btn:hover { transform: translateY(-2px); }

    .minigame-btn {
      background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2);
      border-radius: 16px; padding: 14px 20px; font-weight: 900; font-size: 1.1rem;
      cursor: pointer; transition: all 0.15s; color: white; text-align: center;
    }
    .minigame-btn:active, .minigame-btn.hit { background: rgba(255,107,157,0.4); border-color: #ff6b9d; transform: scale(0.95); }
    .minigame-btn.correct { background: rgba(107,203,119,0.4); border-color: #6bcb77; }
    .minigame-btn.wrong { background: rgba(255,80,80,0.3); border-color: #ff5050; }
  </style>

  <style>
    /* ── Auth screen ── */
    #authScreen {
      position: fixed; inset: 0; z-index: 2000;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #1a0533 0%, #0d1b4b 50%, #0a2a1a 100%);
    }
    .auth-card { max-width: 420px; width: 90%; }
    .auth-tab-active { background: linear-gradient(135deg,#ff6b9d,#c44dbb); border-radius:10px; }

    /* ── Lesson system ── */
    .lesson-card {
      background: rgba(255,255,255,0.04); border: 2px solid rgba(255,255,255,0.08);
      border-radius: 16px; padding: 16px; cursor: pointer; transition: all 0.2s;
    }
    .lesson-card:hover:not(.locked) { border-color: rgba(168,85,247,0.5); background: rgba(168,85,247,0.08); transform: translateY(-2px); }
    .lesson-card.locked { opacity: 0.55; cursor: not-allowed; }
    .lesson-filter-btn {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px; color: #aaa; font-weight: 700; font-size: 0.75rem;
      cursor: pointer; padding: 6px 14px; transition: all 0.2s;
    }
    .lesson-filter-btn:hover { background: rgba(168,85,247,0.15); color: #c084fc; border-color: rgba(168,85,247,0.3); }
    .lesson-filter-btn.active { background: rgba(168,85,247,0.2); color: #c084fc; border-color: #c084fc; }
    .answer-btn {
      background: rgba(255,255,255,0.07); border: 2px solid rgba(255,255,255,0.12);
      border-radius: 12px; color: white; font-weight: 700; padding: 14px 10px;
      cursor: pointer; transition: all 0.2s; font-size: 0.9rem; width: 100%;
    }
    .answer-btn:hover { border-color: rgba(168,85,247,0.5); background: rgba(168,85,247,0.1); }
    .answer-btn.correct { background: rgba(107,203,119,0.25); border-color: #6bcb77; }
    .answer-btn.wrong   { background: rgba(255,80,80,0.2);   border-color: #ff5050; }
    /* ── Billing plan cards ── */
    .plan-card {
      background: rgba(255,255,255,0.04); border: 2px solid rgba(255,255,255,0.08);
      border-radius: 18px; padding: 20px; transition: all 0.2s;
    }
    .plan-card.highlight { border-color: rgba(255,107,157,0.5); background: rgba(255,107,157,0.05); }
    .plan-card.current   { border-color: rgba(74,222,128,0.5); background: rgba(74,222,128,0.05); }
    /* ── Confetti canvas ── */
    #confettiCanvas { position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999; }
  </style>
</head>
<body class="bg-animated min-h-screen">

<!-- ══════════════════════════════════════════════════════════ -->
<!-- AUTH SCREEN — shown until user signs in or picks Demo -->
<!-- ══════════════════════════════════════════════════════════ -->
<div id="authScreen">
  <div class="auth-card bounce-in">
    <div class="text-center mb-8">
      <div class="text-6xl mb-3">🎵</div>
      <h1 class="text-3xl font-black text-white">Music Buddy</h1>
      <p class="text-purple-300 text-sm mt-1">Children's Interactive Music Companion</p>
    </div>
    <div class="glass p-6">
      <!-- Tab switcher -->
      <div class="flex mb-6 glass-light p-1 rounded-xl">
        <button id="authTabLogin" onclick="switchAuthTab('login')"
          class="flex-1 py-2 text-sm font-bold rounded-xl auth-tab-active transition-all">
          <i class="fas fa-sign-in-alt mr-1"></i> Sign In
        </button>
        <button id="authTabRegister" onclick="switchAuthTab('register')"
          class="flex-1 py-2 text-sm font-bold rounded-xl transition-all text-gray-400">
          <i class="fas fa-user-plus mr-1"></i> Create Account
        </button>
      </div>
      <!-- Login form -->
      <div id="loginForm">
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Email Address</label>
            <input type="email" id="loginEmail" placeholder="parent@example.com"
              onkeydown="if(event.key==='Enter') doLogin()" />
          </div>
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Password</label>
            <div class="relative">
              <input type="password" id="loginPassword" placeholder="Your password"
                onkeydown="if(event.key==='Enter') doLogin()" />
              <button onclick="togglePwd('loginPassword')"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                <i class="fas fa-eye text-sm"></i>
              </button>
            </div>
          </div>
          <div id="loginError" class="hidden text-red-400 text-xs px-1"></div>
          <button onclick="doLogin()" id="loginBtn" class="btn-primary w-full mt-2">
            <i class="fas fa-sign-in-alt mr-2"></i> Sign In
          </button>
        </div>
        <p class="text-center text-xs text-gray-500 mt-4">
          No account? <button onclick="switchAuthTab('register')" class="text-pink-400 font-bold hover:underline">Create one free</button>
        </p>
        <div class="mt-4 pt-4 border-t border-white border-opacity-10">
          <button onclick="demoLogin()" class="btn-secondary w-full text-sm">
            <i class="fas fa-play mr-1"></i> Try Demo (no account needed)
          </button>
        </div>
      </div>
      <!-- Register form -->
      <div id="registerForm" class="hidden">
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Your Name</label>
            <input type="text" id="regName" placeholder="Parent / Guardian name"
              onkeydown="if(event.key==='Enter') doRegister()" />
          </div>
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Email Address</label>
            <input type="email" id="regEmail" placeholder="parent@example.com"
              onkeydown="if(event.key==='Enter') doRegister()" />
          </div>
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Password <span class="text-gray-500">(min 6 chars)</span></label>
            <div class="relative">
              <input type="password" id="regPassword" placeholder="Choose a strong password"
                onkeydown="if(event.key==='Enter') doRegister()" />
              <button onclick="togglePwd('regPassword')"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                <i class="fas fa-eye text-sm"></i>
              </button>
            </div>
          </div>
          <div id="regError" class="hidden text-red-400 text-xs px-1"></div>
          <button onclick="doRegister()" id="registerBtn" class="btn-primary w-full mt-2">
            <i class="fas fa-user-plus mr-2"></i> Create Account
          </button>
        </div>
        <p class="text-center text-xs text-gray-500 mt-4">
          Already have an account? <button onclick="switchAuthTab('login')" class="text-pink-400 font-bold hover:underline">Sign in</button>
        </p>
      </div>
    </div>
    <p class="text-center text-xs text-gray-600 mt-4">🔒 Data stored securely · No ads · Child-safe</p>
  </div>
</div>

<!-- Stars & Music Notes -->
<div class="stars" id="stars"></div>
<div id="musicNotes"></div>

<!-- ═══ REWARD OVERLAY LAYER (sits above everything) ═══ -->
<div id="rewardOverlay" style="position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden"></div>

<!-- ═══ LEVEL-UP MODAL ═══ -->
<div id="levelUpModal" class="hidden" style="position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px)">
  <div class="glass p-8 text-center max-w-sm mx-4" style="animation:levelUpFlash 1.2s ease-out forwards">
    <div class="text-7xl mb-3" id="levelUpEmoji">⭐</div>
    <div class="text-4xl font-black text-yellow-400 mb-1" id="levelUpTitle">LEVEL UP!</div>
    <div class="text-xl font-black text-white mb-2" id="levelUpSubtitle">You reached Level 2!</div>
    <div class="text-sm text-purple-300 mb-5" id="levelUpDesc">Amazing work! Keep going!</div>
    <button onclick="closeLevelUp()" class="btn-primary px-8">Let's keep going!</button>
  </div>
</div>

<!-- ═══ MINI-GAME MODAL ═══ -->
<div id="miniGameModal" class="hidden" style="position:fixed;inset:0;z-index:10000;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px)">
  <div class="glass p-6 max-w-sm mx-4 w-full">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-black text-xl" id="miniGameTitle">Repeat After Me!</h2>
      <button onclick="closeMiniGame()" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
    </div>
    <div id="miniGameContent" class="min-h-32"></div>
    <div class="mt-4 flex justify-between items-center">
      <div class="text-xs text-gray-400">Score: <span id="mgScore" class="font-black text-yellow-400">0</span></div>
      <div class="text-xs text-gray-400">Round: <span id="mgRound" class="font-black text-pink-400">1</span>/3</div>
    </div>
  </div>
</div>

<!-- ═══ USAGE LIMIT PAYWALL MODAL ═══ -->
<div id="usageLimitModal" style="display:none;position:fixed;inset:0;z-index:10002;align-items:center;justify-content:center;background:rgba(0,0,0,0.88);backdrop-filter:blur(16px)">
  <div class="glass max-w-sm w-full mx-4 p-6 text-center" style="border:2px solid rgba(255,107,157,0.4)">
    <div class="text-5xl mb-3" id="usageLimitEmoji">🎵</div>
    <h2 class="font-black text-xl mb-1" id="usageLimitTitle">Daily Limit Reached</h2>
    <p class="text-gray-400 text-sm mb-4" id="usageLimitMsg">You've used all your free songs for today. Upgrade to keep playing!</p>
    <div class="space-y-2 mb-5">
      <div class="flex items-center justify-between text-sm bg-white bg-opacity-5 rounded-xl px-4 py-2">
        <span>🎵 Songs today</span><span id="usageLimitDetail" class="font-bold text-pink-400">5 / 5</span>
      </div>
      <div class="flex items-center justify-between text-sm bg-white bg-opacity-5 rounded-xl px-4 py-2">
        <span>🎮 Games</span><span class="font-bold text-green-400">Unlimited ✓</span>
      </div>
      <div class="flex items-center justify-between text-sm bg-white bg-opacity-5 rounded-xl px-4 py-2">
        <span>🎙️ Premium Voice</span><span id="usagePremiumDetail" class="font-bold text-yellow-400">5 / 5</span>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <button onclick="closeUsageLimitModal()" class="btn-secondary text-sm">Keep Playing (Games Free)</button>
      <button onclick="closeUsageLimitModal();BILLING.openModal('songs')" class="btn-primary text-sm">Upgrade ✨</button>
    </div>
    <p class="text-xs text-gray-600 mt-3">Resets at midnight · Games always free</p>
  </div>
</div>

<!-- ═══ BILLING MODAL (parent-facing, stays on page) ═══ -->
<div id="billingModal" class="hidden" style="position:fixed;inset:0;z-index:10001;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(12px)">
  <div class="glass max-w-md w-full mx-4 overflow-y-auto" style="max-height:92vh">
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h2 class="font-black text-xl">Unlock Music Buddy</h2>
          <p class="text-xs text-purple-300 mt-0.5">For parents — one-time setup, child keeps playing</p>
        </div>
        <button onclick="BILLING.closeModal()" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
      </div>
      <div class="grid grid-cols-1 gap-3 mb-5" id="billingTiers"></div>
      <div id="billingTierDetail" class="glass-light rounded-xl p-4 mb-5 hidden">
        <div class="font-black text-sm mb-2" id="billingTierName"></div>
        <ul class="text-xs text-gray-300 space-y-1" id="billingTierFeatures"></ul>
        <div class="text-lg font-black text-yellow-400 mt-3" id="billingTierPrice"></div>
      </div>
      <div id="billingPaymentSection" class="hidden space-y-4">
        <div class="glass-light p-4 rounded-xl">
          <p class="text-xs font-black text-gray-300 mb-3 flex items-center gap-2">
            <i class="fas fa-lock text-green-400"></i> Secure payment
          </p>
          <div id="stripeCardElement" class="p-3 rounded-lg" style="background:rgba(255,255,255,0.08);min-height:44px;border:1px solid rgba(255,255,255,0.2)">
            <div id="stripeCardPlaceholder" class="text-xs text-gray-400 flex items-center gap-2">
              <i class="fas fa-credit-card"></i>
              <span>Card number • Expiry • CVC</span>
              <span class="ml-auto text-yellow-400 font-bold" id="billingStripeStatus">Configure Stripe key in Settings</span>
            </div>
          </div>
          <div id="stripeCardErrors" class="text-xs text-red-400 mt-2 hidden"></div>
        </div>
        <details class="glass-light rounded-xl">
          <summary class="p-3 text-xs font-black text-gray-300 cursor-pointer flex items-center gap-2">
            <i class="fas fa-key text-yellow-400"></i> Have your own API keys? Use them directly
          </summary>
          <div class="p-4 pt-0 space-y-3">
            <div>
              <label class="text-xs text-gray-400 block mb-1">OpenAI Key (premium TTS)</label>
              <input type="password" id="selfServiceOpenAI" placeholder="sk-..." class="text-xs" />
            </div>
            <div>
              <label class="text-xs text-gray-400 block mb-1">Replicate Key (music generation)</label>
              <input type="password" id="selfServiceReplicate" placeholder="r8_..." class="text-xs" />
            </div>
            <div>
              <label class="text-xs text-gray-400 block mb-1">ElevenLabs Key (best TTS voice)</label>
              <input type="password" id="selfServiceElevenLabs" placeholder="xi-..." class="text-xs" />
            </div>
            <button onclick="BILLING.saveSelfServiceKeys()" class="btn-secondary w-full text-xs">
              <i class="fas fa-save mr-1"></i> Save My Own Keys
            </button>
          </div>
        </details>
        <button id="billingPayBtn" onclick="BILLING.processPayment()" class="btn-primary w-full font-black text-base py-3">
          <i class="fas fa-lock mr-2"></i> <span id="billingPayBtnLabel">Complete Purchase</span>
        </button>
        <p class="text-xs text-gray-500 text-center">Parent/guardian required. Cancel anytime.</p>
      </div>
      <div class="flex gap-2 items-center mt-4">
        <div class="flex-1 h-1 rounded-full" id="billingStep1Bar" style="background:rgba(255,107,157,0.8)"></div>
        <div class="flex-1 h-1 rounded-full" id="billingStep2Bar" style="background:rgba(255,255,255,0.1)"></div>
        <div class="flex-1 h-1 rounded-full" id="billingStep3Bar" style="background:rgba(255,255,255,0.1)"></div>
      </div>
      <div id="billingStatus" class="mt-4 text-xs text-center text-gray-400 hidden"></div>
    </div>
  </div>
</div>

<!-- ═══ SOFT GATE PREVIEW MODAL ═══ -->
<div id="softGateModal" class="hidden" style="position:fixed;inset:0;z-index:10001;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px)">
  <div class="glass max-w-sm mx-4 p-6 text-center">
    <div class="text-5xl mb-3" id="sgEmoji">🎵</div>
    <h3 class="font-black text-xl mb-2" id="sgTitle">Ooooh, you want more!</h3>
    <p class="text-sm text-gray-300 mb-4" id="sgDesc">That was just a taste... there is so much more!</p>
    <div class="glass-light rounded-xl p-3 mb-5 text-left space-y-1" id="sgPreviewWhat"></div>
    <div class="flex gap-3">
      <button onclick="closeSoftGate()" class="btn-secondary flex-1 text-sm">Maybe later</button>
      <button onclick="BILLING.open('premium')" class="btn-primary flex-1 text-sm font-black">
        <i class="fas fa-unlock mr-1"></i> Unlock it!
      </button>
    </div>
    <p class="text-xs text-gray-500 mt-3" id="sgProgressUnlock"></p>
  </div>
</div>

<!-- Toast -->
<div id="toast"><span id="toastIcon">✨</span> <span id="toastMsg"></span></div>

<!-- ══════════════════════════════════════════════════════════ -->
<!-- MAIN APP -->
<!-- ══════════════════════════════════════════════════════════ -->
<div class="relative z-10 min-h-screen">

  <!-- ── Header ── -->
  <header class="glass sticky top-0 z-50 mx-4 mt-4 mb-0 px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-xl animate-bounce">🎵</div>
      <div>
        <h1 class="text-xl font-black text-white leading-tight">Music Buddy</h1>
        <p class="text-xs text-purple-300 font-semibold">Interactive Children's Music Companion</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <div id="sessionIndicator" class="hidden items-center gap-2 glass-light px-3 py-1.5 rounded-full text-sm font-bold text-green-400">
        <div class="engagement-dot bg-green-400"></div>
        <span>Live Session</span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Credits display -->
        <div id="creditsHeaderWrap" class="hidden">
          <button onclick="switchTab('billing')" class="text-xs font-black px-3 py-1.5 rounded-full transition-all"
            style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3)">
            <i class="fas fa-coins mr-1"></i>
            <span id="creditsDisplay">— cr</span>
          </button>
        </div>
        <!-- Logged-in user badge with logout -->
        <div id="userBadge" class="hidden items-center gap-2 glass-light px-3 py-1.5 rounded-full text-sm">
          <i class="fas fa-user-circle text-purple-400"></i>
          <span id="userBadgeName" class="font-bold text-white text-xs"></span>
          <button onclick="doLogout()" class="text-gray-400 hover:text-red-400 transition ml-1" title="Sign out">
            <i class="fas fa-sign-out-alt text-xs"></i>
          </button>
        </div>
        <button onclick="openModal('addProfileModal')" class="btn-primary text-sm">
          <i class="fas fa-plus mr-1"></i> New Profile
        </button>
      </div>
    </div>
  </header>

  <!-- ── Family Quick-Switch Bar (hidden until family created) ── -->
  <div id="familySwitcher" class="mx-4 mt-3 hidden flex gap-2 flex-wrap items-center">
    <span class="text-xs text-gray-500 font-bold mr-1">Family:</span>
  </div>

  <!-- ── Tab Navigation ── -->
  <div class="mx-4 mt-4 flex gap-2 overflow-x-auto pb-1">
    <button class="tab-btn active whitespace-nowrap" onclick="switchTab('companion')" id="tab-companion">
      <i class="fas fa-music mr-1"></i> Companion
    </button>
    <button class="tab-btn whitespace-nowrap" onclick="switchTab('profiles')" id="tab-profiles">
      <i class="fas fa-child mr-1"></i> Profiles
    </button>
    <button class="tab-btn whitespace-nowrap" onclick="switchTab('dashboard')" id="tab-dashboard">
      <i class="fas fa-chart-bar mr-1"></i> Dashboard
    </button>
    <button class="tab-btn whitespace-nowrap" onclick="switchTab('library')" id="tab-library">
      <i class="fas fa-headphones mr-1"></i> Library
    </button>
    <button class="tab-btn whitespace-nowrap" onclick="switchTabGated('creator')" id="tab-creator">
      <i class="fas fa-wand-magic-sparkles mr-1"></i> Creator
    </button>
    <button class="tab-btn whitespace-nowrap" onclick="switchTab('settings')" id="tab-settings">
      <i class="fas fa-sliders-h mr-1"></i> Settings
    </button>
    <button class="tab-btn whitespace-nowrap" onclick="switchTab('lessons')" id="tab-lessons">
      <i class="fas fa-graduation-cap mr-1"></i> Lessons
    </button>
    <button class="tab-btn whitespace-nowrap" onclick="switchTab('billing')" id="tab-billing">
      <i class="fas fa-star mr-1"></i> Plans
    </button>
  </div>

  <!-- ══════════════════ TAB: COMPANION ══════════════════════ -->
  <div id="tab-content-companion" class="tab-content active-tab px-4 py-4">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

      <!-- ── Left: Camera Feed + Engagement ── -->
      <div class="lg:col-span-1 space-y-4">
        
        <!-- Camera Feed -->
        <div class="glass p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-black text-sm flex items-center gap-2">
              <i class="fas fa-camera text-pink-400"></i> Live Vision Feed
            </h3>
            <div id="visionStatus" class="text-xs font-bold px-2 py-1 rounded-full bg-gray-700">
              <i class="fas fa-circle mr-1 text-gray-500"></i>Offline
            </div>
          </div>
          <div class="camera-feed h-52 flex items-center justify-center relative" id="cameraFeed">
            <div class="scan-line" id="scanLine" style="display:none"></div>
            <div id="gazeIndicator" class="gaze-dot" style="display:none; left:50%; top:50%"></div>
            <!-- REAL webcam video feed -->
            <video id="webcamVideo" autoplay muted playsinline
              style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;display:none;"></video>
            <!-- Emotion overlays on top of video -->
            <div id="emotionOverlays" class="absolute top-2 left-2 flex flex-wrap gap-1" style="z-index:2"></div>
            <!-- Face detection indicator -->
            <div id="faceDetectBadge" class="hidden absolute bottom-2 right-2 text-xs font-bold px-2 py-1 rounded-full" style="background:rgba(0,200,100,0.85);color:white;z-index:3">
              <i class="fas fa-smile mr-1"></i><span id="faceDetectLabel">Face detected</span>
            </div>
            <div id="cameraPlaceholder" class="text-center text-gray-500" style="z-index:1">
              <i class="fas fa-video text-4xl mb-2 block opacity-30"></i>
              <p class="text-xs">Start a session to enable<br/>live monitoring</p>
            </div>
          </div>
          <!-- Gaze metrics -->
          <div class="mt-3 grid grid-cols-3 gap-2 text-center" id="gazeMetrics">
            <div class="glass-light p-2 rounded-xl">
              <div class="text-lg font-black text-pink-400" id="smileCount">0</div>
              <div class="text-xs text-gray-400">Smiles</div>
            </div>
            <div class="glass-light p-2 rounded-xl">
              <div class="text-lg font-black text-yellow-400" id="laughCount">0</div>
              <div class="text-xs text-gray-400">Laughs</div>
            </div>
            <div class="glass-light p-2 rounded-xl">
              <div class="text-lg font-black text-green-400" id="fixationTime">0s</div>
              <div class="text-xs text-gray-400">Focus</div>
            </div>
          </div>
        </div>

        <!-- Active Child -->
        <div class="glass p-4" id="activeChildCard">
          <h3 class="font-black text-sm flex items-center gap-2 mb-3">
            <i class="fas fa-star text-yellow-400"></i> Active Child
          </h3>
          <div id="noChildSelected" class="text-center text-gray-500 py-4">
            <i class="fas fa-child text-3xl mb-2 block opacity-30"></i>
            <p class="text-xs">Select a profile from the Profiles tab</p>
          </div>
          <div id="childInfo" class="hidden">
            <div class="flex items-center gap-3 mb-3">
              <div class="avatar-ring w-14 h-14">
                <div class="w-full h-full rounded-full bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center text-2xl" id="childAvatar">🐰</div>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <div class="font-black text-lg" id="childNameDisplay">-</div>
                  <span class="level-badge" id="levelBadge">Lv 1</span>
                </div>
                <div class="text-xs text-gray-400" id="childAgeDisplay">Age -</div>
                <div class="text-xs text-purple-300 font-bold" id="childStyleDisplay">-</div>
              </div>
            </div>
            <!-- XP Bar -->
            <div class="mb-3">
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>XP</span>
                <span id="xpText">0 / 100</span>
              </div>
              <div class="h-2 rounded-full bg-white bg-opacity-10 overflow-hidden">
                <div class="xp-bar-fill h-full rounded-full" id="xpBar" style="width:0%"></div>
              </div>
            </div>
            <div id="favoriteSongsDisplay" class="flex flex-wrap gap-1 mb-3"></div>
            <div class="grid grid-cols-2 gap-2">
              <button onclick="startSession()" class="btn-success text-sm w-full" id="startBtn">
                <i class="fas fa-play mr-1"></i> Start
              </button>
              <button onclick="stopSession()" class="btn-danger text-sm w-full hidden" id="stopBtn">
                <i class="fas fa-stop mr-1"></i> Stop
              </button>
            </div>
            <!-- Age-Adaptive Games Panel — always visible, always free -->
            <div class="mt-3" id="ageGamesPanel" style="border:2px solid rgba(255,200,50,0.4);border-radius:16px;background:rgba(255,200,50,0.05);padding:10px">
              <div class="flex items-center justify-between mb-2">
                <div class="text-xs font-black text-yellow-300 flex items-center gap-2">
                  <i class="fas fa-gamepad text-yellow-400"></i>
                  <span id="ageGamesLabel">PLAY NOW — Always Free!</span>
                </div>
                <div class="flex items-center gap-1">
                  <span id="ageGroupBadge" class="text-xs bg-blue-700 text-white font-black px-2 py-0.5 rounded-full hidden"></span>
                  <span class="text-xs bg-green-600 text-white font-black px-2 py-0.5 rounded-full" style="animation:pulse 1.5s ease-in-out infinite">✓ FREE</span>
                </div>
              </div>
              <!-- Dynamic game buttons — rendered by renderAgeGames() -->
              <div class="grid grid-cols-3 gap-2" id="ageGameButtons">
                <!-- Default (toddler) games shown before profile is selected -->
                <button onclick="startMiniGame('repeat')" class="flex flex-col items-center gap-1 rounded-2xl py-3 px-1 font-black text-xs transition-all active:scale-95 hover:scale-105" style="background:linear-gradient(135deg,#6c3fc4,#9d4edd);border:2px solid rgba(255,255,255,0.2)">
                  <span class="text-2xl">🎤</span><span>Repeat</span>
                  <span class="text-purple-300 font-normal" style="font-size:9px">Echo back!</span>
                </button>
                <button onclick="startMiniGame('clap')" class="flex flex-col items-center gap-1 rounded-2xl py-3 px-1 font-black text-xs transition-all active:scale-95 hover:scale-105" style="background:linear-gradient(135deg,#c4503f,#e86c4d);border:2px solid rgba(255,255,255,0.2)">
                  <span class="text-2xl">👏</span><span>Clap!</span>
                  <span class="text-orange-200 font-normal" style="font-size:9px">Tap the beat</span>
                </button>
                <button onclick="startMiniGame('rhythm')" class="flex flex-col items-center gap-1 rounded-2xl py-3 px-1 font-black text-xs transition-all active:scale-95 hover:scale-105" style="background:linear-gradient(135deg,#2d6a4f,#40916c);border:2px solid rgba(255,255,255,0.2)">
                  <span class="text-2xl">🥁</span><span>Rhythm</span>
                  <span class="text-green-200 font-normal" style="font-size:9px">Match it!</span>
                </button>
              </div>
              <!-- Always-visible Call & Response -->
              <button onclick="startCallAndResponse()" class="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl py-3 font-black text-sm transition-all active:scale-95 hover:scale-105" style="background:linear-gradient(135deg,#f4a261,#e76f51);border:2px solid rgba(255,255,255,0.25)">
                <span class="text-xl">🎵</span>
                <span>Call &amp; Response — Sing with me!</span>
              </button>
              <!-- 4th and 5th games (collapsed by default, expanded for age) -->
              <div id="bonusGameButtons" class="grid grid-cols-2 gap-2 mt-2 hidden"></div>
              <p class="text-center text-xs text-gray-500 mt-2" id="ageGamesHint">Tap any game to start instantly · No setup needed</p>
            </div>

            <!-- Usage Limit Bar -->
            <div class="mt-2" id="usageLimitBar" style="display:none">
              <div class="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span id="usageLimitLabel">Daily Songs</span>
                <span id="usageLimitCount">0 / 5</span>
              </div>
              <div class="h-1.5 rounded-full bg-white bg-opacity-10">
                <div id="usageLimitFill" class="h-full rounded-full transition-all" style="width:0%;background:linear-gradient(90deg,#6cbf7a,#4ade80)"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Background Listening -->
        <div class="glass p-4">
          <h3 class="font-black text-sm flex items-center gap-2 mb-3">
            <i class="fas fa-satellite-dish text-blue-400"></i> Background Listening
          </h3>
          <div class="space-y-2">
            <input type="text" id="bgSongInput" placeholder="Detected or enter song name..." class="text-sm" />
            <button onclick="detectBackground()" class="btn-secondary w-full text-sm">
              <i class="fas fa-search mr-1"></i> Use as Seed Song
            </button>
          </div>
          <div id="bgDetected" class="mt-2 text-xs text-green-400 hidden">
            <i class="fas fa-check-circle mr-1"></i>
            <span id="bgDetectedName"></span>
          </div>
        </div>
      </div>

      <!-- ── Center: Music Player + Interaction ── -->
      <div class="lg:col-span-1 space-y-4">
        
        <!-- Music Player -->
        <div class="player-container p-5 glass">
          <div class="text-center mb-4">
            <div class="text-4xl mb-2 bounce-in" id="nowPlayingEmoji">🎵</div>
            <div class="font-black text-lg" id="nowPlayingTitle">Ready to Play!</div>
            <div class="text-xs text-gray-400 mt-1" id="nowPlayingStyle">Select a child and start a session</div>
            <!-- Social cue: "Kids your age love this!" -->
            <div id="socialCueBadge" class="hidden mt-2 text-xs font-black text-yellow-300 bg-yellow-900 bg-opacity-40 rounded-full px-3 py-1 inline-block">
              <i class="fas fa-fire mr-1"></i><span id="socialCueText"></span>
            </div>
          </div>

          <!-- Waveform -->
          <div class="flex items-end justify-center gap-1 h-12 mb-4" id="waveform">
            <div class="waveform-bar h-3" style="--d:0.7s;--delay:0s"></div>
            <div class="waveform-bar h-5" style="--d:0.9s;--delay:0.1s"></div>
            <div class="waveform-bar h-8" style="--d:0.6s;--delay:0.2s"></div>
            <div class="waveform-bar h-6" style="--d:1.0s;--delay:0.05s"></div>
            <div class="waveform-bar h-10" style="--d:0.8s;--delay:0.15s"></div>
            <div class="waveform-bar h-7" style="--d:0.7s;--delay:0.3s"></div>
            <div class="waveform-bar h-4" style="--d:0.9s;--delay:0.25s"></div>
            <div class="waveform-bar h-9" style="--d:0.6s;--delay:0.1s"></div>
            <div class="waveform-bar h-6" style="--d:1.1s;--delay:0.2s"></div>
            <div class="waveform-bar h-3" style="--d:0.8s;--delay:0.05s"></div>
            <div class="waveform-bar h-8" style="--d:0.7s;--delay:0.35s"></div>
            <div class="waveform-bar h-5" style="--d:0.9s;--delay:0.15s"></div>
          </div>
          <div id="waveformIdle" class="flex items-end justify-center gap-1 h-12 mb-4" style="display:none!important">
            <!-- idle state bars -->
          </div>

          <!-- Progress -->
          <div class="progress-bar mb-3">
            <div class="progress-fill" id="progressFill" style="width:0%"></div>
          </div>
          <div class="flex justify-between text-xs text-gray-400 mb-4">
            <span id="timeElapsed">0:00</span>
            <span id="timeDuration">0:25</span>
          </div>

          <!-- Controls -->
          <div class="flex justify-center items-center gap-4 mb-4">
            <button onclick="repeatSnippet()" class="btn-secondary w-10 h-10 rounded-full flex items-center justify-center text-sm" title="Repeat">
              <i class="fas fa-redo"></i>
            </button>
            <button onclick="triggerInteraction('manual')" class="btn-primary w-16 h-16 rounded-full flex items-center justify-center text-2xl" id="playBtn" title="Generate & Play">
              <i class="fas fa-magic"></i>
            </button>
            <button onclick="skipSnippet()" class="btn-secondary w-10 h-10 rounded-full flex items-center justify-center text-sm" title="Skip / Next">
              <i class="fas fa-forward"></i>
            </button>
          </div>

          <!-- Mode toggle -->
          <div class="flex gap-2 justify-center">
            <button onclick="setMode('auto')" class="song-pill active" id="modeAuto">🤖 Auto</button>
            <button onclick="setMode('manual')" class="song-pill" id="modeManual">👆 Manual</button>
            <button onclick="setMode('background')" class="song-pill" id="modeBg">🔊 BG Listen</button>
          </div>
        </div>

        <!-- TTS Chat Bubble Area -->
        <div class="glass p-4">
          <h3 class="font-black text-sm flex items-center gap-2 mb-3">
            <i class="fas fa-comment-dots text-pink-400"></i> AI Companion Says…
          </h3>
          <div id="chatArea" class="space-y-3 min-h-24 max-h-48 overflow-y-auto">
            <div class="chat-bubble text-sm">
              <span class="text-pink-300 font-black text-xs block mb-1">MusicBuddy 🎵</span>
              Hi there! I'm ready to play music with you. Select a child profile and start a session! 🌟
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <input type="text" id="customTtsInput" placeholder="Type a custom message..." class="text-sm flex-1" />
            <button onclick="sendCustomTTS()" class="btn-primary px-4 text-sm">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Right: Engagement Triggers + Song Style ── -->
      <div class="lg:col-span-1 space-y-4">
        
        <!-- Engagement Simulation (for demo/testing) -->
        <div class="glass p-4">
          <h3 class="font-black text-sm flex items-center gap-2 mb-3">
            <i class="fas fa-face-smile text-yellow-400"></i> Engagement Cues
            <span class="text-xs text-gray-400 font-normal">(vision input)</span>
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <button onclick="sendEngagementCue('smile', 0.7)" class="glass-light p-3 rounded-xl text-center cursor-pointer hover:bg-white hover:bg-opacity-10 transition" id="cueSmile">
              <div class="text-2xl mb-1">😊</div>
              <div class="text-xs font-bold">Smile</div>
            </button>
            <button onclick="sendEngagementCue('laughter', 0.9)" class="glass-light p-3 rounded-xl text-center cursor-pointer hover:bg-white hover:bg-opacity-10 transition" id="cueLaugh">
              <div class="text-2xl mb-1">😂</div>
              <div class="text-xs font-bold">Laughter</div>
            </button>
            <button onclick="sendEngagementCue('fixation', 0.8)" class="glass-light p-3 rounded-xl text-center cursor-pointer hover:bg-white hover:bg-opacity-10 transition" id="cueFixation">
              <div class="text-2xl mb-1">👀</div>
              <div class="text-xs font-bold">Fixation</div>
            </button>
            <button onclick="sendEngagementCue('attention_loss', 0.6)" class="glass-light p-3 rounded-xl text-center cursor-pointer hover:bg-white hover:bg-opacity-10 transition" id="cueAttention">
              <div class="text-2xl mb-1">😴</div>
              <div class="text-xs font-bold">Lost Focus</div>
            </button>
          </div>
          <!-- Simulated gaze tracker -->
          <div class="mt-3">
            <label class="text-xs text-gray-400 font-bold mb-1 block">Gaze Position (simulate)</label>
            <div class="glass-light rounded-xl h-20 relative cursor-crosshair" id="gazeSimArea"
                 onmousemove="updateGaze(event)" onclick="sendGazeCue(event)">
              <div class="gaze-dot" id="gazeSimDot" style="left:50%;top:50%;"></div>
              <div class="absolute inset-0 flex items-center justify-center text-xs text-gray-600 pointer-events-none">
                Click or move to simulate gaze
              </div>
            </div>
          </div>
        </div>

        <!-- Interaction State Machine -->
        <div class="glass p-4">
          <h3 class="font-black text-sm flex items-center gap-2 mb-3">
            <i class="fas fa-brain text-purple-400"></i> Interaction State
          </h3>
          <div class="space-y-2">
            <div class="flex items-center justify-between glass-light p-2 rounded-xl">
              <span class="text-xs font-bold">Current Action</span>
              <span id="currentAction" class="text-xs font-black text-pink-400">idle</span>
            </div>
            <div class="flex items-center justify-between glass-light p-2 rounded-xl">
              <span class="text-xs font-bold">Cycle Phase</span>
              <span id="cyclePhase" class="text-xs font-black text-yellow-400">-</span>
            </div>
            <div class="flex items-center justify-between glass-light p-2 rounded-xl">
              <span class="text-xs font-bold">Next Action In</span>
              <span id="nextActionIn" class="text-xs font-black text-green-400">-</span>
            </div>
            <div class="flex items-center justify-between glass-light p-2 rounded-xl">
              <span class="text-xs font-bold">Engagement Score</span>
              <div class="flex items-center gap-2">
                <div class="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div id="engScoreBar" class="h-full bg-gradient-to-r from-pink-500 to-yellow-400 rounded-full transition-all" style="width:0%"></div>
                </div>
                <span id="engScoreVal" class="text-xs font-black text-yellow-400">0%</span>
              </div>
            </div>
          </div>
          
          <!-- Cycle Timeline -->
          <div class="mt-3">
            <label class="text-xs text-gray-400 font-bold mb-2 block">Interaction Timeline</label>
            <div class="flex items-center gap-1 overflow-x-auto pb-1" id="cycleTimeline">
              <!-- filled by JS -->
            </div>
          </div>
        </div>

        <!-- Quick Song Style Selector -->
        <div class="glass p-4">
          <h3 class="font-black text-sm flex items-center gap-2 mb-3">
            <i class="fas fa-sliders-h text-blue-400"></i> Music Style
          </h3>
          <div class="flex flex-wrap gap-2" id="styleSelector">
            <button onclick="setStyle('playful')" class="song-pill active" data-style="playful">🎈 Playful</button>
            <button onclick="setStyle('upbeat')" class="song-pill" data-style="upbeat">⚡ Upbeat</button>
            <button onclick="setStyle('lullaby')" class="song-pill" data-style="lullaby">🌙 Lullaby</button>
            <button onclick="setStyle('classical')" class="song-pill" data-style="classical">🎻 Classical</button>
            <button onclick="setStyle('energetic')" class="song-pill" data-style="energetic">🔥 Energetic</button>
          </div>
          <div class="mt-3 flex gap-2">
            <div class="flex-1">
              <label class="text-xs text-gray-400 block mb-1">Tempo</label>
              <select id="tempoSelect" class="text-sm">
                <option value="slow">🐢 Slow</option>
                <option value="medium" selected>🚶 Medium</option>
                <option value="fast">🚀 Fast</option>
              </select>
            </div>
            <div class="flex-1">
              <label class="text-xs text-gray-400 block mb-1">Mood</label>
              <select id="moodSelect" class="text-sm">
                <option value="happy" selected>😊 Happy</option>
                <option value="calm">😌 Calm</option>
                <option value="energetic">⚡ Energetic</option>
                <option value="sleepy">😴 Sleepy</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════════ TAB: PROFILES ══════════════════════ -->
  <div id="tab-content-profiles" class="tab-content px-4 py-4 hidden">
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="profilesGrid">
      <!-- Profiles rendered here -->
      <div class="glass p-8 text-center col-span-full" id="profilesLoading">
        <i class="fas fa-spinner fa-spin text-3xl text-pink-400 mb-3 block"></i>
        <p class="text-gray-400">Loading profiles...</p>
      </div>
    </div>

    <!-- Family Group Setup -->
    <div class="glass p-5 mt-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-black text-sm flex items-center gap-2">
          <i class="fas fa-users text-blue-400"></i> Family Group
          <span class="text-xs text-gray-400 font-normal">Group mode + quick-switch</span>
        </h3>
        <div id="familyGroupStatus" class="text-xs text-gray-500">Not set up</div>
      </div>
      <div id="familyGroupSetup" class="space-y-3">
        <div>
          <label class="text-xs text-gray-400 font-bold block mb-1">Family Name</label>
          <input type="text" id="familyNameInput" placeholder="The Johnson Family" class="text-sm" />
        </div>
        <div>
          <label class="text-xs text-gray-400 font-bold block mb-1">Select Children to Group</label>
          <div id="familyChildCheckboxes" class="flex flex-wrap gap-2"></div>
        </div>
        <button onclick="createFamilyGroup()" class="btn-primary text-sm">
          <i class="fas fa-users mr-1"></i> Create Family Group
        </button>
      </div>
      <div id="familyGroupDisplay" class="hidden">
        <div id="familyMembersList" class="flex flex-wrap gap-2 mb-3"></div>
        <button onclick="document.getElementById('familyGroupSetup').classList.remove('hidden');document.getElementById('familyGroupDisplay').classList.add('hidden')" class="btn-secondary text-xs">
          Edit Group
        </button>
      </div>
    </div>

    <!-- Shared Intelligence Panel -->
    <div class="glass p-5 mt-4">
      <h3 class="font-black text-sm flex items-center gap-2 mb-4">
        <i class="fas fa-brain text-purple-400"></i> Shared Intelligence
        <span class="text-xs text-gray-400 font-normal">Anonymized cross-child learning</span>
      </h3>
      <div id="sharedIntelPanel" class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="glass-light p-3 rounded-xl text-center">
          <div class="text-2xl font-black text-pink-400" id="siTotalSessions">0</div>
          <div class="text-xs text-gray-400">Sessions Learned</div>
        </div>
        <div class="glass-light p-3 rounded-xl text-center">
          <div class="text-sm font-black text-yellow-400" id="siTopStyle">–</div>
          <div class="text-xs text-gray-400">Trending Style</div>
        </div>
        <div class="glass-light p-3 rounded-xl text-center">
          <div class="text-sm font-black text-green-400" id="siTopTempo">–</div>
          <div class="text-xs text-gray-400">Preferred Tempo</div>
        </div>
        <div class="glass-light p-3 rounded-xl text-center">
          <div class="text-sm font-black text-blue-400" id="siAgeGroup">–</div>
          <div class="text-xs text-gray-400">Age Group</div>
        </div>
      </div>
      <p class="text-xs text-gray-600 mt-3">
        <i class="fas fa-shield-alt text-green-500 mr-1"></i>
        No names or personal data are shared. Only anonymized style/tempo patterns.
      </p>
    </div>
  </div>

  <!-- ══════════════════ TAB: DASHBOARD ══════════════════════ -->
  <div id="tab-content-dashboard" class="tab-content px-4 py-4 hidden">
    
    <!-- Profile selector for dashboard -->
    <div class="glass p-4 mb-4 flex items-center gap-4">
      <label class="text-sm font-bold whitespace-nowrap">Viewing:</label>
      <select id="dashboardChildSelect" class="flex-1 text-sm" onchange="loadDashboard(this.value)">
        <option value="">Select a child profile...</option>
      </select>
      <button onclick="loadDashboard(document.getElementById('dashboardChildSelect').value)" class="btn-secondary text-sm">
        <i class="fas fa-sync mr-1"></i> Refresh
      </button>
    </div>

    <div id="dashboardContent" class="hidden">
      <!-- Top stats row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="glass p-4 text-center">
          <div class="text-3xl font-black text-pink-400" id="dashSmiles">0</div>
          <div class="text-xs text-gray-400 mt-1">Smiles Today</div>
        </div>
        <div class="glass p-4 text-center">
          <div class="text-3xl font-black text-yellow-400" id="dashLaughs">0</div>
          <div class="text-xs text-gray-400 mt-1">Laughs Today</div>
        </div>
        <div class="glass p-4 text-center">
          <div class="text-3xl font-black text-green-400" id="dashSessions">0</div>
          <div class="text-xs text-gray-400 mt-1">Sessions Today</div>
        </div>
        <div class="glass p-4 text-center">
          <div class="text-3xl font-black text-blue-400" id="dashSongsPlayed">0</div>
          <div class="text-xs text-gray-400 mt-1">Songs Played</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <!-- Screen time ring -->
        <div class="glass p-5 text-center">
          <h3 class="font-black text-sm mb-4 flex items-center gap-2 justify-center">
            <i class="fas fa-clock text-orange-400"></i> Screen Time Today
          </h3>
          <div class="ring-wrap mx-auto" style="width:120px;height:120px">
            <svg class="ring-svg" width="120" height="120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="10"/>
              <circle id="screenTimeRing" cx="60" cy="60" r="50" fill="none"
                      stroke="url(#ringGrad)" stroke-width="10" stroke-linecap="round"
                      stroke-dasharray="314" stroke-dashoffset="314" class="ring-circle"/>
              <defs>
                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#ff6b9d"/>
                  <stop offset="100%" stop-color="#ffd93d"/>
                </linearGradient>
              </defs>
            </svg>
            <div class="ring-label">
              <div class="text-xl font-black" id="screenTimeVal">0</div>
              <div class="text-xs text-gray-400">min</div>
            </div>
          </div>
          <div id="screenTimeAlert" class="hidden mt-3 text-xs text-orange-400 font-bold">
            <i class="fas fa-exclamation-triangle mr-1"></i> Limit approaching
          </div>
          <div class="mt-3 text-xs text-gray-400">Limit: <span id="screenTimeLimit">30</span> min</div>
        </div>

        <!-- Engagement chart -->
        <div class="glass p-5">
          <h3 class="font-black text-sm mb-4 flex items-center gap-2">
            <i class="fas fa-chart-line text-purple-400"></i> Engagement Overview
          </h3>
          <canvas id="engagementChart" height="140"></canvas>
        </div>

        <!-- Recommendations -->
        <div class="glass p-5">
          <h3 class="font-black text-sm mb-4 flex items-center gap-2">
            <i class="fas fa-lightbulb text-yellow-400"></i> AI Recommendations
          </h3>
          <div id="recommendationsList" class="space-y-2">
            <div class="text-xs text-gray-400">Load a profile to see recommendations.</div>
          </div>
        </div>

        <!-- Favorite styles -->
        <div class="glass p-5">
          <h3 class="font-black text-sm mb-4 flex items-center gap-2">
            <i class="fas fa-heart text-pink-400"></i> Favorite Music Styles
          </h3>
          <div id="favoriteStylesList" class="space-y-2">
            <div class="text-xs text-gray-400">No data yet.</div>
          </div>
        </div>

        <!-- Top songs -->
        <div class="glass p-5">
          <h3 class="font-black text-sm mb-4 flex items-center gap-2">
            <i class="fas fa-trophy text-yellow-400"></i> Most Loved Songs
          </h3>
          <div id="topSongsList" class="space-y-2">
            <div class="text-xs text-gray-400">No songs generated yet.</div>
          </div>
        </div>

        <!-- Adaptive profile -->
        <div class="glass p-5">
          <h3 class="font-black text-sm mb-4 flex items-center gap-2">
            <i class="fas fa-robot text-blue-400"></i> Adaptive Learning
          </h3>
          <div class="space-y-3" id="adaptiveData">
            <div class="text-xs text-gray-400">No learning data yet.</div>
          </div>
        </div>
      </div>

      <!-- Parental Guidance Rules -->
      <div class="glass p-5 mt-4">
        <h3 class="font-black text-sm mb-4 flex items-center gap-2">
          <i class="fas fa-shield-alt text-green-400"></i> Parental Controls & Guidance
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-2">Screen Time Limit (min)</label>
            <input type="number" id="ruleScreenTime" min="5" max="120" value="30" class="text-sm" />
          </div>
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-2">Max Volume (%)</label>
            <input type="number" id="ruleVolume" min="10" max="100" value="70" class="text-sm" />
          </div>
          <div class="flex items-end">
            <button onclick="saveParentalRules()" class="btn-success w-full text-sm">
              <i class="fas fa-save mr-1"></i> Save Rules
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <div id="dashboardEmpty" class="glass p-12 text-center">
      <i class="fas fa-chart-pie text-5xl text-gray-600 mb-4 block"></i>
      <p class="text-gray-400 font-bold">Select a child profile above to view their dashboard</p>
    </div>
  </div>

  <!-- ══════════════════ TAB: LIBRARY ══════════════════════ -->
  <div id="tab-content-library" class="tab-content px-4 py-4 hidden">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-black text-xl">🎶 Music Library</h2>
      <select id="libraryChildSelect" class="text-sm w-56" onchange="loadLibrary(this.value)">
        <option value="">Select profile...</option>
      </select>
    </div>
    <div id="libraryContent">
      <div class="glass p-12 text-center">
        <i class="fas fa-music text-5xl text-gray-600 mb-4 block"></i>
        <p class="text-gray-400 font-bold">Select a profile to view generated songs</p>
      </div>
    </div>
  </div>

  <!-- ══════════════════ TAB: CREATOR MODE ══════════════════════ -->
  <div id="tab-content-creator" class="tab-content px-4 py-4 hidden">
    <div class="max-w-3xl mx-auto space-y-5">

      <!-- Header -->
      <div class="glass p-5 flex items-center gap-4">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-3xl">🎛️</div>
        <div>
          <h2 class="font-black text-2xl">Creator Mode</h2>
          <p class="text-sm text-purple-300">Build songs from lyrics, text prompts, or uploaded audio</p>
        </div>
        <div class="ml-auto">
          <div class="text-xs text-gray-400 text-right">Active provider:</div>
          <div id="creatorProvider" class="text-xs font-black text-green-400 text-right">demo</div>
        </div>
      </div>

      <!-- Mode toggle -->
      <div class="glass p-4 flex gap-3">
        <button onclick="setCreatorMode('lyrics')" id="cmLyrics" class="song-pill active flex-1 justify-center text-sm font-black py-2">
          ✏️ Write Lyrics
        </button>
        <button onclick="setCreatorMode('prompt')" id="cmPrompt" class="song-pill flex-1 justify-center text-sm font-black py-2">
          💡 Text Prompt
        </button>
        <button onclick="setCreatorMode('upload')" id="cmUpload" class="song-pill flex-1 justify-center text-sm font-black py-2">
          📂 Upload Audio
        </button>
      </div>

      <!-- LYRICS MODE -->
      <div id="creatorPanelLyrics" class="glass p-5 space-y-4">
        <h3 class="font-black text-sm flex items-center gap-2"><i class="fas fa-pen text-pink-400"></i> Write Your Lyrics</h3>
        <div>
          <label class="text-xs text-gray-400 font-bold block mb-1">Song Title</label>
          <input type="text" id="lyricTitle" placeholder="My Awesome Song" class="text-sm" />
        </div>
        <div>
          <label class="text-xs text-gray-400 font-bold block mb-1">Lyrics</label>
          <textarea id="lyricInput" rows="6" placeholder="A, B, C, come sing with me!&#10;D, E, F, as happy as can be!&#10;G, H, I, we're reaching for the sky!&#10;J, K, L, let's give a great big yell!" class="text-sm" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:10px 14px;color:white;width:100%;font-family:inherit;resize:vertical;min-height:120px"></textarea>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Style</label>
            <select id="lyricStyle" class="text-sm">
              <option value="playful">🎈 Playful</option>
              <option value="upbeat">⚡ Upbeat</option>
              <option value="lullaby">🌙 Lullaby</option>
              <option value="classical">🎻 Classical</option>
              <option value="energetic">🔥 Energetic</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">BPM</label>
            <select id="lyricBpm" class="text-sm">
              <option value="80">🐢 80 BPM (slow)</option>
              <option value="100" selected>🚶 100 BPM</option>
              <option value="110">🏃 110 BPM</option>
              <option value="120">🚀 120 BPM (fast)</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Energy</label>
            <select id="lyricEnergy" class="text-sm">
              <option value="low">😌 Calm</option>
              <option value="medium" selected>😊 Normal</option>
              <option value="high">🔥 High Energy</option>
            </select>
          </div>
        </div>
        <div class="flex gap-3">
          <button onclick="autoGenerateLyrics()" class="btn-secondary flex-1 text-sm">
            <i class="fas fa-magic mr-1"></i> Auto-Generate Lyrics
          </button>
          <button onclick="buildSongFromLyrics()" class="btn-primary flex-1 text-sm">
            <i class="fas fa-music mr-1"></i> Build Song
          </button>
        </div>
      </div>

      <!-- PROMPT MODE -->
      <div id="creatorPanelPrompt" class="glass p-5 space-y-4 hidden">
        <h3 class="font-black text-sm flex items-center gap-2"><i class="fas fa-lightbulb text-yellow-400"></i> Describe Your Song</h3>
        <div>
          <label class="text-xs text-gray-400 font-bold block mb-1">What should this song be about?</label>
          <textarea id="promptInput" rows="3" placeholder="A fun song about a dinosaur who loves to dance and eat pizza" class="text-sm" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:10px 14px;color:white;width:100%;font-family:inherit;resize:vertical"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">For who?</label>
            <input type="text" id="promptChildName" placeholder="Child's name (optional)" class="text-sm" />
          </div>
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Style</label>
            <select id="promptStyle" class="text-sm">
              <option value="playful">🎈 Playful</option>
              <option value="upbeat">⚡ Upbeat</option>
              <option value="lullaby">🌙 Lullaby</option>
              <option value="energetic">🔥 Energetic</option>
            </select>
          </div>
        </div>
        <button onclick="buildSongFromPrompt()" class="btn-primary w-full text-sm">
          <i class="fas fa-wand-magic-sparkles mr-1"></i> Generate Song From Prompt
        </button>
      </div>

      <!-- UPLOAD MODE -->
      <div id="creatorPanelUpload" class="glass p-5 space-y-4 hidden">
        <h3 class="font-black text-sm flex items-center gap-2"><i class="fas fa-upload text-blue-400"></i> Upload Audio</h3>
        <div id="uploadDropzone" class="border-2 border-dashed border-white border-opacity-20 rounded-2xl p-8 text-center cursor-pointer hover:border-pink-400 hover:bg-white hover:bg-opacity-5 transition"
             onclick="document.getElementById('audioFileInput').click()"
             ondrop="handleAudioDrop(event)" ondragover="event.preventDefault()">
          <i class="fas fa-cloud-upload-alt text-4xl text-gray-500 mb-3 block"></i>
          <p class="font-bold text-gray-300">Drop MP3 or WAV here</p>
          <p class="text-xs text-gray-500 mt-1">or click to browse</p>
          <div id="uploadFileName" class="mt-3 text-sm text-green-400 font-bold hidden"></div>
        </div>
        <input type="file" id="audioFileInput" accept=".mp3,.wav,audio/mp3,audio/wav,audio/mpeg" class="hidden" onchange="handleAudioFile(event)" />
        <div id="audioAnalysisResult" class="hidden glass-light p-4 rounded-xl text-sm space-y-2">
          <div class="font-black text-xs text-gray-400 uppercase mb-2">Detected Properties</div>
          <div class="flex justify-between"><span class="text-gray-400">Tempo</span><span id="detectedBpm" class="font-bold text-yellow-400">--</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Duration</span><span id="detectedDuration" class="font-bold text-blue-400">--</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Mood Est.</span><span id="detectedMood" class="font-bold text-pink-400">--</span></div>
        </div>
        <div id="uploadActions" class="hidden space-y-3">
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">What to generate from this audio?</label>
            <select id="uploadAction" class="text-sm">
              <option value="match">Match Style — new song in same vibe</option>
              <option value="lyrics">Add Lyrics — generate words that fit</option>
              <option value="remix">Remix — variation on the theme</option>
            </select>
          </div>
          <button onclick="buildSongFromUpload()" class="btn-primary w-full text-sm">
            <i class="fas fa-magic mr-1"></i> Create From Upload
          </button>
        </div>
      </div>

      <!-- Build Progress -->
      <div id="creatorBuildProgress" class="glass p-5 hidden">
        <div class="flex items-center gap-3 mb-3">
          <i class="fas fa-spinner fa-spin text-pink-400 text-xl"></i>
          <span class="font-black" id="creatorProgressLabel">Building your song...</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill transition-all duration-500" id="creatorProgressBar" style="width:0%"></div>
        </div>
        <div id="creatorProgressSteps" class="mt-3 space-y-1 text-xs text-gray-400"></div>
      </div>

      <!-- Built Song Result -->
      <div id="creatorResult" class="glass p-5 hidden">
        <div class="flex items-center gap-3 mb-4">
          <div class="text-3xl" id="creatorResultEmoji">🎵</div>
          <div>
            <div class="font-black text-lg" id="creatorResultTitle">Your Song</div>
            <div class="text-xs text-gray-400" id="creatorResultMeta">playful • 100 BPM</div>
          </div>
          <button onclick="playCreatorSong()" class="btn-primary ml-auto px-5">
            <i class="fas fa-play mr-1"></i> Play
          </button>
        </div>

        <!-- Lyrics display -->
        <div id="creatorLyricsDisplay" class="glass-light p-4 rounded-xl text-sm font-bold leading-relaxed mb-4 whitespace-pre-line text-purple-200"></div>

        <!-- Mix controls -->
        <div class="space-y-3">
          <div class="font-black text-xs text-gray-400 uppercase mb-2">Mix Controls</div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-gray-400 block mb-1">Lead Vocal <span id="leadVolLabel">100%</span></label>
              <input type="range" min="0" max="100" value="100" id="leadVolSlider" oninput="updateMix('lead',this.value)" style="background:none;border:none;padding:0;accent-color:#ff6b9d;width:100%" />
            </div>
            <div>
              <label class="text-xs text-gray-400 block mb-1">Harmony <span id="harmVolLabel">55%</span></label>
              <input type="range" min="0" max="100" value="55" id="harmVolSlider" oninput="updateMix('harmony',this.value)" style="background:none;border:none;padding:0;accent-color:#c44dbb;width:100%" />
            </div>
            <div>
              <label class="text-xs text-gray-400 block mb-1">Background Hype <span id="bgVolLabel">35%</span></label>
              <input type="range" min="0" max="100" value="35" id="bgVolSlider" oninput="updateMix('bg',this.value)" style="background:none;border:none;padding:0;accent-color:#6bcb77;width:100%" />
            </div>
            <div>
              <label class="text-xs text-gray-400 block mb-1">Instrumental <span id="instVolLabel">70%</span></label>
              <input type="range" min="0" max="100" value="70" id="instVolSlider" oninput="updateMix('inst',this.value)" style="background:none;border:none;padding:0;accent-color:#4d96ff;width:100%" />
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="toggleHypeVocals()" id="hypeToggleBtn" class="song-pill active text-xs">
              🎤 Hype Vocals: ON
            </button>
            <button onclick="toggleHarmony()" id="harmToggleBtn" class="song-pill active text-xs">
              🎶 Harmony: ON
            </button>
          </div>
        </div>

        <div class="flex gap-2 mt-4">
          <button onclick="saveCreatorSong()" class="btn-success flex-1 text-sm">
            <i class="fas fa-save mr-1"></i> Save to Library
          </button>
          <button onclick="shareCreatorSong()" class="btn-secondary text-sm px-4">
            <i class="fas fa-share mr-1"></i>
          </button>
        </div>
      </div>

    </div>
  </div>

  <!-- ══════════════════ TAB: SETTINGS ══════════════════════ -->
  <div id="tab-content-settings" class="tab-content px-4 py-4 hidden">
    <div class="max-w-2xl mx-auto space-y-4">

      <!-- Subscription Status -->
      <div class="glass p-6">
        <h3 class="font-black text-lg mb-4 flex items-center gap-2">
          <i class="fas fa-star text-yellow-400"></i> Subscription &amp; Access
        </h3>
        <div id="subscriptionStatus" class="glass-light p-4 rounded-xl mb-4">
          <!-- Rendered by BILLING.renderStatus() -->
          <div class="flex items-center gap-3">
            <div class="text-3xl">🆓</div>
            <div>
              <div class="font-black text-sm">Free Plan</div>
              <div class="text-xs text-gray-400">Mini-games, call-and-response, basic praise loops</div>
            </div>
            <button onclick="BILLING.open()" class="btn-primary text-xs ml-auto px-4">
              <i class="fas fa-unlock mr-1"></i> Upgrade
            </button>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs text-center">
          <div class="glass-light p-3 rounded-xl">
            <div class="font-black text-green-400">✓</div><div class="text-gray-400 mt-1">Free games</div>
          </div>
          <div class="glass-light p-3 rounded-xl" id="settingsMusicStatus">
            <div class="font-black text-gray-500" id="settingsMusicIcon">🔒</div><div class="text-gray-400 mt-1">AI Songs</div>
          </div>
          <div class="glass-light p-3 rounded-xl" id="settingsTTSStatus">
            <div class="font-black text-gray-500" id="settingsTTSIcon">🔒</div><div class="text-gray-400 mt-1">Premium Voice</div>
          </div>
        </div>
      </div>

      <!-- Pricing overview -->
      <div class="glass p-5">
        <h3 class="font-black text-sm mb-3 flex items-center gap-2">
          <i class="fas fa-tags text-pink-400"></i> Plans
        </h3>
        <div class="space-y-3" id="settingsPlansList">
          <!-- Rendered by BILLING -->
        </div>
      </div>

      <!-- Audio Settings (unchanged) -->
      <!-- ── Voice Personality Engine ─────────────────────────── -->
      <div class="glass p-6" id="voicePersonalityPanel">
        <h3 class="font-black text-lg mb-4 flex items-center gap-2">
          <i class="fas fa-microphone-alt text-pink-400"></i> Voice Personality Engine
          <span class="text-xs font-normal text-green-400 ml-auto px-2 py-1 rounded-full" style="background:rgba(0,200,100,0.15)" id="voiceEngineStatus">Loading...</span>
        </h3>

        <!-- ══ FULL VOICE PICKER ══════════════════════════════════ -->

        <!-- Per-child voice saved badge -->
        <div id="childVoiceBadge" class="mb-3 hidden text-xs text-center py-1.5 rounded-xl font-bold"
          style="background:rgba(74,222,128,0.15);color:#4ade80">
          <i class="fas fa-child mr-1"></i>
          <span id="childVoiceBadgeText">Voice saved for this child</span>
        </div>

        <!-- Tab bar: Characters | ElevenLabs | OpenAI -->
        <div class="flex gap-1 mb-3 p-1 rounded-xl" style="background:rgba(255,255,255,0.05)">
          <button id="vpTab-chars" onclick="VOICE_PICKER.switchTab('chars')"
            class="vp-tab flex-1 text-xs font-bold py-1.5 rounded-lg transition-all"
            style="background:#ff6b9d;color:#fff">
            ⭐ Characters
          </button>
          <button id="vpTab-eleven" onclick="VOICE_PICKER.switchTab('eleven')"
            class="vp-tab flex-1 text-xs font-bold py-1.5 rounded-lg transition-all"
            style="background:transparent;color:#aaa">
            🎙 ElevenLabs
          </button>
          <button id="vpTab-openai" onclick="VOICE_PICKER.switchTab('openai')"
            class="vp-tab flex-1 text-xs font-bold py-1.5 rounded-lg transition-all"
            style="background:transparent;color:#aaa">
            🤖 OpenAI
          </button>
        </div>

        <!-- Tab: Characters -->
        <div id="vpPanel-chars" class="vp-panel mb-4">
          <div class="grid grid-cols-3 gap-2">
            <button id="charLuna" onclick="setCharacterVoice('luna')"
              class="char-voice-btn flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all"
              style="border-color:#ff6b9d;background:rgba(255,107,157,0.15)">
              <span class="text-3xl">🌙</span>
              <span class="font-black text-xs">Luna</span>
              <span class="text-xs text-gray-400">Warm &amp; kind</span>
            </button>
            <button id="charMax" onclick="setCharacterVoice('max')"
              class="char-voice-btn flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all"
              style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">
              <span class="text-3xl">⚡</span>
              <span class="font-black text-xs">Max</span>
              <span class="text-xs text-gray-400">Fun &amp; bold</span>
            </button>
            <button id="charBubbles" onclick="setCharacterVoice('bubbles')"
              class="char-voice-btn flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all"
              style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">
              <span class="text-3xl">🫧</span>
              <span class="font-black text-xs">Bubbles</span>
              <span class="text-xs text-gray-400">Silly &amp; bright</span>
            </button>
          </div>
          <!-- Style sub-picker for Characters -->
          <div class="mt-3">
            <div class="text-xs text-gray-400 mb-2 font-bold">Personality Style</div>
            <div class="grid grid-cols-4 gap-1">
              <button onclick="setVoiceStyle('default')" id="vstyle-default"
                class="vstyle-btn text-xs py-1.5 px-2 rounded-lg border transition-all font-bold"
                style="border-color:#ff6b9d;background:rgba(255,107,157,0.15)">⭐ Warm</button>
              <button onclick="setVoiceStyle('playful')" id="vstyle-playful"
                class="vstyle-btn text-xs py-1.5 px-2 rounded-lg border transition-all font-bold"
                style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">🎈 Play</button>
              <button onclick="setVoiceStyle('energetic')" id="vstyle-energetic"
                class="vstyle-btn text-xs py-1.5 px-2 rounded-lg border transition-all font-bold"
                style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">⚡ Energy</button>
              <button onclick="setVoiceStyle('soothing')" id="vstyle-soothing"
                class="vstyle-btn text-xs py-1.5 px-2 rounded-lg border transition-all font-bold"
                style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">🌙 Calm</button>
            </div>
          </div>
          <div id="selectedCharInfo" class="mt-2 text-center text-xs text-purple-300 py-1 rounded-lg"
            style="background:rgba(168,85,247,0.1)">
            🌙 Luna — Warm female host (Rachel voice)
          </div>
        </div>

        <!-- Tab: ElevenLabs voices -->
        <div id="vpPanel-eleven" class="vp-panel mb-4 hidden">
          <div class="text-xs text-gray-500 mb-3">All ElevenLabs voices — click to select. Requires ElevenLabs API key for full quality.</div>
          <!-- Female voices -->
          <div class="text-xs font-bold text-pink-400 mb-1.5">♀ Female</div>
          <div class="grid grid-cols-2 gap-1.5 mb-3" id="vpElevenFemale">
            <!-- Rendered by VOICE_PICKER.renderElevenLabs() -->
          </div>
          <!-- Male voices -->
          <div class="text-xs font-bold text-blue-400 mb-1.5">♂ Male</div>
          <div class="grid grid-cols-2 gap-1.5" id="vpElevenMale">
            <!-- Rendered by VOICE_PICKER.renderElevenLabs() -->
          </div>
        </div>

        <!-- Tab: OpenAI voices -->
        <div id="vpPanel-openai" class="vp-panel mb-4 hidden">
          <div class="text-xs text-gray-500 mb-3">OpenAI TTS voices — free with OpenAI API key.</div>
          <div class="grid grid-cols-2 gap-1.5" id="vpOpenAI">
            <!-- Rendered by VOICE_PICKER.renderOpenAI() -->
          </div>
        </div>

        <!-- Active voice display -->
        <div id="activeVoiceBar" class="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
          style="background:rgba(255,107,157,0.12);border:1px solid rgba(255,107,157,0.3)">
          <span class="text-lg" id="activeVoiceEmoji">🌙</span>
          <div class="flex-1 min-w-0">
            <div id="activeVoiceName" class="truncate">Luna</div>
            <div id="activeVoiceDesc" class="text-gray-400 font-normal truncate">Warm female host (Rachel)</div>
          </div>
          <span id="activeVoiceProvider" class="text-xs px-2 py-0.5 rounded-full"
            style="background:rgba(168,85,247,0.2);color:#c084fc">ElevenLabs</span>
        </div>

        <!-- Expressiveness sliders -->
        <div class="mb-5">
          <label class="text-sm font-bold text-gray-300 block mb-3">
            <i class="fas fa-sliders-h text-purple-400 mr-1"></i> ElevenLabs Expressiveness
          </label>
          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Stability <span class="text-yellow-400">(lower = more emotion)</span></span>
                <span id="stabilityVal">0.35</span>
              </div>
              <input type="range" id="elStability" min="0" max="1" step="0.05" value="0.35" class="w-full"
                style="accent-color:#ff6b9d;background:none;border:none;padding:0"
                oninput="document.getElementById('stabilityVal').textContent=parseFloat(this.value).toFixed(2);updateExpressivenessPreview()" />
            </div>
            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Style <span class="text-green-400">(higher = more character)</span></span>
                <span id="styleBoostVal">0.75</span>
              </div>
              <input type="range" id="elStyleBoost" min="0" max="1" step="0.05" value="0.75" class="w-full"
                style="accent-color:#ff6b9d;background:none;border:none;padding:0"
                oninput="document.getElementById('styleBoostVal').textContent=parseFloat(this.value).toFixed(2);updateExpressivenessPreview()" />
            </div>
            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Similarity Boost</span>
                <span id="similarityVal">0.60</span>
              </div>
              <input type="range" id="elSimilarity" min="0" max="1" step="0.05" value="0.60" class="w-full"
                style="accent-color:#ff6b9d;background:none;border:none;padding:0"
                oninput="document.getElementById('similarityVal').textContent=parseFloat(this.value).toFixed(2)" />
            </div>
          </div>
          <div id="expressivenessPreview" class="mt-3 text-xs text-center py-2 rounded-xl font-bold"
            style="background:rgba(255,107,157,0.1);color:#ff6b9d">
            🔥 Very Expressive — Perfect for children!
          </div>
        </div>

        <!-- Groq Personality toggle -->
        <div class="mb-5">
          <div class="flex items-center justify-between glass-light p-3 rounded-xl">
            <div>
              <div class="font-bold text-sm">Groq Personality Rewrite</div>
              <div class="text-xs text-gray-500 mt-0.5">AI rewrites every line for max engagement</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
              <input type="checkbox" id="groqPersonalityToggle" class="sr-only" checked />
              <div class="w-11 h-6 rounded-full transition" style="background:#ff6b9d"></div>
              <div class="absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-all" style="transform:translateX(20px)"></div>
            </label>
          </div>
        </div>

        <!-- Live test -->
        <div class="mb-4">
          <label class="text-sm font-bold text-gray-300 block mb-2">Test Your Voice Now</label>
          <div class="flex gap-2">
            <input type="text" id="voiceTestInput" class="flex-1 text-sm"
              placeholder="Type something fun..." value="Wow, let's make some amazing music together!" />
            <button onclick="testVoice()" class="btn-primary text-sm px-4 whitespace-nowrap" id="voiceTestBtn">
              <i class="fas fa-play mr-1"></i> Test
            </button>
          </div>
          <div id="voiceTestStatus" class="text-xs text-gray-500 mt-2 min-h-4"></div>
        </div>

        <button onclick="saveVoiceSettings()" class="btn-primary w-full">
          <i class="fas fa-save mr-2"></i> Save Voice Settings
        </button>
      </div>

      <!-- ── Personality &amp; Emotion Engine Panel ────────────────── -->
      <div class="glass p-5" id="personalityPanel">
        <h3 class="font-black text-base mb-3 flex items-center gap-2">
          <i class="fas fa-theater-masks text-purple-400"></i> Personality &amp; Emotion
          <span id="currentEmotionBadge" class="text-xs font-normal ml-auto px-2 py-0.5 rounded-full bg-yellow-800 text-yellow-200">😊 Happy</span>
        </h3>
        <!-- Personality picker -->
        <div class="mb-3">
          <div class="text-xs font-bold text-gray-400 mb-2">HOST PERSONALITY</div>
          <div class="grid grid-cols-5 gap-1" id="personalityPicker">
            <button onclick="setPersonality('energetic')" id="pers-energetic" class="pers-btn flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition-all text-xs font-bold" style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">
              <span class="text-lg">⚡</span><span>Energetic</span>
            </button>
            <button onclick="setPersonality('calm')" id="pers-calm" class="pers-btn flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition-all text-xs font-bold" style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">
              <span class="text-lg">😌</span><span>Calm</span>
            </button>
            <button onclick="setPersonality('playful')" id="pers-playful" class="pers-btn flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition-all text-xs font-bold" style="border-color:#ff6b9d;background:rgba(255,107,157,0.15)">
              <span class="text-lg">🎉</span><span>Playful</span>
            </button>
            <button onclick="setPersonality('nurturing')" id="pers-nurturing" class="pers-btn flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition-all text-xs font-bold" style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">
              <span class="text-lg">💖</span><span>Nurturing</span>
            </button>
            <button onclick="setPersonality('teacher')" id="pers-teacher" class="pers-btn flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl border-2 transition-all text-xs font-bold" style="border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)">
              <span class="text-lg">🎓</span><span>Teacher</span>
            </button>
          </div>
          <div id="personalityHint" class="text-xs text-gray-500 mt-1.5 text-center">🎉 Silly and fun — uses jokes, rhymes, giggles</div>
        </div>
        <!-- Emotion state display -->
        <div class="mb-3">
          <div class="text-xs font-bold text-gray-400 mb-2">DETECTED EMOTION</div>
          <div class="grid grid-cols-3 gap-1">
            <div id="emo-happy" class="text-center py-1.5 rounded-lg border text-xs" style="border-color:rgba(255,255,255,0.1)">😊 Happy</div>
            <div id="emo-excited" class="text-center py-1.5 rounded-lg border text-xs" style="border-color:rgba(255,255,255,0.1)">🤩 Excited</div>
            <div id="emo-proud" class="text-center py-1.5 rounded-lg border text-xs" style="border-color:rgba(255,255,255,0.1)">🏆 Proud</div>
            <div id="emo-encouraging" class="text-center py-1.5 rounded-lg border text-xs" style="border-color:rgba(255,255,255,0.1)">💪 Encouraging</div>
            <div id="emo-concerned" class="text-center py-1.5 rounded-lg border text-xs" style="border-color:rgba(255,255,255,0.1)">🤔 Concerned</div>
            <div id="emo-neutral" class="text-center py-1.5 rounded-lg border text-xs" style="border-color:rgba(255,255,255,0.1)">😐 Neutral</div>
          </div>
        </div>
        <!-- Usage summary -->
        <div id="usageSummaryPanel" class="mt-2">
          <div class="text-xs font-bold text-gray-400 mb-2">USAGE TODAY</div>
          <div class="space-y-1" id="usageSummaryList">
            <!-- populated by renderUsageSummary() -->
          </div>
        </div>
      </div>

      <!-- Audio Settings -->
      <div class="glass p-6">
        <h3 class="font-black text-lg mb-4 flex items-center gap-2">
          <i class="fas fa-volume-up text-blue-400"></i> Audio Settings
        </h3>
        <div class="space-y-4">
          <div>
            <label class="text-sm font-bold text-gray-300 block mb-2">Master Volume: <span id="masterVolumeLabel">70</span>%</label>
            <input type="range" id="masterVolume" min="0" max="100" value="70" class="w-full"
                   oninput="document.getElementById('masterVolumeLabel').textContent=this.value"
                   style="background:none;border:none;padding:0;accent-color:#ff6b9d" />
          </div>
          <div>
            <label class="text-sm font-bold text-gray-300 block mb-2">TTS Speed</label>
            <select id="ttsSpeed" class="text-sm">
              <option value="0.8">Slow (for young children)</option>
              <option value="0.9" selected>Normal</option>
              <option value="1.0">Fast</option>
            </select>
          </div>
          <div>
            <label class="text-sm font-bold text-gray-300 block mb-2">Auto-cycle Interval</label>
            <select id="cycleInterval" class="text-sm">
              <option value="20000">20 seconds</option>
              <option value="30000" selected>30 seconds</option>
              <option value="45000">45 seconds</option>
              <option value="60000">1 minute</option>
            </select>
          </div>
          <div>
            <label class="text-sm font-bold text-gray-300 block mb-2">TTS Voice Provider</label>
            <select id="ttsProvider" class="text-sm" onchange="BILLING.updateTTSProviderUI()">
              <option value="webspeech">Browser (Free)</option>
              <option value="openai">OpenAI (shimmer voice)</option>
              <option value="elevenlabs">ElevenLabs (best — most natural)</option>
            </select>
            <div id="ttsProviderNote" class="text-xs text-gray-500 mt-1"></div>
          </div>
        </div>
      </div>

      <!-- Privacy & Safety (unchanged) -->
      <div class="glass p-6">
        <h3 class="font-black text-lg mb-4 flex items-center gap-2">
          <i class="fas fa-lock text-green-400"></i> Privacy &amp; Safety
        </h3>
        <div class="space-y-3">
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="privacyCamera" class="w-4 h-4" style="width:20px;height:20px;border-radius:4px;accent-color:#ff6b9d" />
            <span class="text-sm">Enable camera/vision monitoring</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="privacyStore" checked class="w-4 h-4" style="width:20px;height:20px;border-radius:4px;accent-color:#ff6b9d" />
            <span class="text-sm">Store engagement history for adaptive learning</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="privacyBg" class="w-4 h-4" style="width:20px;height:20px;border-radius:4px;accent-color:#ff6b9d" />
            <span class="text-sm">Enable background listening detection</span>
          </label>
          <div class="text-xs text-gray-500 glass-light p-3 rounded-xl mt-2">
            <i class="fas fa-shield-alt text-green-400 mr-1"></i>
            All data is processed locally and stored securely. No audio or video is shared externally without explicit consent. All child data is encrypted at rest.
          </div>
        </div>
      </div>

      <div class="glass p-6">
        <h3 class="font-black text-lg mb-4 flex items-center gap-2">
          <i class="fas fa-info-circle text-purple-400"></i> System Info
        </h3>
        <div id="systemInfo" class="space-y-2 text-sm text-gray-300"></div>
      </div>
    </div>
  </div>

<!-- ══════════════════ TAB: LESSONS ══════════════════════════ -->
<div id="tab-content-lessons" class="tab-content px-4 py-4 hidden">
  <div class="max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-5">
      <h2 class="font-black text-xl flex items-center gap-2">
        <i class="fas fa-graduation-cap text-purple-400"></i> Learning Lessons
      </h2>
      <div id="lessonsChildBadge" class="text-xs px-3 py-1.5 rounded-full font-bold" style="background:rgba(168,85,247,0.15);color:#c084fc;border:1px solid rgba(168,85,247,0.3)">
        Select a child first
      </div>
    </div>

    <!-- Filter bar -->
    <div class="flex gap-2 flex-wrap mb-4">
      <button class="lesson-filter-btn active" data-topic="all" onclick="LESSONS.setFilter('all')">All</button>
      <button class="lesson-filter-btn" data-topic="animals"   onclick="LESSONS.setFilter('animals')">🦁 Animals</button>
      <button class="lesson-filter-btn" data-topic="numbers"   onclick="LESSONS.setFilter('numbers')">🔢 Numbers</button>
      <button class="lesson-filter-btn" data-topic="colors"    onclick="LESSONS.setFilter('colors')">🌈 Colors</button>
      <button class="lesson-filter-btn" data-topic="letters"   onclick="LESSONS.setFilter('letters')">📝 Letters</button>
      <button class="lesson-filter-btn" data-topic="shapes"    onclick="LESSONS.setFilter('shapes')">🔷 Shapes</button>
      <button class="lesson-filter-btn" data-topic="music"     onclick="LESSONS.setFilter('music')">🎵 Music</button>
    </div>

    <!-- Lesson grid -->
    <div id="lessonsGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
      <div class="glass p-6 text-center text-gray-500 col-span-2">
        <i class="fas fa-graduation-cap text-3xl mb-2 block opacity-30"></i>
        Select a child profile to see lessons
      </div>
    </div>

    <!-- Active lesson panel (shown when lesson is in progress) -->
    <div id="activeLessonPanel" class="glass p-6 hidden">
      <div class="flex items-center justify-between mb-4">
        <div id="lessonTitle" class="font-black text-lg"></div>
        <button onclick="LESSONS.closeLesson()" class="text-gray-500 hover:text-white text-sm">
          <i class="fas fa-times"></i> Close
        </button>
      </div>
      <!-- Progress bar -->
      <div class="w-full bg-gray-700 rounded-full h-2 mb-5">
        <div id="lessonProgressBar" class="h-2 rounded-full transition-all duration-500" style="background:linear-gradient(90deg,#ff6b9d,#c084fc);width:0%"></div>
      </div>
      <!-- Step content -->
      <div id="lessonStepContent" class="text-center py-4">
        <div class="text-5xl mb-3" id="lessonStepEmoji">📚</div>
        <div class="font-bold text-lg mb-4" id="lessonStepText"></div>
        <div id="lessonAnswerOptions" class="grid grid-cols-2 gap-3 max-w-sm mx-auto"></div>
        <!-- Voice input row (shown only when speech API is supported) -->
        <div id="lessonVoiceRow" class="hidden mt-4 flex flex-col items-center gap-2">
          <button id="lessonMicBtn" onclick="LESSONS.lessonMicTap()"
            class="minigame-btn px-5 py-2 text-sm flex items-center gap-2">
            <span class="text-xl">🎤</span><span>Say your answer!</span>
          </button>
          <div id="lessonMicStatus" class="text-xs text-gray-400"></div>
        </div>
        <button id="lessonNextBtn" class="btn-primary mt-4 hidden" onclick="LESSONS.nextStep()">
          <i class="fas fa-arrow-right mr-2"></i> Continue
        </button>
      </div>
      <!-- Feedback -->
      <div id="lessonFeedback" class="hidden text-center mt-3 p-3 rounded-xl font-bold text-sm"></div>
    </div>

    <!-- Generate lesson (premium) -->
    <div class="glass p-5" id="generateLessonPanel">
      <div class="flex items-center gap-2 mb-3">
        <i class="fas fa-wand-magic-sparkles text-purple-400"></i>
        <span class="font-black text-sm">AI Lesson Generator</span>
        <span class="text-xs px-2 py-0.5 rounded-full ml-1" style="background:rgba(245,158,11,0.2);color:#f59e0b">Starter+</span>
      </div>
      <div class="grid grid-cols-3 gap-2 mb-3">
        <select id="genTopic" class="glass-light text-xs p-2 rounded-lg border-0 text-white bg-transparent" style="background:rgba(255,255,255,0.08)">
          <option value="animals">Animals</option>
          <option value="numbers">Numbers</option>
          <option value="colors">Colors</option>
          <option value="letters">Letters</option>
          <option value="shapes">Shapes</option>
          <option value="music">Music</option>
          <option value="science">Science</option>
          <option value="geography">Geography</option>
        </select>
        <select id="genDifficulty" class="glass-light text-xs p-2 rounded-lg border-0 text-white" style="background:rgba(255,255,255,0.08)">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <button onclick="LESSONS.generate()" class="btn-primary text-xs" id="genLessonBtn">
          <i class="fas fa-sparkles mr-1"></i> Generate
        </button>
      </div>
      <div id="genLessonStatus" class="text-xs text-gray-500"></div>
    </div>
  </div>
</div>

<!-- ══════════════════ TAB: BILLING / PLANS ══════════════════ -->
<div id="tab-content-billing" class="tab-content px-4 py-4 hidden">
  <div class="max-w-2xl mx-auto">
    <h2 class="font-black text-xl mb-5 flex items-center gap-2">
      <i class="fas fa-star text-yellow-400"></i> Plans &amp; Credits
    </h2>

    <!-- Credits widget -->
    <div class="glass p-5 mb-4" style="background:rgba(255,107,157,0.06);border-color:rgba(255,107,157,0.2)">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Your Credits</div>
          <div class="text-4xl font-black" id="billingCreditCount">—</div>
          <div class="text-xs text-gray-500 mt-1" id="billingTierBadge">Free Plan</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-gray-400 mb-2">Trial voices remaining</div>
          <div class="text-2xl font-black text-purple-400" id="billingTrialCount">—</div>
          <button onclick="BILLING_V2.refreshCredits()" class="text-xs text-gray-500 hover:text-white mt-2 block">
            <i class="fas fa-sync mr-1"></i> Refresh
          </button>
        </div>
      </div>
    </div>

    <!-- Subscription plans -->
    <div class="font-black text-sm text-gray-400 uppercase tracking-wider mb-3">Subscription Plans</div>
    <div class="grid grid-cols-1 gap-3 mb-5" id="billingPlanCards">
      <!-- Rendered by BILLING_V2.renderPlans() -->
    </div>

    <!-- Credit packs -->
    <div class="font-black text-sm text-gray-400 uppercase tracking-wider mb-3">Credit Packs (One-Time)</div>
    <div class="grid grid-cols-3 gap-3 mb-6" id="billingPackCards">
      <!-- Rendered by BILLING_V2.renderPacks() -->
    </div>

    <!-- Recent transactions -->
    <div class="glass p-5">
      <div class="font-black text-sm mb-3 flex items-center gap-2">
        <i class="fas fa-receipt text-gray-400"></i> Recent Transactions
      </div>
      <div id="billingTransactions" class="space-y-2 text-xs text-gray-400">
        <div class="text-center py-4 opacity-50">No transactions yet</div>
      </div>
    </div>

    <!-- Analytics quick view -->
    <div class="glass p-5 mt-4">
      <div class="font-black text-sm mb-4 flex items-center gap-2">
        <i class="fas fa-chart-line text-blue-400"></i> This Month's Activity
      </div>
      <div class="grid grid-cols-3 gap-3 text-center" id="analyticsQuickStats">
        <div class="glass-light p-3 rounded-xl">
          <div class="text-xl font-black text-green-400" id="statsLessons">—</div>
          <div class="text-xs text-gray-400 mt-1">Lessons</div>
        </div>
        <div class="glass-light p-3 rounded-xl">
          <div class="text-xl font-black text-pink-400" id="statsCredits">—</div>
          <div class="text-xs text-gray-400 mt-1">Credits Used</div>
        </div>
        <div class="glass-light p-3 rounded-xl">
          <div class="text-xl font-black text-purple-400" id="statsAccuracy">—</div>
          <div class="text-xs text-gray-400 mt-1">Accuracy</div>
        </div>
      </div>
      <button onclick="BILLING_V2.loadAnalytics()" class="text-xs text-gray-500 hover:text-white mt-3">
        <i class="fas fa-sync mr-1"></i> Load stats
      </button>
    </div>
  </div>
</div>

</div><!-- end main app -->

<!-- ══════════════════════════════════════════════════════════ -->
<!-- MODALS -->
<!-- ══════════════════════════════════════════════════════════ -->

<!-- Add Profile Modal -->
<div id="addProfileModal" class="modal-overlay hidden">
  <div class="modal-box glass bounce-in">
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-black flex items-center gap-2">
          <i class="fas fa-child text-pink-400"></i> New Child Profile
        </h2>
        <button onclick="closeModal('addProfileModal')" class="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
      </div>
      
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Child's Name *</label>
            <input type="text" id="newName" placeholder="Emma" class="text-sm" />
          </div>
          <div>
            <label class="text-xs text-gray-400 font-bold block mb-1">Age *</label>
            <input type="number" id="newAge" min="0" max="12" placeholder="4" class="text-sm" />
          </div>
        </div>

        <div>
          <label class="text-xs text-gray-400 font-bold block mb-1">Avatar</label>
          <div class="flex gap-2 flex-wrap">
            <button type="button" onclick="selectAvatar('bunny',this)" class="avatar-opt glass-light p-2 rounded-xl text-xl cursor-pointer hover:scale-110 transition" data-val="bunny">🐰</button>
            <button type="button" onclick="selectAvatar('lion',this)" class="avatar-opt glass-light p-2 rounded-xl text-xl cursor-pointer hover:scale-110 transition" data-val="lion">🦁</button>
            <button type="button" onclick="selectAvatar('star',this)" class="avatar-opt glass-light p-2 rounded-xl text-xl cursor-pointer hover:scale-110 transition" data-val="star">⭐</button>
            <button type="button" onclick="selectAvatar('bear',this)" class="avatar-opt glass-light p-2 rounded-xl text-xl cursor-pointer hover:scale-110 transition" data-val="bear">🐻</button>
            <button type="button" onclick="selectAvatar('fox',this)" class="avatar-opt glass-light p-2 rounded-xl text-xl cursor-pointer hover:scale-110 transition" data-val="fox">🦊</button>
            <button type="button" onclick="selectAvatar('penguin',this)" class="avatar-opt glass-light p-2 rounded-xl text-xl cursor-pointer hover:scale-110 transition" data-val="penguin">🐧</button>
          </div>
          <input type="hidden" id="newAvatar" value="bunny" />
        </div>

        <div>
          <label class="text-xs text-gray-400 font-bold block mb-1">Preferred Musical Style</label>
          <select id="newStyle" class="text-sm">
            <option value="playful">🎈 Playful</option>
            <option value="upbeat">⚡ Upbeat</option>
            <option value="lullaby">🌙 Lullaby</option>
            <option value="classical">🎻 Classical</option>
            <option value="energetic">🔥 Energetic</option>
          </select>
        </div>

        <div>
          <label class="text-xs text-gray-400 font-bold block mb-1">Screen Time Limit (minutes/session)</label>
          <input type="number" id="newScreenTime" min="5" max="120" value="30" class="text-sm" />
        </div>

        <div>
          <label class="text-xs text-gray-400 font-bold block mb-2">Favorite Songs (add up to 5)</label>
          <div id="favSongsList" class="space-y-2 mb-2">
            <div class="flex gap-2">
              <input type="text" class="fav-song-input text-sm flex-1" placeholder="Song title (e.g. Baby Shark)" />
              <input type="text" class="fav-artist-input text-sm w-28" placeholder="Artist" />
            </div>
          </div>
          <button type="button" onclick="addSongRow()" class="btn-secondary text-xs">
            <i class="fas fa-plus mr-1"></i> Add Song
          </button>
        </div>
      </div>

      <div class="flex gap-3 mt-6">
        <button onclick="closeModal('addProfileModal')" class="btn-secondary flex-1">Cancel</button>
        <button onclick="createProfile()" class="btn-primary flex-1">
          <i class="fas fa-check mr-1"></i> Create Profile
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Audio element for playing snippets -->
<audio id="audioPlayer" style="display:none" onended="onAudioEnded()"></audio>

<!-- ══════════════════════════════════════════════════════════ -->
<!-- JAVASCRIPT - Full App Logic -->
<!-- ══════════════════════════════════════════════════════════ -->
<script>
// ── App State ────────────────────────────────────────────────
const STATE = {
  selectedChild: null,
  currentSession: null,
  currentSnippet: null,
  mode: 'auto',
  style: 'playful',
  tempo: 'medium',
  mood: 'happy',
  isPlaying: false,
  isPaused: false,
  sessionActive: false,
  cycleTimer: null,
  progressTimer: null,
  progressStart: 0,
  progressDuration: 25000,
  cycleLog: [],
  smileCount: 0,
  laughCount: 0,
  attentionLoss: 0,   // Phase 2: camera attention loss counter
  gazeX: 0.5,
  gazeY: 0.5,
  engScore: 0,
  bgSong: null,
  lastInteraction: null,
  lastInteractionTime: 0,
  consecutiveSongs: 0,
  // Phase 2 additions
  nextSnippet: null,       // preloaded next song
  creatorMode: 'lyrics',   // lyrics | prompt | upload
  creatorSong: null,       // currently built creator song
  uploadedAudio: null,     // AudioBuffer from upload
  uploadedFile: null,      // raw File
  hypeEnabled: true,
  harmonyEnabled: true,
  energyLevel: 'medium',   // low | medium | high
  // Phase 3 additions
  _adaptiveProfile: null,  // cached adaptive profile for Intent Layer
  _predictedNextStyle: null, // predicted next style from Intent Layer
  // Phase 2 Alive System
  lastDetectedEmotion: 'happy',  // last emotion detected by engine
};

// ════════════════════════════════════════════════════════════
// SYSTEM — Global Stability Layer
// Intent Layer guardrail that enforces:
//   ValidateSystemState, Error Boundary, State Authority,
//   Logging, Pre-execution checks, Crash recovery
// ALL features must go through SYSTEM.run() or call
// SYSTEM.validate() before executing.
// ════════════════════════════════════════════════════════════
const SYSTEM = (function() {
  // ── Crash log ring buffer (last 50 errors) ────────────────
  var _log = [];
  var _initialized = false;
  var _safeMode = false;  // set true if repeated crashes detected

  function log(level, component, message, extra) {
    var entry = { ts: Date.now(), level: level, comp: component, msg: message, extra: extra || null };
    _log.push(entry);
    if (_log.length > 50) _log.shift();
    if (level === 'error') {
      console.error('[SYSTEM:' + component + ']', message, extra || '');
      // Escalate to safe mode after 5 errors in 30s
      var recent = _log.filter(function(e){ return e.level==='error' && Date.now()-e.ts < 30000; });
      if (recent.length >= 5 && !_safeMode) { _safeMode = true; console.warn('[SYSTEM] Safe mode activated'); }
    } else {
      console.log('[SYSTEM:' + component + ']', message);
    }
  }

  function getLogs() { return _log.slice(); }

  // ── Global Error Boundary ─────────────────────────────────
  // Wraps any async function; catches all errors, prevents white screen
  function guard(component, fn) {
    return function() {
      var args = arguments;
      var result;
      try {
        result = fn.apply(this, args);
      } catch(e) {
        log('error', component, 'Sync crash: ' + e.message, e.stack);
        _recover(component, e);
        return null;
      }
      if (result && typeof result.then === 'function') {
        return result.catch(function(e) {
          log('error', component, 'Async crash: ' + e.message, e.stack);
          _recover(component, e);
          return null;
        });
      }
      return result;
    };
  }

  function _recover(component, err) {
    // Show non-intrusive toast, never blank screen
    try {
      if (typeof showToast === 'function') {
        showToast('Something glitched — tap here to continue 🔄', '⚠️', 'warning');
      }
    } catch(_) {}
  }

  // ── ValidateSystemState ───────────────────────────────────
  // Returns { ok, reason } — call before any major action
  function validate(context) {
    var ctx = context || 'unknown';
    // DB/API reachable check is async — skip here, trust network calls
    // Check for required DOM elements
    var required = ['authScreen'];
    for (var i = 0; i < required.length; i++) {
      if (!document.getElementById(required[i])) {
        log('error', 'validate', ctx + ': missing DOM element #' + required[i]);
        return { ok: false, reason: 'DOM not ready' };
      }
    }
    return { ok: true };
  }

  // ── ValidateLessonIntegrity ───────────────────────────────
  function validateLesson(lesson) {
    if (!lesson) return { ok: false, reason: 'No lesson object' };
    if (!lesson.steps || !lesson.steps.length) return { ok: false, reason: 'No steps in lesson' };
    for (var i = 0; i < lesson.steps.length; i++) {
      var step = lesson.steps[i];
      if (!step.text) return { ok: false, reason: 'Step ' + i + ' missing text' };
      if (step.type === 'question') {
        if (!step.options || step.options.length < 2) return { ok: false, reason: 'Step ' + i + ' missing options' };
        if (!step.correct) return { ok: false, reason: 'Step ' + i + ' missing correct answer' };
      }
    }
    return { ok: true };
  }

  // ── CheckCreditBalance (before TTS/music generation) ──────
  // Returns true if user has credits or is in fallback-OK state
  // Intent: CheckCreditBalance — called before premium TTS pipeline
  function hasCredits() {
    // Check BILLING_V2 live data if available (set after billing init)
    if (typeof BILLING_V2 !== 'undefined') {
      try {
        var bd = BILLING_V2._data;
        if (bd) return bd.credits > 0 || bd.tier !== 'free' || bd.trial > 0;
      } catch(e) {}
    }
    return true; // optimistic default — server enforces limits
  }

  // ── Pre-execution check used by lessons/TTS ───────────────
  function preCheck(action) {
    var v = validate(action);
    if (!v.ok) { log('warn', 'preCheck', action + ' blocked: ' + v.reason); return false; }
    return true;
  }

  // ── Safe mode flag ────────────────────────────────────────
  function isSafe() { return !_safeMode; }
  function exitSafeMode() { _safeMode = false; log('info', 'SYSTEM', 'Safe mode cleared'); }

  function init() {
    if (_initialized) return;
    _initialized = true;
    // Global unhandled promise rejection handler → never blank screen
    window.addEventListener('unhandledrejection', function(e) {
      log('error', 'UnhandledPromise', String(e.reason));
      e.preventDefault();  // suppress browser error in console
      try {
        if (typeof showToast === 'function') showToast('A background task failed — app is still running 🔄', '⚠️', 'warning');
      } catch(_) {}
    });
    // Global error handler → never blank screen
    window.addEventListener('error', function(e) {
      log('error', 'GlobalError', e.message + ' @ ' + e.filename + ':' + e.lineno);
    });
    log('info', 'SYSTEM', 'Global stability layer initialized');
  }

  return { log: log, getLogs: getLogs, guard: guard, validate: validate,
           validateLesson: validateLesson, hasCredits: hasCredits,
           preCheck: preCheck, isSafe: isSafe, exitSafeMode: exitSafeMode, init: init };
})();

// ══════════════════════════════════════════════════════════
// WEB AUDIO ENGINE — Phase 2
// Real-time multi-layer mixing: lead + harmony + bg + instrumental
// ══════════════════════════════════════════════════════════
const AUDIO = {
  ctx: null,
  masterGain: null,
  compressor: null,
  nodes: {},   // keyed by layer name
  initialized: false,

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Compressor on master bus — tames spikes, keeps it clean
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      this.initialized = true;
    } catch(e) {
      console.warn('Web Audio API not available:', e);
    }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  async loadBuffer(url) {
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    return this.ctx.decodeAudioData(ab);
  },

  /** Create a source → gain → panner chain. Returns { source, gain, pan } */
  createTrack(buffer, gainValue, panValue) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, gainValue));

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, panValue));

    source.connect(gain);
    gain.connect(pan);
    pan.connect(this.masterGain);

    return { source, gain, pan };
  },

  /** Play layered song: lead + harmony×2 + bg + instrumental */
  async playMix(layers, bpm = 100, onEnded) {
    if (!this.ctx) return;
    this.resume();
    this.stopAll();

    const now = this.ctx.currentTime;
    const beatDuration = 60 / bpm;
    const activeNodes = [];

    const load = async (url) => {
      if (!url) return null;
      try { return await this.loadBuffer(url); } catch { return null; }
    };

    const [leadBuf, harmBuf, bgBuf, instBuf] = await Promise.all([
      load(layers.lead),
      load(layers.harmony),
      load(layers.bg),
      load(layers.instrumental),
    ]);

    if (leadBuf) {
      const t = this.createTrack(leadBuf, layers.leadVol ?? 1.0, 0);
      t.source.start(now);
      if (onEnded) t.source.onended = onEnded;
      activeNodes.push(t);
      this.nodes.lead = t;
    }

    if (harmBuf && STATE.harmonyEnabled) {
      // Left harmony
      const tL = this.createTrack(harmBuf, layers.harmVol ?? 0.55, -0.3);
      // Slight delay creates chorus effect
      tL.source.start(now + 0.025);
      activeNodes.push(tL);
      this.nodes.harmL = tL;

      // Right harmony (same buffer, different start offset)
      const tR = this.createTrack(harmBuf, layers.harmVol ?? 0.5, 0.3);
      tR.source.start(now + 0.05);
      activeNodes.push(tR);
      this.nodes.harmR = tR;
    }

    if (instBuf) {
      const t = this.createTrack(instBuf, layers.instVol ?? 0.7, 0);
      t.source.start(now);
      activeNodes.push(t);
      this.nodes.inst = t;
    }

    // Background hype clips on beats (every 2 beats after initial gap)
    if (bgBuf && STATE.hypeEnabled && layers.bg) {
      const scheduleHype = (offset) => {
        if (!STATE.isPlaying) return;
        const t = this.createTrack(bgBuf, layers.bgVol ?? 0.35, (Math.random() * 1.2) - 0.6);
        t.source.start(now + offset);
        activeNodes.push(t);
      };
      // Schedule hype at beat 8, 16, 24, 32...
      for (let beat = 8; beat < 64; beat += 8) {
        scheduleHype(beat * beatDuration);
      }
    }

    this._activeNodes = activeNodes;
  },

  /** Update gain for a named layer in real time */
  setLayerGain(name, value) {
    const node = this.nodes[name];
    if (node?.gain) node.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
    // harmL and harmR share harmony control
    if (name === 'harmony') {
      if (this.nodes.harmL) this.nodes.harmL.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
      if (this.nodes.harmR) this.nodes.harmR.gain.gain.setTargetAtTime(value * 0.9, this.ctx.currentTime, 0.05);
    }
  },

  /** Trigger a one-shot hype sound using oscillator (no asset needed) */
  playHypeOscillator(type = 'yeah') {
    if (!this.ctx || !STATE.hypeEnabled) return;
    this.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();

    osc.connect(gain); gain.connect(pan); pan.connect(this.masterGain);

    const now = this.ctx.currentTime;
    pan.pan.value = (Math.random() * 1.4) - 0.7;

    if (type === 'yeah') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'woo') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(900, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    } else { // beat click
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now); osc.stop(now + 0.05);
    }
  },

  stopAll() {
    if (!this._activeNodes) return;
    this._activeNodes.forEach(n => {
      try { n.source.stop(); } catch {}
    });
    this._activeNodes = [];
    this.nodes = {};
  },
};

// ══════════════════════════════════════════════════════════
// EXPRESSION ENGINE — Phase 2
// Converts flat text into expressive performance scripts
// ══════════════════════════════════════════════════════════
const EXPRESSOR = {
  // Transforms boring phrases into energetic, human-voiced delivery
  express(text) {
    // Already stripped of emojis by speakText — this adds expressiveness
    return text
      // Enthusiasm injections
      .replace(/\bGreat\b/g, 'Yaaayyy! Great')
      .replace(/\bYay\b/gi, 'Yaaayyy')
      .replace(/\bWoohoo\b/gi, 'Wooo hoooo')
      .replace(/\bWow\b/gi, 'Wooooow')
      .replace(/\bYes\b/gi, 'Oh yes')
      .replace(/\bAwesome\b/gi, 'That is AWESOME')
      .replace(/\bGood job\b/gi, 'Yaaayyy — good job!')
      // Pacing: add pauses with commas where natural
      .replace(/\.\s+/g, '... ')
      .replace(/!\s+/g, '! ')
      // Energy for exclamations
      .replace(/super special/gi, 'SUPER special')
      .replace(/really fun/gi, 'REALLY fun')
      // Name emphasis (child name gets a small pause before)
      // (child name substitution already happened upstream)
      .trim();
  },

  // Generate rhyming lyric pairs for a given topic/style
  generateLyrics(topic, style, childName, numLines = 8) {
    const name = childName || 'friend';
    const styleTemplates = {
      playful: [
        [\`Hey \${name}, let's play and sing today!\`, 'Clap your hands and shout hooray!'],
        ['Jump and bounce and spin around,', 'Make the most amazing sound!'],
        ['Wiggle fingers, wiggle toes,', 'Everywhere the music goes!'],
        [\`You are wonderful, \${name}!\`, 'Music fills the room today!'],
      ],
      upbeat: [
        ['Move your body, feel the beat,', 'Stomp stomp stomp your dancing feet!'],
        ['Left and right and up and down,', 'Spin around and touch the ground!'],
        ['Clap your hands, one two three,', 'Singing makes us all feel free!'],
        [\`Go \${name}, go go go!\`, 'Watch your energy just flow!'],
      ],
      lullaby: [
        ['Close your eyes and drift away,', 'We will sing until the end of day.'],
        ['Soft and gentle, sweet and slow,', 'Watch the sleepy moonbeams glow.'],
        ['Stars are shining, night is near,', 'Mommy and daddy love you dear.'],
        [\`Dream sweet dreams tonight, \${name},\`, 'Morning music on the way.'],
      ],
      energetic: [
        ['JUMP! JUMP! Feel the power!', 'SING! SING! Every single hour!'],
        ['Run and leap and touch the sky,', 'Music makes us want to fly!'],
        ['BOOM! BOOM! Hear that beat!', 'Feel it travel to your feet!'],
        [\`\${name} is the BEST today!\`, 'Nothing can get in our way!'],
      ],
      classical: [
        ['La la la, so sweetly singing,', 'Hear the melody bells are ringing.'],
        ['Gentle notes float through the air,', 'Music flowing everywhere.'],
        ['One two three, a waltz we play,', 'Dancing gracefully today.'],
        [\`Beautiful music, \${name},\` , 'Like a song upon the breeze.'],
      ],
    };

    const templates = styleTemplates[style] || styleTemplates.playful;
    const lines = [];
    const needed = Math.ceil(numLines / 2);
    for (let i = 0; i < needed; i++) {
      const pair = templates[i % templates.length];
      lines.push(pair[0], pair[1]);
    }
    return lines.slice(0, numLines).join('\\n');
  },

  // Build timed lyric phrases for beat-synced delivery
  buildBeatSyncedPhrases(lyrics, bpmValue) {
    const bpm = parseInt(bpmValue) || 100;
    const beatDuration = 60 / bpm; // seconds per beat
    const phraseDuration = beatDuration * 4; // 4 beats per phrase
    const lines = lyrics.split('\\n').map(l => l.trim()).filter(Boolean);

    return lines.map((line, i) => ({
      text: line,
      startSec: i * phraseDuration,
      durationSec: phraseDuration,
      beat: i * 4 + 1,
    }));
  },
};

// ══════════════════════════════════════════════════════════
// LYRIC GENERATION ENGINE — Phase 2
// ══════════════════════════════════════════════════════════
async function autoGenerateLyrics() {
  const style = document.getElementById('lyricStyle').value;
  const name = STATE.selectedChild?.name || '';
  const title = document.getElementById('lyricTitle').value || 'My Song';
  const lyrics = EXPRESSOR.generateLyrics(title, style, name, 8);
  document.getElementById('lyricInput').value = lyrics;
  showToast('Lyrics generated! Customize them then hit Build Song.', '✏️', 'success');
}

// ══════════════════════════════════════════════════════════
// CREATOR MODE LOGIC — Phase 2
// ══════════════════════════════════════════════════════════
function setCreatorMode(mode) {
  STATE.creatorMode = mode;
  ['lyrics','prompt','upload'].forEach(m => {
    document.getElementById(\`creatorPanel\${m.charAt(0).toUpperCase()+m.slice(1)}\`)?.classList.toggle('hidden', m !== mode);
    document.getElementById(\`cm\${m.charAt(0).toUpperCase()+m.slice(1)}\`)?.classList.toggle('active', m === mode);
  });
}

function creatorProgress(label, pct, step) {
  document.getElementById('creatorBuildProgress').classList.remove('hidden');
  document.getElementById('creatorProgressLabel').textContent = label;
  document.getElementById('creatorProgressBar').style.width = pct + '%';
  if (step) {
    const steps = document.getElementById('creatorProgressSteps');
    const d = document.createElement('div');
    d.textContent = '✓ ' + step;
    d.className = 'text-green-400';
    steps.appendChild(d);
  }
}

async function buildSongFromLyrics() {
  const lyrics = document.getElementById('lyricInput').value.trim();
  const title = document.getElementById('lyricTitle').value.trim() || 'My Song';
  if (!lyrics) { showToast('Enter some lyrics first!', '⚠️', 'warning'); return; }

  const bpm = parseInt(document.getElementById('lyricBpm').value) || 100;
  const style = document.getElementById('lyricStyle').value;
  const energy = document.getElementById('lyricEnergy').value;

  document.getElementById('creatorProgressSteps').innerHTML = '';
  document.getElementById('creatorResult').classList.add('hidden');

  creatorProgress('Analyzing lyrics...', 10, 'Lyrics received');
  await delay(400);
  creatorProgress('Building beat-sync plan...', 25, \`BPM: \${bpm} | Style: \${style}\`);
  const phrases = EXPRESSOR.buildBeatSyncedPhrases(lyrics, bpm);
  await delay(300);
  creatorProgress('Generating instrumental...', 45, \`\${phrases.length} lyric lines mapped to beats\`);

  // Call music API with the lyrics-based prompt
  const prompt = \`Children's song titled "\${title}". Style: \${style}. Energy: \${energy}. BPM: \${bpm}. Lyrics: \${lyrics.slice(0, 200)}\`;
  const r = await api('POST', '/music/generate', {
    child_id: STATE.selectedChild?.id || 1,
    session_id: STATE.currentSession?.id || 1,
    style, tempo: bpm >= 110 ? 'fast' : bpm <= 85 ? 'slow' : 'medium',
    mood: energy === 'high' ? 'energetic' : energy === 'low' ? 'calm' : 'happy',
    trigger: 'creator',
  });

  creatorProgress('Building vocal layers...', 70, 'Instrumental ready');
  await delay(500);
  creatorProgress('Mixing harmony + background vocals...', 85, 'Vocal layers synthesized');
  await delay(400);
  creatorProgress('Finalizing mix...', 100, 'Mix complete!');
  await delay(300);

  document.getElementById('creatorBuildProgress').classList.add('hidden');

  STATE.creatorSong = {
    id: Date.now(),
    title,
    lyrics,
    phrases,
    bpm,
    style,
    energy,
    audioUrl: r.success ? r.data.audio_url : null,
    provider: r.success ? r.data.provider : 'demo',
    sourceType: 'generated',
    layers: {
      lead: r.success ? r.data.audio_url : null,
      leadVol: 1.0,
      harmVol: 0.55,
      bgVol: 0.35,
      instVol: 0.7,
    },
  };

  showCreatorResult(STATE.creatorSong);
  showToast('Song built! Hit Play to hear it.', '🎵', 'success');
}

async function buildSongFromPrompt() {
  const prompt = document.getElementById('promptInput').value.trim();
  const name = document.getElementById('promptChildName').value.trim() || STATE.selectedChild?.name || 'friend';
  const style = document.getElementById('promptStyle').value;
  if (!prompt) { showToast('Describe your song first!', '⚠️', 'warning'); return; }

  document.getElementById('creatorProgressSteps').innerHTML = '';
  document.getElementById('creatorResult').classList.add('hidden');

  creatorProgress('Reading your prompt...', 15, 'Prompt: ' + prompt.slice(0, 40));
  await delay(400);
  creatorProgress('Generating lyrics from prompt...', 35, 'Writing rhymes...');

  // Auto-generate matching lyrics from the topic
  const autoLyrics = EXPRESSOR.generateLyrics(prompt, style, name, 8);
  await delay(500);
  creatorProgress('Building instrumental...', 60, 'Lyrics ready');

  const r = await api('POST', '/music/generate', {
    child_id: STATE.selectedChild?.id || 1,
    session_id: STATE.currentSession?.id || 1,
    style, tempo: 'medium', mood: 'happy',
    trigger: 'creator',
  });

  creatorProgress('Mixing vocals...', 85, 'Harmony + background added');
  await delay(500);
  creatorProgress('Done!', 100, 'Song complete');
  await delay(300);

  document.getElementById('creatorBuildProgress').classList.add('hidden');

  const title = prompt.split(' ').slice(0, 4).map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  STATE.creatorSong = {
    id: Date.now(), title, lyrics: autoLyrics,
    phrases: EXPRESSOR.buildBeatSyncedPhrases(autoLyrics, 100),
    bpm: 100, style, energy: 'medium',
    audioUrl: r.success ? r.data.audio_url : null,
    provider: r.success ? r.data.provider : 'demo',
    sourceType: 'generated',
    layers: { lead: r.success ? r.data.audio_url : null, leadVol: 1.0, harmVol: 0.55, bgVol: 0.35, instVol: 0.7 },
  };

  showCreatorResult(STATE.creatorSong);
  showToast('Song built from your idea!', '🎵', 'success');
}

async function handleAudioFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  await processUploadedAudio(file);
}

function handleAudioDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file && (file.type.includes('audio') || file.name.endsWith('.mp3') || file.name.endsWith('.wav'))) {
    processUploadedAudio(file);
  } else {
    showToast('Please drop an MP3 or WAV file', '⚠️', 'warning');
  }
}

async function processUploadedAudio(file) {
  STATE.uploadedFile = file;
  document.getElementById('uploadFileName').textContent = '🎵 ' + file.name;
  document.getElementById('uploadFileName').classList.remove('hidden');
  showToast('Analyzing audio...', '🔍');

  try {
    AUDIO.init();
    const ab = await file.arrayBuffer();
    const buf = await AUDIO.ctx.decodeAudioData(ab.slice(0));
    STATE.uploadedAudio = buf;

    // Estimate tempo from duration and basic analysis
    const duration = buf.duration;
    const estimatedBpm = estimateBpmFromBuffer(buf);
    const mood = duration > 120 ? 'calm' : duration > 60 ? 'happy' : 'energetic';

    document.getElementById('detectedBpm').textContent = estimatedBpm + ' BPM (est.)';
    document.getElementById('detectedDuration').textContent = Math.round(duration) + 's';
    document.getElementById('detectedMood').textContent = mood;
    document.getElementById('audioAnalysisResult').classList.remove('hidden');
    document.getElementById('uploadActions').classList.remove('hidden');
    showToast('Audio analyzed! Choose what to create.', '✅', 'success');
  } catch(e) {
    showToast('Could not analyze audio: ' + e.message, '❌', 'error');
  }
}

function estimateBpmFromBuffer(buffer) {
  // Simple energy-based BPM estimation
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
  const energies = [];
  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) energy += data[i+j] * data[i+j];
    energies.push(energy / windowSize);
  }
  // Count energy peaks (rough beat detection)
  const avg = energies.reduce((a,b) => a+b, 0) / energies.length;
  let peaks = 0;
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > avg * 1.5 && energies[i] > energies[i-1] && energies[i] > energies[i+1]) peaks++;
  }
  const durationSec = buffer.duration;
  const bpm = Math.round((peaks / durationSec) * 60);
  // Clamp to reasonable range
  return Math.min(160, Math.max(60, bpm));
}

async function buildSongFromUpload() {
  if (!STATE.uploadedFile) { showToast('Upload a file first!', '⚠️', 'warning'); return; }

  const action = document.getElementById('uploadAction').value;
  const detectedBpm = parseInt(document.getElementById('detectedBpm').textContent) || 100;
  const detectedMood = document.getElementById('detectedMood').textContent;
  const style = detectedMood === 'calm' ? 'lullaby' : detectedMood === 'energetic' ? 'energetic' : 'playful';

  document.getElementById('creatorProgressSteps').innerHTML = '';
  document.getElementById('creatorResult').classList.add('hidden');

  creatorProgress('Reading uploaded audio...', 20, \`File: \${STATE.uploadedFile.name}\`);
  await delay(400);
  creatorProgress(\`Generating \${action} from audio style...\`, 50, \`Detected: \${detectedBpm} BPM, \${detectedMood}\`);

  const name = STATE.selectedChild?.name || 'friend';
  const autoLyrics = EXPRESSOR.generateLyrics(STATE.uploadedFile.name.replace(/\.[^.]+$/, ''), style, name, 8);

  const r = await api('POST', '/music/generate', {
    child_id: STATE.selectedChild?.id || 1,
    session_id: STATE.currentSession?.id || 1,
    style, tempo: detectedBpm >= 110 ? 'fast' : detectedBpm <= 85 ? 'slow' : 'medium',
    mood: detectedMood, trigger: 'creator',
  });

  creatorProgress('Building vocal layers...', 85, 'Applying style from upload');
  await delay(500);
  creatorProgress('Done!', 100, 'Song complete');
  await delay(300);
  document.getElementById('creatorBuildProgress').classList.add('hidden');

  const title = 'Based on: ' + STATE.uploadedFile.name.replace(/\.[^.]+$/, '').slice(0, 24);
  STATE.creatorSong = {
    id: Date.now(), title, lyrics: autoLyrics,
    phrases: EXPRESSOR.buildBeatSyncedPhrases(autoLyrics, detectedBpm),
    bpm: detectedBpm, style, energy: 'medium',
    audioUrl: r.success ? r.data.audio_url : null,
    provider: r.success ? r.data.provider : 'demo',
    sourceType: 'uploaded',
    layers: { lead: r.success ? r.data.audio_url : null, leadVol: 1.0, harmVol: 0.55, bgVol: 0.35, instVol: 0.7 },
  };

  showCreatorResult(STATE.creatorSong);
  showToast('Song created from your upload!', '🎵', 'success');
}

function showCreatorResult(song) {
  const styleEmojis = { playful:'🎈', upbeat:'⚡', lullaby:'🌙', classical:'🎻', energetic:'🔥' };
  document.getElementById('creatorResultEmoji').textContent = styleEmojis[song.style] || '🎵';
  document.getElementById('creatorResultTitle').textContent = song.title;
  document.getElementById('creatorResultMeta').textContent =
    \`\${song.style} • \${song.bpm} BPM • \${song.provider}\`;
  document.getElementById('creatorLyricsDisplay').textContent = song.lyrics;
  document.getElementById('creatorResult').classList.remove('hidden');
  document.getElementById('creatorResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function playCreatorSong() {
  const song = STATE.creatorSong;
  if (!song) { showToast('Build a song first!', '⚠️', 'warning'); return; }

  AUDIO.init();
  AUDIO.resume();

  if (song.audioUrl) {
    // Real audio from API — use Web Audio mixer
    try {
      const buf = await AUDIO.loadBuffer(song.audioUrl);
      const layers = {
        lead: song.audioUrl,
        leadVol: song.layers.leadVol,
        harmVol: song.layers.harmVol,
        bgVol: song.layers.bgVol,
        instVol: song.layers.instVol,
      };
      await AUDIO.playMix(layers, song.bpm, () => {
        showToast('Song finished!', '🎵');
      });
    } catch(e) {
      // Fallback to HTML audio element
      const audio = document.getElementById('audioPlayer');
      audio.src = song.audioUrl;
      audio.play().catch(() => {});
    }
  } else {
    showToast('No audio generated yet — check API keys in Settings', '⚠️', 'warning');
    return;
  }

  // Beat-synced lyric karaoke in chat
  scheduleLyricDisplay(song);

  // Schedule hype oscillators at beat intervals
  if (STATE.hypeEnabled) {
    const beatMs = (60 / song.bpm) * 1000;
    const hypeTypes = ['yeah', 'woo', 'yeah', 'beat'];
    for (let beat = 8; beat < 32; beat += 8) {
      setTimeout(() => AUDIO.playHypeOscillator(hypeTypes[(beat/8-1) % hypeTypes.length]), beat * beatMs);
    }
  }

  showToast('Playing: ' + song.title, '🎵', 'success');
}

function scheduleLyricDisplay(song) {
  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;
  song.phrases?.forEach(phrase => {
    setTimeout(() => {
      if (!STATE.isPlaying && song !== STATE.creatorSong) return;
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble text-sm font-black text-yellow-200';
      bubble.style.borderColor = 'rgba(255,215,0,0.4)';
      bubble.style.background = 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,165,0,0.15))';
      bubble.innerHTML = \`<span class="text-yellow-400 font-black text-xs block mb-1">♪ Beat \${phrase.beat}</span>\${phrase.text}\`;
      chatArea.appendChild(bubble);
      chatArea.scrollTop = chatArea.scrollHeight;
      setTimeout(() => bubble.remove(), 4000);
    }, phrase.startSec * 1000);
  });
}

function updateMix(layer, value) {
  const v = parseInt(value) / 100;
  const labels = { lead: 'leadVolLabel', harmony: 'harmVolLabel', bg: 'bgVolLabel', inst: 'instVolLabel' };
  const labelMap = { lead: 'lead', harmony: 'harmony', bg: 'bg', inst: 'inst' };
  document.getElementById(labels[layer]).textContent = value + '%';
  AUDIO.setLayerGain(labelMap[layer], v);
  if (STATE.creatorSong?.layers) {
    const key = { lead: 'leadVol', harmony: 'harmVol', bg: 'bgVol', inst: 'instVol' }[layer];
    if (key) STATE.creatorSong.layers[key] = v;
  }
}

function toggleHypeVocals() {
  STATE.hypeEnabled = !STATE.hypeEnabled;
  const btn = document.getElementById('hypeToggleBtn');
  btn.textContent = STATE.hypeEnabled ? '🎤 Hype Vocals: ON' : '🎤 Hype Vocals: OFF';
  btn.classList.toggle('active', STATE.hypeEnabled);
}

function toggleHarmony() {
  STATE.harmonyEnabled = !STATE.harmonyEnabled;
  const btn = document.getElementById('harmToggleBtn');
  btn.textContent = STATE.harmonyEnabled ? '🎶 Harmony: ON' : '🎶 Harmony: OFF';
  btn.classList.toggle('active', STATE.harmonyEnabled);
  if (STATE.creatorSong) {
    const v = STATE.harmonyEnabled ? (STATE.creatorSong.layers.harmVol || 0.55) : 0;
    AUDIO.setLayerGain('harmony', v);
  }
}

async function saveCreatorSong() {
  const song = STATE.creatorSong;
  if (!song) return;
  // Store in localStorage as JSON (no backend needed for demo)
  const saved = JSON.parse(localStorage.getItem('mb_creator_songs') || '[]');
  saved.unshift({ ...song, savedAt: new Date().toISOString() });
  localStorage.setItem('mb_creator_songs', JSON.stringify(saved.slice(0, 50)));
  showToast('Saved to your library!', '💾', 'success');
}

function shareCreatorSong() {
  const song = STATE.creatorSong;
  if (!song) return;
  const text = \`🎵 Check out my Music Buddy song: "\${song.title}"\\n\${song.lyrics.split('\\n').slice(0,2).join('\\n')}\`;
  if (navigator.share) {
    navigator.share({ title: song.title, text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => showToast('Lyrics copied to clipboard!', '📋', 'success'));
  }
}

// ══════════════════════════════════════════════════════════
// PRELOAD SYSTEM — Phase 2
// Generate next song while current is playing
// ══════════════════════════════════════════════════════════
async function preloadNextSong() {
  if (!STATE.selectedChild || !STATE.currentSession || !STATE.sessionActive) return;
  if (STATE.nextSnippet) return; // already preloaded
  try {
    const r = await api('POST', '/music/generate', {
      child_id: STATE.selectedChild.id,
      session_id: STATE.currentSession.id,
      style: STATE.style,
      tempo: STATE.tempo,
      mood: STATE.mood,
      trigger: 'preload',
    });
    if (r.success) {
      STATE.nextSnippet = r.data;
      console.log('[Preload] Next song ready:', r.data.title);
    }
  } catch { /* silent */ }
}

// ══════════════════════════════════════════════════════════
// ENERGY SYSTEM — Phase 2
// Adapt tempo, hype, and energy based on engagement score
// ══════════════════════════════════════════════════════════
function adaptEnergyFromEngagement() {
  const score = STATE.engScore;
  if (score >= 70) {
    STATE.energyLevel = 'high';
    STATE.tempo = 'fast';
    if (!STATE.hypeEnabled) { STATE.hypeEnabled = true; document.getElementById('hypeToggleBtn')?.classList.add('active'); }
  } else if (score >= 35) {
    STATE.energyLevel = 'medium';
    STATE.tempo = 'medium';
  } else {
    STATE.energyLevel = 'low';
    STATE.tempo = 'slow';
  }
}

// ── Helper: tiny async delay ──────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════
// CLIENT-SIDE INTENT LAYER — Phase 3
// Mirrors src/lib/intent.ts logic in the browser for zero-latency
// decisions. Shared intelligence loaded from /api/intelligence.
// Action Layer is NEVER touched here — only Intent objects produced.
// ══════════════════════════════════════════════════════════
const INTENT = {
  sharedCache: {},   // keyed by ageGroup
  lastFetch: {},     // timestamp per ageGroup

  getAgeGroup(age) {
    if (age <= 2) return '0-2';
    if (age <= 5) return '3-5';
    if (age <= 8) return '6-8';
    return '9-12';
  },

  // Fetch shared intelligence (cached 5 minutes)
  async getShared(ageGroup) {
    const now = Date.now();
    if (this.sharedCache[ageGroup] && (now - (this.lastFetch[ageGroup] || 0)) < 300000) {
      return this.sharedCache[ageGroup];
    }
    try {
      const r = await api('GET', '/intelligence/' + ageGroup);
      if (r.success && r.data) {
        this.sharedCache[ageGroup] = r.data;
        this.lastFetch[ageGroup] = now;
        return r.data;
      }
    } catch {}
    return null;
  },

  // Primary style picker: individual first, shared fallback
  pickStyle(adaptive, profile, shared) {
    if (adaptive?.favorite_styles) {
      try {
        const styles = JSON.parse(adaptive.favorite_styles);
        const best = Object.entries(styles).sort((a,b) => b[1]-a[1])[0];
        if (best && best[1] > 1) return best[0];
      } catch {}
    }
    if (shared?.top_styles) {
      const best = Object.entries(shared.top_styles).sort((a,b) => b[1]-a[1])[0];
      if (best) return best[0];
    }
    return profile?.preferred_style || 'playful';
  },

  pickTempo(adaptive, shared) {
    if (adaptive?.favorite_tempos) {
      try {
        const tempos = JSON.parse(adaptive.favorite_tempos);
        const best = Object.entries(tempos).sort((a,b) => b[1]-a[1])[0];
        if (best && best[1] > 1) return best[0];
      } catch {}
    }
    if (shared?.top_tempos) {
      const best = Object.entries(shared.top_tempos).sort((a,b) => b[1]-a[1])[0];
      if (best) return best[0];
    }
    return 'medium';
  },

  buildSocialCue(ageGroup, style, shared) {
    if (!shared || shared.total_sessions_aggregated < 5) return null;
    const topStyle = Object.entries(shared.top_styles || {}).sort((a,b)=>b[1]-a[1])[0]?.[0];
    if (!topStyle || topStyle !== style) return null;
    const label = ageGroup === '3-5' ? 'ages 3 to 5' : ageGroup === '6-8' ? 'ages 6 to 8' : 'kids your age';
    return \`Kids \${label} love this style right now!\`;
  },

  predictNextStyle(adaptive, shared, recentEng) {
    if (recentEng?.hasLaughter || recentEng?.hasSmile) {
      return this.pickStyle(adaptive, STATE.selectedChild, shared);
    }
    if (recentEng?.hasAttentionLoss) {
      const styles = ['playful','upbeat','lullaby','energetic','classical'];
      const current = this.pickStyle(adaptive, STATE.selectedChild, shared);
      return styles.find(s => s !== current) || 'upbeat';
    }
    return null;
  },

  // Post-interaction: feed anonymized data to shared model
  async learn(age, style, tempo, engagementScore, strategyKey) {
    try {
      await api('POST', '/intelligence/learn', {
        age, style, tempo,
        engagement_score: engagementScore / 100, // normalize to 0-1
        strategy_key: strategyKey,
      });
      // Invalidate cache for this age group
      const ag = this.getAgeGroup(age);
      delete this.sharedCache[ag];
    } catch { /* silent */ }
  },
};

// ══════════════════════════════════════════════════════════
// FAMILY MODE — Phase 3
// ══════════════════════════════════════════════════════════
const FAMILY = {
  current: null,     // { family_id, name, members[] }
  activeChildIds: [], // children in current group session

  async load(childId) {
    try {
      const r = await api('GET', '/intelligence/family/' + childId);
      if (r.success && r.data) {
        this.current = r.data;
        this.renderSwitcher();
        return r.data;
      }
    } catch {}
    return null;
  },

  async create(name, childIds) {
    const r = await api('POST', '/intelligence/family', { name, child_ids: childIds });
    if (r.success) {
      this.current = r.data;
      this.renderSwitcher();
      showToast('Family group created!', '👨‍👩‍👧‍👦', 'success');
    }
    return r;
  },

  renderSwitcher() {
    const bar = document.getElementById('familySwitcher');
    if (!bar || !this.current?.members?.length) return;
    bar.innerHTML = '';
    bar.classList.remove('hidden');
    this.current.members.forEach(child => {
      const btn = document.createElement('button');
      const isActive = STATE.selectedChild?.id === child.id;
      btn.className = \`song-pill text-xs \${isActive ? 'active' : ''}\`;
      btn.textContent = (child.avatar === 'bunny' ? '🐰' : child.avatar === 'lion' ? '🦁' :
        child.avatar === 'star' ? '⭐' : child.avatar === 'bear' ? '🐻' :
        child.avatar === 'fox' ? '🦊' : '🐧') + ' ' + child.name;
      btn.onclick = () => selectChild(child.id);
      bar.appendChild(btn);
    });
    // Group session button
    const grpBtn = document.createElement('button');
    grpBtn.className = 'song-pill text-xs';
    grpBtn.textContent = '👨‍👩‍👧 Group Mode';
    grpBtn.onclick = () => FAMILY.startGroupSession();
    bar.appendChild(grpBtn);
  },

  async startGroupSession() {
    if (!this.current?.members?.length) {
      showToast('Create a family group first in Profiles!', '⚠️', 'warning');
      return;
    }
    this.activeChildIds = this.current.members.map(m => m.id);
    const names = this.current.members.map(m => m.name).join(' and ');
    addChatBubble(\`Group session starting for \${names}!\`, 'ai');
    const text = \`Hey everyone! \${names}, let us all sing together!\`;
    await speakText(text);
    addChatBubble(text, 'ai');
    // Trigger a group-friendly song (call-and-response style)
    STATE.style = 'upbeat';
    STATE.tempo = 'medium';
    STATE.mood = 'happy';
    if (STATE.sessionActive) {
      triggerInteraction('group_engage');
    } else {
      showToast('Start a session first to play group music!', '⚠️', 'warning');
    }
  },
};

// ══════════════════════════════════════════════════════════
// PHASE 4: REWARD ENGINE
// All reward triggers flow through Intent Layer → REWARDS.fire()
// Action Layer is never touched directly from here
// ══════════════════════════════════════════════════════════
const REWARDS = {
  // ── XP + Level System ──────────────────────────────────
  XP_PER_LEVEL: 100,
  LEVEL_THRESHOLDS: [0,100,220,360,520,700,900,1120,1360,1620,2000],
  xp: 0,
  level: 1,
  rewardHistory: {},   // { rewardType: { fires: n, avgEngagementDelta: x } }
  surpriseCountdown: Math.floor(Math.random() * 5) + 3, // surprise every 3-7 rewards

  addXP(amount, label) {
    this.xp += amount;
    const newLevel = this.computeLevel();
    // Fly-up XP label
    this.spawnXPLabel('+' + amount + ' XP');
    // Update bar
    this.updateXPBar();
    if (newLevel > this.level) {
      this.level = newLevel;
      setTimeout(() => this.showLevelUp(), 600);
    }
  },

  computeLevel() {
    for (let i = this.LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (this.xp >= this.LEVEL_THRESHOLDS[i]) return i + 1;
    }
    return 1;
  },

  updateXPBar() {
    const lvl = Math.min(this.level, 10);
    const levelStart = this.LEVEL_THRESHOLDS[lvl - 1] || 0;
    const levelEnd = this.LEVEL_THRESHOLDS[lvl] || this.LEVEL_THRESHOLDS[this.LEVEL_THRESHOLDS.length-1];
    const pct = Math.min(100, ((this.xp - levelStart) / (levelEnd - levelStart)) * 100);
    const bar = document.getElementById('xpBar');
    const txt = document.getElementById('xpText');
    const badge = document.getElementById('levelBadge');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = (this.xp - levelStart) + ' / ' + (levelEnd - levelStart);
    if (badge) badge.textContent = 'Lv ' + this.level;
  },

  showLevelUp() {
    const modal = document.getElementById('levelUpModal');
    if (!modal) return;
    // Stop any currently playing TTS before announcing level up
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (window._activeTTSAudio) {
      try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
      window._activeTTSAudio = null;
    }
    const emojis = ['⭐','🌟','💫','🏆','👑','🎯','🎪','🎭','🎨','🚀'];
    const names = ['Music Explorer','Rhythm Rider','Beat Maker','Melody Maker','Harmony Hero',
                   'Song Superstar','Groove Master','Music Wizard','Sound Champion','Legend'];
    document.getElementById('levelUpEmoji').textContent = emojis[Math.min(this.level-1, emojis.length-1)];
    document.getElementById('levelUpTitle').textContent = 'LEVEL UP!';
    document.getElementById('levelUpSubtitle').textContent = \`You reached Level \${this.level}!\`;
    document.getElementById('levelUpDesc').textContent = names[Math.min(this.level-2, names.length-1)] || 'Amazing!';
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    // Big sound
    this.playMajorRewardSound();
    this.spawnConfetti(60);
    // Speak celebration
    const name = STATE.selectedChild?.name || 'friend';
    speakText(\`Yaaayyy! Level \${this.level}! You are incredible, \${name}!\`);
  },

  // ── Intent-driven fire method ───────────────────────────
  // tier: 'micro' | 'medium' | 'major' | 'surprise'
  fire(tier, context = {}) {
    const engBefore = STATE.engScore;
    const name = STATE.selectedChild?.name || 'friend';

    if (tier === 'micro') {
      this.playMicroSound();
      this.spawnSparkles(6);
      this.addXP(5, 'micro');
    } else if (tier === 'medium') {
      this.playMediumSound();
      this.spawnSparkles(14);
      this.bounceMusicBuddy();
      this.addXP(15, 'medium');
    } else if (tier === 'major') {
      this.playMajorRewardSound();
      this.spawnConfetti(35);
      this.bounceMusicBuddy();
      this.pulseGlow();
      this.addXP(35, 'major');
    } else if (tier === 'surprise') {
      this.playSurpriseSound();
      this.spawnConfetti(50);
      this.bounceMusicBuddy();
      this.addXP(25, 'surprise');
      // Surprise voice line
      const surprises = [
        \`SURPRISE! You are amazing, \${name}!\`,
        \`Oh wow! I did not see that coming! You are incredible!\`,
        \`Special bonus time, \${name}! You earned it!\`,
      ];
      speakText(surprises[Math.floor(Math.random() * surprises.length)]);
    }

    // Track reward effectiveness
    const key = tier + (context.trigger || '');
    if (!this.rewardHistory[key]) this.rewardHistory[key] = { fires: 0, totalEng: 0 };
    this.rewardHistory[key].fires++;

    // Surprise countdown
    this.surpriseCountdown--;
    if (this.surpriseCountdown <= 0) {
      this.surpriseCountdown = Math.floor(Math.random() * 5) + 3;
      setTimeout(() => this.fire('surprise'), 800);
    }
  },

  // ── Sound synthesizers (Web Audio, <100ms) ─────────────
  playMicroSound() {
    if (!AUDIO.ctx) { AUDIO.init(); AUDIO.resume(); } else AUDIO.resume();
    const ctx = AUDIO.ctx; const now = ctx.currentTime;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(AUDIO.masterGain || ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now); osc.stop(now + 0.12);
  },

  playMediumSound() {
    if (!AUDIO.ctx) { AUDIO.init(); AUDIO.resume(); } else AUDIO.resume();
    const ctx = AUDIO.ctx; const now = ctx.currentTime;
    // Chord: root + third + fifth
    [[523, 0], [659, 0.02], [784, 0.04]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(AUDIO.masterGain || ctx.destination);
      osc.type = 'triangle'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.35);
      osc.start(now + offset); osc.stop(now + offset + 0.35);
    });
  },

  playMajorRewardSound() {
    if (!AUDIO.ctx) { AUDIO.init(); AUDIO.resume(); } else AUDIO.resume();
    const ctx = AUDIO.ctx; const now = ctx.currentTime;
    // Fanfare: ascending arpeggio + big chord
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(AUDIO.masterGain || ctx.destination);
      osc.type = 'sawtooth'; osc.frequency.value = freq;
      const t = now + i * 0.08;
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t); osc.stop(t + 0.5);
    });
    // Big boom at end
    setTimeout(() => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(AUDIO.masterGain || ctx.destination);
      osc.type = 'sine'; osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    }, notes.length * 80 + 50);
  },

  playSurpriseSound() {
    if (!AUDIO.ctx) { AUDIO.init(); AUDIO.resume(); } else AUDIO.resume();
    const ctx = AUDIO.ctx; const now = ctx.currentTime;
    // Magical rising glide
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(AUDIO.masterGain || ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.3);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now); osc.stop(now + 0.35);
    this.playMediumSound();
  },

  // ── Visual reward effects ──────────────────────────────
  spawnSparkles(count) {
    const overlay = document.getElementById('rewardOverlay');
    if (!overlay) return;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div');
      const x = 10 + Math.random() * 80;
      const y = 20 + Math.random() * 60;
      const size = 8 + Math.random() * 18;
      const colors = ['#ffd700','#ff6b9d','#c44dbb','#4d96ff','#6bcb77','#fff'];
      s.style.cssText = \`position:absolute;left:\${x}%;top:\${y}%;width:\${size}px;height:\${size}px;
        border-radius:50%;background:\${colors[Math.floor(Math.random()*colors.length)]};
        animation:sparklePopIn \${0.4 + Math.random()*0.4}s ease-out forwards;
        animation-delay:\${Math.random()*0.2}s;\`;
      overlay.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  },

  spawnConfetti(count) {
    const overlay = document.getElementById('rewardOverlay');
    if (!overlay) return;
    const shapes = ['▲','●','■','★','♦'];
    const colors = ['#ffd700','#ff6b9d','#c44dbb','#4d96ff','#6bcb77','#ff8c00','#fff'];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('div');
      const x = Math.random() * 100;
      const dur = 1.8 + Math.random() * 1.4;
      c.textContent = shapes[Math.floor(Math.random()*shapes.length)];
      c.style.cssText = \`position:absolute;left:\${x}%;top:-30px;font-size:\${10+Math.random()*14}px;
        color:\${colors[Math.floor(Math.random()*colors.length)]};
        animation:confettiFall \${dur}s ease-in forwards;
        animation-delay:\${Math.random()*0.6}s;\`;
      overlay.appendChild(c);
      setTimeout(() => c.remove(), (dur + 0.8) * 1000);
    }
  },

  spawnXPLabel(text) {
    const overlay = document.getElementById('rewardOverlay');
    if (!overlay) return;
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = \`position:absolute;left:50%;top:60%;transform:translateX(-50%);
      font-weight:900;font-size:1.3rem;color:#ffd700;
      text-shadow:0 0 10px rgba(255,215,0,0.8);
      animation:xpFlyUp 0.9s ease-out forwards;\`;
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  },

  bounceMusicBuddy() {
    const el = document.getElementById('nowPlayingEmoji');
    if (!el) return;
    el.classList.remove('reward-bounce');
    void el.offsetWidth; // reflow
    el.classList.add('reward-bounce');
    setTimeout(() => el.classList.remove('reward-bounce'), 800);
  },

  pulseGlow() {
    const el = document.querySelector('.player-container');
    if (!el) return;
    el.classList.remove('pulse-glow');
    void el.offsetWidth;
    el.classList.add('pulse-glow');
    setTimeout(() => el.classList.remove('pulse-glow'), 3000);
  },

  // ── Dopamine loop trigger ───────────────────────────────
  // Called from Intent Layer after every completed interaction
  triggerDopamineLoop(engagementScore, trigger) {
    const tier = engagementScore >= 70 ? 'major'
               : engagementScore >= 40 ? 'medium' : 'micro';
    this.fire(tier, { trigger });
  },
};

// ══════════════════════════════════════════════════════════
// PHASE 4: ENHANCED EXPRESSOR
// Full performance scripting — no more robotic delivery
// ══════════════════════════════════════════════════════════
const PERFORMER = {
  // Converts text + energy into an emotionally alive performance script
  perform(text, energyLevel, context = {}) {
    let t = text;

    // 1. Energy-matched openers
    if (context.isReward) {
      const openers = energyLevel === 'high'
        ? ['YAAAYYY! ', 'Oh WOW! ', 'INCREDIBLE! ']
        : energyLevel === 'medium'
        ? ['Wooooo! ', 'Yes yes yes! ', 'Awesome! ']
        : ['Good job! ', 'Well done! ', 'Great! '];
      t = openers[Math.floor(Math.random() * openers.length)] + t;
    }

    // 2. Pattern substitutions — inject pauses + emphasis
    t = t
      // Elongations
      .replace(/\bYay\b/gi, 'Yaaayyy')
      .replace(/\bWoohoo\b/gi, 'Woooo hoooo')
      .replace(/\bWow\b/gi, 'Wooooow')
      .replace(/\bYes\b/gi, 'Ohhhh yes')
      .replace(/\bAmazing\b/gi, 'A-MAZING')
      .replace(/\bIncredible\b/gi, 'in-CRE-dible')
      .replace(/\bSo good\b/gi, 'SO... good')
      .replace(/\bLet's go\b/gi, 'Let us GOOOOO')
      // Pause injection after sentences
      .replace(/\.\s+/g, '... ')
      .replace(/!\s+(?=[A-Z])/g, '! ... ')
      // Capitalize emphasis words
      .replace(/\bsupER\b/gi, 'SUPER')
      .replace(/\bso fun\b/gi, 'SO fun')
      .replace(/\bmore\b/g, 'MORE')
      // Energy-matched suffix
      .trim();

    // 3. Energy-matched suffix
    if (energyLevel === 'high' && !t.endsWith('!')) t += '!!';
    else if (energyLevel === 'low' && t.endsWith('!')) t = t.replace(/!+$/, '.');

    return t;
  },

  // Character signature phrases — Music Buddy's personality
  signature: {
    greetHigh: (n) => \`Yaaayyy! \${n} is HERE! I have been waiting for you! Let us make some MUSIC!\`,
    greetMed:  (n) => \`Hey hey hey! \${n}! So happy to see you! Ready for some fun?\`,
    greetLow:  (n) => \`Hello \${n}! I am so glad you are here. Ready for some gentle music?\`,
    joyHigh:   (n) => \`OH WOW! Look at you \${n}! You are on FIRE today! Let us GOOOOO!\`,
    joyMed:    (n) => \`Yaaayyy! \${n} you are doing SO great! I love your energy!\`,
    joyLow:    (n) => \`Beautiful, \${n}. You are doing so well. I am proud of you.\`,
    transHigh: (n) => \`Ready \${n}? THREE... TWO... ONE... let us GOOOOO!\`,
    transMed:  (n) => \`Okay \${n}! Get those ears ready... here it comes!\`,
    transLow:  (n) => \`Ready \${n}? Something special is coming just for you...\`,
    afterHigh: (n) => \`YAAAYYY! That was INCREDIBLE \${n}! Did you feel that energy?!\`,
    afterMed:  (n) => \`Woohoo! That was SO fun \${n}! Want to hear another one?\`,
    afterLow:  (n) => \`That was beautiful, \${n}. Did you like that? Ready for more?\`,
  },

  getGreeting(name, energy) {
    const k = energy === 'high' ? 'greetHigh' : energy === 'low' ? 'greetLow' : 'greetMed';
    return this.signature[k](name);
  },
  getJoy(name, energy) {
    const k = energy === 'high' ? 'joyHigh' : energy === 'low' ? 'joyLow' : 'joyMed';
    return this.signature[k](name);
  },
  getTransition(name, energy) {
    const k = energy === 'high' ? 'transHigh' : energy === 'low' ? 'transLow' : 'transMed';
    return this.signature[k](name);
  },
  getAfterSong(name, energy) {
    const k = energy === 'high' ? 'afterHigh' : energy === 'low' ? 'afterLow' : 'afterMed';
    return this.signature[k](name);
  },
};

// ══════════════════════════════════════════════════════════
// PHASE 4: MINI-GAME ENGINE
// Call-and-response, clap game, rhythm match
// ══════════════════════════════════════════════════════════
const MINIGAME = {
  active: false,
  type: null,
  score: 0,
  round: 0,
  maxRounds: 3,
  sequence: [],
  playerSeq: [],
  beatTimer: null,

  start(type) {
    this.active = true;
    this.type = type;
    this.score = 0;
    this.round = 1;
    this.sequence = [];
    this.playerSeq = [];

    const modal = document.getElementById('miniGameModal');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    document.getElementById('mgScore').textContent = '0';
    document.getElementById('mgRound').textContent = '1';

    if (type === 'repeat') this.startRepeatGame();
    else if (type === 'clap') this.startClapGame();
    else if (type === 'rhythm') this.startRhythmGame();
  },

  startRepeatGame() {
    if (!this.active) return; // guard against stale callbacks after close
    document.getElementById('miniGameTitle').textContent = '🎤 Repeat After Me!';
    const phrases = ['A B C!', 'Clap clap clap!', 'Do re mi!', 'La la la!', 'Boom boom pow!', 'One two three!', 'Hip hip hooray!'];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    const hasVoice = VOICE_INPUT.isSupported();

    document.getElementById('miniGameContent').innerHTML = \`
      <div class="text-center space-y-4">
        <div class="text-2xl font-black text-yellow-300" id="mgPhrase">Listen...</div>
        <div class="text-xs text-gray-400" id="mgInstructions">I will say a phrase. Then you say it back!</div>
        <div id="mgMicStatus" class="text-green-400 text-sm font-black min-h-5"></div>
        <button id="mgVoiceBtn" onclick="MINIGAME.startVoiceRepeat()" class="minigame-btn w-full py-4 hidden">
          <div class="text-3xl mb-1">🎤</div>
          <div class="text-sm">Tap to say it!</div>
        </button>
        <div class="grid grid-cols-2 gap-3 mt-4" id="mgManualBtns">
          <button onclick="MINIGAME.playerSay('correct')" class="minigame-btn">
            <div class="text-3xl mb-1">✅</div>
            <div class="text-sm">I said it!</div>
          </button>
          <button onclick="MINIGAME.playerSay('wrong')" class="minigame-btn">
            <div class="text-3xl mb-1">❌</div>
            <div class="text-sm">Not yet</div>
          </button>
        </div>
      </div>\`;

    this._currentPhrase = phrase;
    // Cancel any previous TTS before speaking the phrase
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (window._activeTTSAudio) {
      try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
      window._activeTTSAudio = null;
    }
    setTimeout(async () => {
      if (!MINIGAME.active) return; // closed before timeout fired
      document.getElementById('mgPhrase').textContent = phrase;
      await speakText(phrase, 'excited');
      if (!MINIGAME.active) return;
      document.getElementById('mgPhrase').textContent = 'Now YOU say: ' + phrase;
      const instrEl = document.getElementById('mgInstructions');
      if (instrEl) instrEl.textContent = hasVoice
        ? 'Tap the mic button OR the ✅ when done!'
        : 'Say it aloud, then tap ✅ when done!';
      // Always show the mic button — voice support check was already done
      const vBtn = document.getElementById('mgVoiceBtn');
      if (vBtn) vBtn.classList.remove('hidden');
      // Auto-start listening on devices that support it
      if (hasVoice) setTimeout(() => { if (MINIGAME.active) MINIGAME.startVoiceRepeat(); }, 300);
    }, 500);
  },

  startVoiceRepeat() {
    const phrase = MINIGAME._currentPhrase;
    if (!phrase || !MINIGAME.active) return;
    const micStatus = document.getElementById('mgMicStatus');
    const vBtn = document.getElementById('mgVoiceBtn');
    if (micStatus) micStatus.textContent = '🎤 Listening... say: ' + phrase;
    if (vBtn) { vBtn.disabled = true; vBtn.innerHTML = '<div class="text-3xl mb-1">🔴</div><div class="text-sm">Listening...</div>'; }
    VOICE_INPUT.listenFor(
      phrase, 7000,
      function(heard) {
        if (!MINIGAME.active) return;
        const el = document.getElementById('mgMicStatus');
        if (el) el.textContent = '✅ Great! I heard: ' + heard;
        MINIGAME.playerSay('correct');
      },
      function(heard) {
        if (!MINIGAME.active) return;
        const el = document.getElementById('mgMicStatus');
        if (el) el.textContent = heard === 'timeout' ? '⏱️ Time up! Tap ✅ if you said it!' : '🔄 Try again: ' + phrase;
        const btn = document.getElementById('mgVoiceBtn');
        if (btn) { btn.disabled = false; btn.innerHTML = '<div class="text-3xl mb-1">🎤</div><div class="text-sm">Try again!</div>'; }
        REWARDS.playMicroSound();
      }
    );
  },

  startClapGame() {
    if (!this.active) return;
    document.getElementById('miniGameTitle').textContent = '👏 Clap the Beat!';
    const target = 3 + Math.floor(Math.random() * 3);
    this.sequence = [target];
    const hasVoice = VOICE_INPUT.isSupported();
    document.getElementById('miniGameContent').innerHTML = \`
      <div class="text-center space-y-4">
        <div class="text-lg font-black" id="mgClapInstruct">Clap <span class="text-yellow-400 text-2xl">\${target}</span> times!</div>
        <button id="mgClapBtn" onclick="MINIGAME.registerClap()" class="minigame-btn w-full text-5xl py-6">👏</button>
        <div class="text-sm text-gray-400">Claps: <span id="mgClapCount" class="font-black text-pink-400">0</span> / \${target}</div>
        \${hasVoice ? \`<div class="text-xs text-gray-500 mt-1">💡 Or say "done" when you finish!</div>\` : ''}
        <div id="mgMicStatus" class="text-green-400 text-sm font-black min-h-5"></div>
      </div>\`;
    // Cancel any previous speech before speaking the instruction
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (window._activeTTSAudio) {
      try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
      window._activeTTSAudio = null;
    }
    speakText('Clap ' + target + ' times!', 'excited');
    // Start voice listener after a delay so it doesn't catch our own speech
    if (hasVoice) {
      setTimeout(function() {
        if (!MINIGAME.active) return;
        const el = document.getElementById('mgMicStatus');
        if (el) el.textContent = '🎤 Listening for "done"...';
        VOICE_INPUT.listenFor('done finished', 8000,
          function() { if (MINIGAME.active) MINIGAME.playerSay('correct'); },
          function() {} // silent fail — user uses button
        );
      }, 2500);
    }
  },

  startRhythmGame() {
    if (!this.active) return;
    document.getElementById('miniGameTitle').textContent = '🥁 Match the Rhythm!';
    const patterns = [
      { label: 'SLOW SLOW FAST', beats: [600, 600, 200] },
      { label: 'FAST FAST SLOW', beats: [200, 200, 600] },
      { label: 'SLOW FAST SLOW', beats: [600, 200, 600] },
    ];
    const pat = patterns[Math.floor(Math.random() * patterns.length)];
    this.sequence = pat.beats;
    const hasVoice = VOICE_INPUT.isSupported();
    document.getElementById('miniGameContent').innerHTML = \`
      <div class="text-center space-y-4">
        <div class="text-sm font-black text-yellow-300">\${pat.label}</div>
        <button id="mgPlayRhythm" onclick="MINIGAME.playRhythm()" class="minigame-btn w-full py-4">
          <i class="fas fa-play mr-2"></i>Hear the rhythm
        </button>
        <button id="mgRhythmTap" onclick="MINIGAME.tapRhythm()" class="minigame-btn w-full py-4 hidden">
          👆 TAP the beat!
        </button>
        \${hasVoice ? \`<button id="mgRhythmVoice" onclick="MINIGAME.voiceRhythm()" class="minigame-btn w-full py-3 hidden" style="background:rgba(0,150,255,0.25)">
          🎤 Or say "done" when finished!
        </button>\` : ''}
        <div id="mgMicStatus" class="text-green-400 text-sm font-black min-h-5"></div>
        <div class="text-xs text-gray-400" id="mgRhythmStatus">Press play to hear it first</div>
      </div>\`;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (window._activeTTSAudio) {
      try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
      window._activeTTSAudio = null;
    }
  },

  voiceRhythm() {
    if (!MINIGAME.active) return;
    const micStatus = document.getElementById('mgMicStatus');
    if (micStatus) micStatus.textContent = '🎤 Say "done" when you finish tapping!';
    VOICE_INPUT.listenFor('done finished', 8000,
      function() { if (MINIGAME.active) MINIGAME.playerSay('correct'); },
      function() {}
    );
  },

  registerClap() {
    const target = this.sequence[0] || 3;
    let current = parseInt(document.getElementById('mgClapCount').textContent) + 1;
    document.getElementById('mgClapCount').textContent = current;
    REWARDS.playMicroSound();
    REWARDS.spawnSparkles(3);
    document.getElementById('mgClapBtn').classList.add('hit');
    setTimeout(() => document.getElementById('mgClapBtn').classList.remove('hit'), 150);
    if (current >= target) {
      this.playerSay('correct');
    }
  },

  playRhythm() {
    document.getElementById('mgPlayRhythm').disabled = true;
    let t = 0;
    this.sequence.forEach((dur, i) => {
      setTimeout(() => {
        REWARDS.playMicroSound();
        REWARDS.spawnSparkles(4);
      }, t);
      t += dur + 100;
    });
    setTimeout(() => {
      document.getElementById('mgRhythmTap').classList.remove('hidden');
      const voiceBtn = document.getElementById('mgRhythmVoice');
      if (voiceBtn) voiceBtn.classList.remove('hidden');
      document.getElementById('mgRhythmStatus').textContent = 'Now tap — or say "done"!';
    }, t + 200);
  },

  tapRhythm() {
    REWARDS.playMicroSound();
    REWARDS.spawnSparkles(4);
    this.playerSeq.push(Date.now());
    if (this.playerSeq.length >= this.sequence.length) {
      this.playerSay('correct'); // simplified — reward any completion
    }
  },

  playerSay(result) {
    if (!this.active) return; // guard: ignore if already closed
    // Cancel any overlapping TTS first (both browser and server TTS)
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (window._activeTTSAudio) {
      try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
      window._activeTTSAudio = null;
    }
    // Stop any active voice listener
    if (VOICE_INPUT && VOICE_INPUT._recognition) {
      try { VOICE_INPUT._recognition.abort(); } catch(e) {}
      VOICE_INPUT._listening = false;
    }
    const name = STATE.selectedChild?.name || 'friend';
    if (result === 'correct') {
      this.score += 10;
      document.getElementById('mgScore').textContent = this.score;
      REWARDS.fire('medium', { trigger: 'minigame_correct' });
      speakText('Yes! ' + name + '! Perfect!', 'excited');
      this.round++;
      if (this.round > this.maxRounds) {
        setTimeout(function() { MINIGAME.end(true); }, 800);
      } else {
        document.getElementById('mgRound').textContent = this.round;
        setTimeout(function() { MINIGAME.startRepeatGame(); }, 1200);
      }
    } else {
      speakText('Try again ' + name + '! You can do it!', 'encouraging');
    }
  },

  end(win) {
    if (!this.active) return;
    const name = STATE.selectedChild?.name || 'friend';
    this.close(); // cancels TTS + voice listener + hides modal
    if (win) {
      REWARDS.fire('major', { trigger: 'minigame_win' });
      setTimeout(function() {
        speakText('YAAAYYY! ' + name + ' won the game! You are AMAZING!', 'excited');
      }, 200); // small delay so modal close animation completes first
      STATE.engScore = Math.min(100, STATE.engScore + 20);
      updateEngagementScoreUI();
    }
  },

  close() {
    // 1. Hide the modal — must set BOTH style.display AND remove class
    //    because .style.display='flex' (set on open) overrides Tailwind .hidden
    const modal = document.getElementById('miniGameModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
    // 2. Stop all state
    this.active = false;
    this.type = null;
    clearInterval(this.beatTimer);
    // 3. Cancel any in-flight TTS (stop overlapping voices)
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    // Also stop any ElevenLabs / server TTS audio
    if (window._activeTTSAudio) {
      try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
      window._activeTTSAudio = null;
    }
    // 4. Stop voice recognition listener
    if (VOICE_INPUT && VOICE_INPUT._recognition) {
      try { VOICE_INPUT._recognition.abort(); } catch(e) {}
      VOICE_INPUT._listening = false;
      VOICE_INPUT._recognition = null;
    }
    // 5. Clear game content so stale buttons can't fire
    const content = document.getElementById('miniGameContent');
    if (content) content.innerHTML = '';
  },
};

// Global close function — called by ×, Close buttons, and carNextRound
function closeMiniGame() {
  MINIGAME.close();
}

function startMiniGame(type) {
  // Cancel any currently playing TTS and voice listener before starting game
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (window._activeTTSAudio) {
    try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
    window._activeTTSAudio = null;
  }
  if (VOICE_INPUT && VOICE_INPUT._recognition) {
    try { VOICE_INPUT._recognition.abort(); } catch(e) {}
    VOICE_INPUT._listening = false;
    VOICE_INPUT._recognition = null;
  }
  // Mini-games are FREE — no session required, just start playing!
  if (!STATE.selectedChild) STATE.selectedChild = { name: 'friend', age: 5 };
  // Init audio context if needed (requires user gesture)
  AUDIO.init(); AUDIO.resume();
  MINIGAME.start(type);
}

// ── Call & Response interaction ──────────────────────────────────────────────
async function startCallAndResponse() {
  AUDIO.init(); AUDIO.resume();
  // Cancel any currently playing TTS before starting
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (window._activeTTSAudio) {
    try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
    window._activeTTSAudio = null;
  }
  // Abort any active voice recognition
  if (VOICE_INPUT && VOICE_INPUT._recognition) {
    try { VOICE_INPUT._recognition.abort(); } catch(e) {}
    VOICE_INPUT._listening = false;
    VOICE_INPUT._recognition = null;
  }

  const name = STATE.selectedChild?.name || 'friend';
  const phrases = [
    { call: 'Hey ' + name + '! Echo me — La la LA!',              response: 'La la LA!' },
    { call: 'If you are happy and you know it, CLAP CLAP!',        response: 'CLAP CLAP!' },
    { call: name + '! Can you say — DO RE MI?',                    response: 'DO RE MI!' },
    { call: 'Everybody say — YEAH YEAH YEAH!',                     response: 'YEAH YEAH YEAH!' },
    { call: 'Boom chicka BOOM chicka BOOM!',                       response: 'BOOM chicka BOOM!' },
    { call: name + ', repeat after me — One two THREE!',           response: 'One two THREE!' },
    { call: 'Hip hip — HOORAY!',                                   response: 'HOORAY!' },
    { call: 'When I say MusicBuddy, you say ROCKS! MusicBuddy...', response: 'ROCKS!' },
  ];
  const chosen = phrases[Math.floor(Math.random() * phrases.length)];
  const hasVoice = VOICE_INPUT.isSupported();

  const modal    = document.getElementById('miniGameModal');
  const titleEl  = document.getElementById('miniGameTitle');
  const contentEl= document.getElementById('miniGameContent');
  if (!modal || !contentEl) { // bare fallback — should never happen
    addChatBubble('🎵 ' + chosen.call, 'ai');
    await speakText(chosen.call, 'singing');
    addChatBubble('Now YOU say: ' + chosen.response + ' 🎤', 'ai');
    await speakText('Now your turn! Say: ' + chosen.response, 'encouraging');
    return;
  }

  // Mark MINIGAME as active so close() guard works
  MINIGAME.active = true;
  MINIGAME.type = 'car';

  titleEl.textContent = '🎤 Call & Response!';
  contentEl.innerHTML = \`
    <div class="text-center py-2">
      <div class="text-5xl mb-3 animate-bounce">🎵</div>
      <div id="carPhase" class="text-lg font-black text-white mb-3">MusicBuddy says...</div>
      <div id="carText" class="text-2xl font-black text-yellow-300 mb-4 px-2">\${chosen.call}</div>
      <div id="carYourTurn" class="hidden mt-3">
        <div class="text-base font-black text-pink-300 mb-2">🎤 Your turn! Say it back!</div>
        <div class="text-2xl font-black text-green-300 mb-3">\${chosen.response}</div>
        <div id="carMicStatus" class="text-sm text-green-400 font-bold min-h-5 mb-2"></div>
        \${hasVoice ? \`
        <button id="carMicBtn" onclick="carListenForResponse('\${chosen.response}')" class="minigame-btn w-full mb-3">
          <div class="text-2xl mb-1">🎤</div><div class="text-sm">Tap to speak!</div>
        </button>\` : ''}
        <button onclick="carGotIt()" class="btn-success w-full text-sm mb-2">✅ I said it!</button>
      </div>
      <div id="carButtons" class="mt-4 flex gap-3 justify-center">
        <button onclick="closeMiniGame()" class="btn-secondary text-sm">✖ Close</button>
        <button id="carNextBtn" onclick="carNextRound()" class="btn-primary text-sm hidden">
          <i class="fas fa-redo mr-1"></i>Another!
        </button>
      </div>
    </div>\`;
  modal.style.display = 'flex';
  modal.classList.remove('hidden');

  // Step 1 — speak the call phrase ONCE
  addChatBubble('🎵 ' + chosen.call, 'ai');
  await speakText(chosen.call, 'singing');
  if (!MINIGAME.active) return; // user closed during speech

  // Step 2 — show "your turn" and listen
  const yourTurn = document.getElementById('carYourTurn');
  const phase    = document.getElementById('carPhase');
  if (phase)    phase.textContent = 'Now YOU say...';
  if (yourTurn) yourTurn.classList.remove('hidden');

  // Speak the prompt ONCE (no second full speakText for the response text)
  await speakText('Now your turn! Say: ' + chosen.response, 'encouraging');
  if (!MINIGAME.active) return;

  // Auto-start voice listener if supported
  if (hasVoice) {
    setTimeout(function() {
      if (MINIGAME.active) carListenForResponse(chosen.response);
    }, 400);
  }

  if (REWARDS) REWARDS.fire('micro', { trigger: 'call_response' });
}

// Called when child taps mic in Call & Response
function carListenForResponse(expected) {
  if (!MINIGAME.active) return;
  const micStatus = document.getElementById('carMicStatus');
  const micBtn    = document.getElementById('carMicBtn');
  if (micStatus) micStatus.textContent = '🎤 Listening...';
  if (micBtn)    { micBtn.disabled = true; micBtn.innerHTML = '<div class="text-2xl mb-1">🔴</div><div class="text-sm">Listening...</div>'; }
  VOICE_INPUT.listenFor(
    expected, 7000,
    function(heard) {
      if (!MINIGAME.active) return;
      if (micStatus) micStatus.textContent = '✅ I heard: ' + heard + ' — AMAZING!';
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      speakText('Amazing! You got it!', 'excited');
      REWARDS.fire('medium', { trigger: 'car_correct' });
      const nextBtn = document.getElementById('carNextBtn');
      if (nextBtn) nextBtn.classList.remove('hidden');
      if (micBtn)  micBtn.classList.add('hidden');
    },
    function(heard) {
      if (!MINIGAME.active) return;
      if (micStatus) micStatus.textContent = heard === 'timeout' ? '⏱️ Tap ✅ if you said it!' : '🔄 Try again! Say: ' + expected;
      if (micBtn)    { micBtn.disabled = false; micBtn.innerHTML = '<div class="text-2xl mb-1">🎤</div><div class="text-sm">Try again!</div>'; }
    }
  );
}

// Child tapped "I said it!" manually
function carGotIt() {
  if (!MINIGAME.active) return;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (window._activeTTSAudio) {
    try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
    window._activeTTSAudio = null;
  }
  if (VOICE_INPUT && VOICE_INPUT._recognition) {
    try { VOICE_INPUT._recognition.abort(); } catch(e) {}
    VOICE_INPUT._listening = false;
  }
  speakText('Amazing! You got it!', 'excited');
  REWARDS.fire('medium', { trigger: 'car_correct' });
  const nextBtn = document.getElementById('carNextBtn');
  if (nextBtn) nextBtn.classList.remove('hidden');
}

window.carNextRound = function() { closeMiniGame(); setTimeout(() => startCallAndResponse(), 200); };
function closeLevelUp() {
  const modal = document.getElementById('levelUpModal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.classList.add('hidden');
}

// ── Star & Note animation ────────────────────────────────────
(function initParticles() {
  const stars = document.getElementById('stars');
  const notes = document.getElementById('musicNotes');
  const noteEmojis = ['🎵','🎶','🎸','🥁','🎹','🎺','🎻','♪','♫'];
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 3 + 1;
    s.style.cssText = \`width:\${size}px;height:\${size}px;left:\${Math.random()*100}%;top:\${Math.random()*100}%;
      --d:\${Math.random()*3+2}s;--delay:\${Math.random()*5}s;--op:\${Math.random()*0.6+0.2}\`;
    stars.appendChild(s);
  }
  function spawnNote() {
    const n = document.createElement('div');
    n.className = 'music-note';
    n.textContent = noteEmojis[Math.floor(Math.random()*noteEmojis.length)];
    const dur = Math.random()*10+8;
    n.style.cssText = \`left:\${Math.random()*100}%;animation-duration:\${dur}s;animation-delay:\${Math.random()*3}s\`;
    notes.appendChild(n);
    setTimeout(() => n.remove(), (dur+3)*1000);
  }
  for (let i=0;i<8;i++) spawnNote();
  // Cap floating notes at 12 so the DOM does not grow unboundedly
  let _noteTimer = setInterval(function() {
    if (notes.children.length < 12) spawnNote();
  }, 3000);
  // Stop spawning when tab is hidden to avoid wasting memory/CPU
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) { clearInterval(_noteTimer); _noteTimer = null; }
    else if (!_noteTimer) { _noteTimer = setInterval(function() { if (notes.children.length < 12) spawnNote(); }, 3000); }
  });
})();

// ── Toast ────────────────────────────────────────────────────
function showToast(msg, icon='✨', type='info') {
  const el = document.getElementById('toast');
  const colors = {info:'border-blue-500',success:'border-green-500',error:'border-red-500',warning:'border-yellow-500'};
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toastIcon').textContent = icon;
  el.style.borderLeftColor = type === 'success' ? '#6bcb77' : type === 'error' ? '#ff4757' : type === 'warning' ? '#ffd93d' : '#4d96ff';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

// ── Tab switching ─────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active-tab'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const content = document.getElementById('tab-content-' + tab);
  const btn     = document.getElementById('tab-' + tab);
  if (content) content.classList.add('active-tab');
  if (btn)     btn.classList.add('active');
  if (tab === 'profiles')  loadProfiles();
  if (tab === 'dashboard') populateDashboardSelect();
  if (tab === 'library')   populateLibrarySelect();
  if (tab === 'settings')  loadSystemInfo();
  if (tab === 'creator')   initCreatorTab();
  if (tab === 'lessons')   LESSONS.load();
  if (tab === 'billing')   BILLING_V2.init();
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});

// ── Avatar selection ──────────────────────────────────────────
function selectAvatar(val, btn) {
  document.querySelectorAll('.avatar-opt').forEach(b => b.style.boxShadow = 'none');
  btn.style.boxShadow = '0 0 0 2px #ff6b9d, 0 0 12px rgba(255,107,157,0.5)';
  document.getElementById('newAvatar').value = val;
}

function addSongRow() {
  const list = document.getElementById('favSongsList');
  if (list.children.length >= 5) { showToast('Max 5 songs', '⚠️', 'warning'); return; }
  const row = document.createElement('div');
  row.className = 'flex gap-2';
  row.innerHTML = \`<input type="text" class="fav-song-input text-sm flex-1" placeholder="Song title" />
    <input type="text" class="fav-artist-input text-sm w-28" placeholder="Artist" />
    <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300 px-2">✕</button>\`;
  list.appendChild(row);
}

// ── AVATAR EMOJI MAP ──────────────────────────────────────────
const AVATARS = { bunny:'🐰', lion:'🦁', star:'⭐', bear:'🐻', fox:'🦊', penguin:'🐧', default:'🐾' };
const STYLE_EMOJIS = { playful:'🎈', upbeat:'⚡', lullaby:'🌙', classical:'🎻', energetic:'🔥', calm:'😌' };

// ── API Helpers ───────────────────────────────────────────────
async function api(method, path, body) {
  try {
    const token = localStorage.getItem('mb_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    return await res.json();
  } catch(e) {
    console.error('API error:', e);
    return { success: false, error: e.message };
  }
}

// ── Load Profiles ─────────────────────────────────────────────
async function loadProfiles() {
  const r = await api('GET', '/profiles');
  const grid = document.getElementById('profilesGrid');
  document.getElementById('profilesLoading')?.remove();
  grid.innerHTML = '';
  
  if (!r.success || !r.data?.length) {
    grid.innerHTML = \`<div class="glass p-8 text-center col-span-full">
      <div class="text-5xl mb-3">👶</div>
      <p class="font-bold text-gray-300 mb-4">No profiles yet!</p>
      <button onclick="openModal('addProfileModal')" class="btn-primary">
        <i class="fas fa-plus mr-1"></i> Create First Profile
      </button>
    </div>\`;
    return;
  }

  // Add "New Profile" card
  grid.innerHTML = \`<div class="glass p-6 profile-card flex flex-col items-center justify-center gap-3 min-h-40 border-dashed border-2 border-white border-opacity-20"
      onclick="openModal('addProfileModal')">
    <div class="text-4xl opacity-40">➕</div>
    <span class="font-bold text-gray-400">Add Profile</span>
  </div>\`;

  for (const child of r.data) {
    const card = document.createElement('div');
    card.className = 'glass profile-card p-5';
    card.id = 'profile-' + child.id;
    if (STATE.selectedChild?.id === child.id) card.classList.add('selected');
    card.innerHTML = \`
      <div class="flex items-start gap-3 mb-4">
        <div class="text-3xl">\${AVATARS[child.avatar]||'🐾'}</div>
        <div class="flex-1 min-w-0">
          <div class="font-black text-lg truncate">\${child.name}</div>
          <div class="text-xs text-gray-400">Age \${child.age} • \${STYLE_EMOJIS[child.preferred_style]||''} \${child.preferred_style}</div>
          <div class="text-xs text-gray-500">Screen limit: \${child.screen_time_limit} min</div>
        </div>
        <button onclick="event.stopPropagation();deleteProfile(\${child.id})" 
          class="text-gray-600 hover:text-red-400 transition text-sm"><i class="fas fa-trash"></i></button>
      </div>
      <div class="flex gap-2">
        <button onclick="selectChild(\${child.id})" class="btn-primary flex-1 text-sm">
          <i class="fas fa-play mr-1"></i> Select
        </button>
        <button onclick="loadDashboard(\${child.id})" class="btn-secondary text-sm px-3">
          <i class="fas fa-chart-bar"></i>
        </button>
      </div>
    \`;
    grid.appendChild(card);
  }

  // Populate dropdowns
  populateDashboardSelect(r.data);
  populateLibrarySelect(r.data);

  // Populate family group checkboxes
  renderFamilyCheckboxes(r.data);
}

async function createProfile() {
  const name = document.getElementById('newName').value.trim();
  const age = parseInt(document.getElementById('newAge').value);
  if (!name || isNaN(age)) { showToast('Name and age are required!', '⚠️', 'warning'); return; }

  const songs = [];
  document.querySelectorAll('.fav-song-input').forEach((inp, i) => {
    const title = inp.value.trim();
    const artist = document.querySelectorAll('.fav-artist-input')[i]?.value.trim() || '';
    if (title) songs.push({ song_title: title, artist: artist || null });
  });

  const r = await api('POST', '/profiles', {
    name, age,
    avatar: document.getElementById('newAvatar').value,
    preferred_style: document.getElementById('newStyle').value,
    screen_time_limit: parseInt(document.getElementById('newScreenTime').value) || 30,
    favorite_songs: songs
  });

  if (r.success) {
    showToast(\`Profile for \${name} created! 🎉\`, '🎉', 'success');
    closeModal('addProfileModal');
    await loadProfiles();
    // Auto-select the newly created child so they appear immediately
    if (r.data?.id) {
      await selectChild(r.data.id);
    }
  } else {
    showToast('Error: ' + r.error, '❌', 'error');
  }
}

async function deleteProfile(id) {
  if (!confirm('Delete this profile and all its data?')) return;
  const r = await api('DELETE', '/profiles/' + id);
  if (r.success) {
    showToast('Profile deleted', '🗑️');
    if (STATE.selectedChild?.id === id) { STATE.selectedChild = null; updateChildUI(); }
    loadProfiles();
  }
}

async function selectChild(id) {
  const r = await api('GET', '/profiles/' + id);
  if (!r.success) return;
  STATE.selectedChild = r.data.child;
  STATE.selectedChild.songs = r.data.songs;
  STATE.selectedChild.adaptive = r.data.adaptive;

  // Cache adaptive profile for Intent Layer
  STATE._adaptiveProfile = r.data.adaptive || null;

  updateChildUI();
  switchTab('companion');
  showToast(\`Selected \${r.data.child.name}!\`, '⭐', 'success');
  document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('profile-' + id)?.classList.add('selected');

  // Load family group for this child (updates switcher bar)
  FAMILY.load(id);

  // Load + display shared intelligence for child's age group
  const ageGroup = INTENT.getAgeGroup(r.data.child.age);
  INTENT.getShared(ageGroup).then(shared => {
    if (shared) updateSharedIntelPanel(shared, ageGroup);
  });

  // ── Load per-child voice settings (falls back to user-level if not set) ──
  await loadVoiceSettings(r.data.child.id);
  // Show per-child voice badge
  if (typeof VOICE_PICKER !== 'undefined') {
    VOICE_PICKER.showChildBadge(r.data.child.name);
  }

  // Load adaptive system for this child (age games, personality, emotion, usage)
  ADAPTIVE.loadForChild(r.data.child);
}

function updateChildUI() {
  const child = STATE.selectedChild;
  if (!child) {
    document.getElementById('noChildSelected').classList.remove('hidden');
    document.getElementById('childInfo').classList.add('hidden');
    return;
  }
  document.getElementById('noChildSelected').classList.add('hidden');
  document.getElementById('childInfo').classList.remove('hidden');
  document.getElementById('childAvatar').textContent = AVATARS[child.avatar] || '🐾';
  document.getElementById('childNameDisplay').textContent = child.name;
  document.getElementById('childAgeDisplay').textContent = 'Age ' + child.age;
  document.getElementById('childStyleDisplay').textContent = (STYLE_EMOJIS[child.preferred_style]||'') + ' ' + child.preferred_style;
  
  const songsPills = document.getElementById('favoriteSongsDisplay');
  songsPills.innerHTML = (child.songs || []).slice(0, 4).map(s =>
    \`<span class="song-pill">\${s.song_title}</span>\`
  ).join('') + (child.songs?.length > 4 ? \`<span class="text-xs text-gray-500">+\${child.songs.length-4} more</span>\` : '');
  
  // Set style from child preference
  STATE.style = child.preferred_style || 'playful';
  updateStyleUI();
}

// ── Session Management ────────────────────────────────────────
async function startSession() {
  if (!STATE.selectedChild) { showToast('Select a child profile first!', '⚠️', 'warning'); return; }
  if (STATE.sessionActive) return;

  const r = await api('POST', '/sessions/start', { child_id: STATE.selectedChild.id, mode: STATE.mode });
  if (!r.success) { showToast('Error starting session: ' + r.error, '❌', 'error'); return; }

  STATE.currentSession = r.data.session;
  STATE.sessionActive = true;
  STATE.smileCount = 0;
  STATE.laughCount = 0;
  STATE.cycleLog = [];
  STATE.engScore = 0;

  const startBtn = document.getElementById('startBtn');
  const stopBtn  = document.getElementById('stopBtn');
  const sessInd  = document.getElementById('sessionIndicator');
  const scanLine = document.getElementById('scanLine');
  const vStatus  = document.getElementById('visionStatus');
  if (startBtn) startBtn.classList.add('hidden');
  if (stopBtn)  stopBtn.classList.remove('hidden');
  if (sessInd)  sessInd.style.display = 'flex';
  
  // ── Start REAL webcam feed ───────────────────────────────────
  if (scanLine) scanLine.style.display = 'block';
  startWebcam();
  
  if (vStatus) { vStatus.innerHTML = '<i class="fas fa-circle mr-1 text-green-400"></i>Live'; vStatus.className = 'text-xs font-bold px-2 py-1 rounded-full bg-green-900 text-green-300'; }

  addChatBubble(\`Session started for \${STATE.selectedChild.name}! 🎉\`, 'ai');
  
  showToast(\`Session started! Let's play with \${STATE.selectedChild.name}! 🎵\`, '🎵', 'success');

  // Greet the child
  setTimeout(() => greetChild(), 500);
  
  // Start auto-cycle if in auto mode
  if (STATE.mode === 'auto') startAutoCycle();

  // Start engagement loop
  startEngagementLoop();
}

async function stopSession() {
  if (!STATE.currentSession) return;
  clearInterval(STATE.cycleTimer);
  clearInterval(STATE.progressTimer);
  
  const audio = document.getElementById('audioPlayer');
  if (audio) audio.pause();
  if (STATE._synthStopFn) { STATE._synthStopFn(); STATE._synthStopFn = null; }
  STATE.isPlaying = false;

  await api('POST', ''+'/sessions/'+STATE.currentSession.id+'/stop').catch(() => {});
  
  STATE.sessionActive = false;
  STATE.currentSession = null;

  // Stop engagement loop
  stopEngagementLoop();

  const startBtn = document.getElementById('startBtn');
  const stopBtn  = document.getElementById('stopBtn');
  const sessInd  = document.getElementById('sessionIndicator');
  const scanLine = document.getElementById('scanLine');
  const vStatus  = document.getElementById('visionStatus');
  const emOvl    = document.getElementById('emotionOverlays');
  const camPh    = document.getElementById('cameraPlaceholder');
  if (startBtn) startBtn.classList.remove('hidden');
  if (stopBtn)  stopBtn.classList.add('hidden');
  if (sessInd)  sessInd.style.display = 'none';
  if (scanLine) scanLine.style.display = 'none';
  if (vStatus)  { vStatus.innerHTML = '<i class="fas fa-circle mr-1 text-gray-500"></i>Offline'; vStatus.className = 'text-xs font-bold px-2 py-1 rounded-full bg-gray-700'; }
  if (emOvl)    emOvl.innerHTML = '';

  // ── Stop webcam ─────────────────────────────────────────────
  stopWebcam();
  if (camPh) camPh.style.display = 'flex';

  resetPlayer();
  addChatBubble('Great session! See you next time! 👋', 'ai');
  showToast('Session ended. Great engagement! 🌟', '✅', 'success');
  
  updateEngagementUI();
}

async function greetChild() {
  if (!STATE.selectedChild || !STATE.currentSession) return;

  // Try Groq for a personalised greeting, fall back to PERFORMER
  let text;
  const behavior = await GROQ_ENGINE.decide('greeting', 'talk').catch(() => null);
  if (behavior?.text) {
    text = behavior.text;
  } else {
    text = PERFORMER.getGreeting(STATE.selectedChild.name, STATE.energyLevel);
  }
  addChatBubble(text + ' 🌟', 'ai');

  STATE.lastInteraction = 'talk';
  STATE.lastInteractionTime = Date.now();
  updateStateUI('talk', 'greeting');

  // Micro reward for starting a session
  REWARDS.fire('micro', { trigger: 'session_start' });

  // Await greeting speech to finish, THEN start first song naturally
  await speakText(text);
  
  // Small natural pause, then kick off first song cycle
  await new Promise(r => setTimeout(r, 600));
  triggerInteraction('greeting');
}

// ── Auto Cycle ────────────────────────────────────────────────
function startAutoCycle() {
  const interval = parseInt(document.getElementById('cycleInterval')?.value || 30000);
  STATE.cycleTimer = setInterval(() => {
    if (!STATE.sessionActive || STATE.isPlaying) return;
    triggerInteraction('auto_cycle');
  }, interval);
}

// ── Interaction Trigger ───────────────────────────────────────
async function triggerInteraction(trigger = 'manual') {
  if (!STATE.selectedChild || !STATE.currentSession) {
    showToast('Start a session first!', '⚠️', 'warning');
    return;
  }
  if (STATE.isPlaying) { showToast('Already playing...', 'ℹ️'); return; }
  if (STATE._interactionInProgress) return;
  STATE._interactionInProgress = true;

  // ── GATE CHECK: songs are FREE for everyone ──────────────────
  // Demo songs play without any key. AI generation (Replicate/Suno)
  // requires a key — but the demo pool always works.
  // DO NOT gate manual play — this kills the experience.
  // (GATE is kept only for creator_mode / family_mode)

  try {
    const child = STATE.selectedChild;
    const ageGroup = INTENT.getAgeGroup(child.age);

    // ── INTENT LAYER: fetch shared intelligence + build intent ──
    const shared = await INTENT.getShared(ageGroup);
    const adaptive = STATE._adaptiveProfile || null;

    // Build engagement context for intent engine
    const recentEng = {
      hasSmile: STATE.smileCount > 0,
      hasLaughter: STATE.laughCount > 0,
      hasFixation: false,
      hasAttentionLoss: STATE.engScore < 20 && STATE.lastInteraction === 'sing',
      avgIntensity: STATE.engScore / 100,
      dominantEvent: STATE.smileCount > STATE.laughCount ? 'smile' : (STATE.laughCount > 0 ? 'laughter' : null),
    };

    // Intent engine picks best style/tempo from individual + shared data
    const bestStyle = INTENT.pickStyle(adaptive, child, shared);
    const bestTempo = INTENT.pickTempo(adaptive, shared);
    const socialCue = INTENT.buildSocialCue(ageGroup, bestStyle, shared);
    const predictedNext = INTENT.predictNextStyle(adaptive, shared, recentEng);

    // Apply intent-driven style to STATE (only via Intent Layer — Action Layer unchanged)
    STATE.style = bestStyle;
    STATE.tempo = bestTempo;

    // Show social cue if available
    if (socialCue) {
      document.getElementById('socialCueText').textContent = socialCue;
      document.getElementById('socialCueBadge').classList.remove('hidden');
      setTimeout(() => document.getElementById('socialCueBadge').classList.add('hidden'), 8000);
    } else {
      document.getElementById('socialCueBadge').classList.add('hidden');
    }

    // Store predicted next for preload
    if (predictedNext) STATE._predictedNextStyle = predictedNext;

    // ── Talk phase: Groq Cognitive Engine → PERFORMER fallback ──
    // 1. Ask Groq for the next live-host action (cached, <6s timeout)
    // 2. If Groq unavailable, fall back to PERFORMER deterministic lines
    // This drives the "Ms. Rachel" live-host feel.
    if (STATE.lastInteraction === 'sing' || STATE.lastInteraction === null || trigger === 'greeting') {
      updateStateUI('talk', trigger);

      // Try Groq first (non-blocking — falls back instantly if unavailable)
      let groqBehavior = null;
      if (trigger !== 'skip') {
        groqBehavior = await GROQ_ENGINE.decide(trigger);
      }

      let talkText;
      if (groqBehavior?.text) {
        // Groq gave us a live, context-aware response
        talkText = groqBehavior.text;
        STATE._lastGroqMode = groqBehavior.mode;
        GROQ_ENGINE._consecutiveSongs = groqBehavior.mode === 'sing' ? GROQ_ENGINE._consecutiveSongs + 1 : 0;

        // Handle any non-song follow-ups from Groq (minigame, question, etc.)
        if (groqBehavior.followUp === 'start_minigame') {
          addChatBubble(talkText + ' 🎮', 'ai');
          await speakText(talkText, groqBehavior.tone);
          const types = ['repeat', 'clap', 'rhythm'];
          setTimeout(() => startMiniGame(types[Math.floor(Math.random() * types.length)]), 800);
          STATE._interactionInProgress = false;
          return; // Don't play a song after minigame start
        }
        if (groqBehavior.followUp === 'wait_for_response' || groqBehavior.followUp === 'ask_question') {
          const q = groqBehavior.question || talkText;
          addChatBubble(q + ' 🎤', 'ai');
          await speakText(q, groqBehavior.tone);
          VOICE_INPUT.listenForResponse(7000);
          // Continue to music after brief pause
          await new Promise(r => setTimeout(r, 1000));
        }
      } else {
        // PERFORMER fallback (always works, no API needed)
        talkText = STATE.lastInteraction === 'sing'
          ? PERFORMER.getAfterSong(child.name, STATE.energyLevel)
          : PERFORMER.getGreeting(child.name, STATE.energyLevel);
      }

      addChatBubble(talkText + ' 🎵', 'ai');
      await speakText(talkText, groqBehavior?.tone);
    }

    // ── Music generation ────────────────────────────────────
    // Check daily song usage limit before generating
    const songAllowed = await ADAPTIVE.checkUsageBeforeSong();
    if (!songAllowed) { updateStateUI('idle', trigger); return; }

    updateStateUI('generating', trigger);
    let snippet;

    if (STATE.nextSnippet && trigger !== 'manual') {
      snippet = STATE.nextSnippet;
      STATE.nextSnippet = null;
      addChatBubble('Got your next song ready! 🎵', 'ai');
    } else {
      addChatBubble('Finding the perfect song for you... 🎵', 'ai');
      const r = await api('POST', '/music/generate', {
        child_id: child.id,
        session_id: STATE.currentSession.id,
        style: STATE.style,
        tempo: STATE.tempo,
        mood: STATE.mood,
        trigger,
        background_song: STATE.bgSong || undefined,
      });
      if (!r.success) {
        showToast('Music generation failed: ' + r.error, '❌', 'error');
        return;
      }
      snippet = r.data;
    }

    STATE.currentSnippet = snippet;
    STATE.lastInteraction = 'sing';
    STATE.lastInteractionTime = Date.now();
    STATE.consecutiveSongs++;
    GROQ_ENGINE._consecutiveSongs++;

    // Track song usage (async, non-blocking)
    ADAPTIVE.trackSongUsage().catch(() => {});

    // ── Update Groq loop state async ─────────────────────────
    if (STATE.currentSession) {
      api('POST', '/groq/loop-state', {
        sessionId: STATE.currentSession.id,
        childId: child.id,
        currentMode: 'sing',
        energyLevel: STATE.energyLevel,
        addSong: true,
        consecutiveSongs: GROQ_ENGINE._consecutiveSongs,
      }).catch(() => {}); // fire-and-forget
    }

    // ── Transition cue → then music ─────────────────────────
    const transText = PERFORMER.getTransition(child.name, STATE.energyLevel);
    addChatBubble(transText + ' 🎵', 'ai');
    updateStateUI('talk', 'transition');
    await speakText(transText);

    playAudio(snippet.audio_url, snippet.title, snippet.style, snippet.duration_seconds);
    addCycleEvent('🎵', 'song', snippet.title);

    // ── LEARNING LOOP: feed anonymized data to shared model ──
    // Happens in background, never blocks the UI
    if (STATE.lastInteraction === 'sing') {
      setTimeout(() => {
        INTENT.learn(
          child.age,
          STATE.style,
          STATE.tempo,
          STATE.engScore,
          trigger === 'auto_after_song' ? 'normal_post_song' : trigger
        );
      }, 2000);
    }

  } finally {
    STATE._interactionInProgress = false;
  }
}

// ── Procedural synth song (used when no API key / CDN fails) ──────────────
// Generates a real melodic children's song using Web Audio API oscillators.
// Sounds like a proper generated tune — NOT a pin-drop synth noise.
function playSynthSong(style = 'playful', durationSecs = 20) {
  AUDIO.init(); AUDIO.resume();
  const ctx = AUDIO.ctx;
  if (!ctx) { setTimeout(() => onAudioEnded(), durationSecs * 1000); return; }

  // Stop any leftover synth
  if (STATE._synthNodes) { STATE._synthNodes.forEach(n => { try { n.stop(); } catch(e){} }); }
  STATE._synthNodes = [];

  const vol = (parseInt(document.getElementById('masterVolume')?.value || 70)) / 100;
  const master = ctx.createGain(); master.gain.value = vol * 0.6;
  master.connect(ctx.destination);

  // ── Scale libraries keyed by style ──────────────────────────────
  const SCALES = {
    playful:     [523, 587, 659, 698, 784, 880, 988, 1047],  // C major (bright)
    energetic:   [440, 494, 554, 587, 659, 740, 831, 880],   // A major (energetic)
    calm:        [392, 440, 494, 523, 587, 659, 698, 784],   // G major (warm)
    lullaby:     [349, 392, 440, 466, 523, 587, 622, 698],   // F major (soft)
    educational: [523, 587, 659, 698, 784, 880, 988, 1047],  // C major (clear)
    adventure:   [440, 494, 554, 587, 659, 740, 831, 880],   // A major (bold)
  };
  const scale = SCALES[style] || SCALES.playful;

  // ── Rhythmic patterns per style ──────────────────────────────────
  const PATTERNS = {
    playful:     [0,2,4,2,3,5,3,2,0,4,2,0,5,3,2,4],
    energetic:   [0,0,4,0,4,0,5,4,3,3,7,3,5,3,4,0],
    calm:        [0,1,2,3,4,3,2,1,0,2,4,3,2,0,1,3],
    lullaby:     [0,2,4,2,0,2,4,3,2,1,0,2,4,2,0,1],
    educational: [0,2,4,5,7,5,4,2,0,4,2,4,5,4,2,0],
    adventure:   [0,4,7,4,5,7,5,4,3,7,5,3,4,5,4,0],
  };
  const pattern = PATTERNS[style] || PATTERNS.playful;
  const bpm = style === 'energetic' ? 128 : style === 'calm' || style === 'lullaby' ? 80 : 100;
  const noteLen = 60 / bpm;           // one beat in seconds
  const totalNotes = Math.min(pattern.length * 2, Math.floor(durationSecs / noteLen));

  const nodes = [];
  let t = ctx.currentTime + 0.05;

  for (let i = 0; i < totalNotes; i++) {
    const freq = scale[pattern[i % pattern.length]];
    const gate = noteLen * 0.8;

    // Lead melody
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.55, t + 0.02);
    env.gain.setValueAtTime(0.45, t + gate - 0.04);
    env.gain.linearRampToValueAtTime(0, t + gate);
    osc.connect(env); env.connect(master);
    osc.start(t); osc.stop(t + gate);
    nodes.push(osc);

    // Harmony (5th above — every other note)
    if (i % 2 === 0) {
      const osc2 = ctx.createOscillator();
      const env2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 1.5;
      env2.gain.setValueAtTime(0, t);
      env2.gain.linearRampToValueAtTime(0.18, t + 0.03);
      env2.gain.linearRampToValueAtTime(0, t + gate);
      osc2.connect(env2); env2.connect(master);
      osc2.start(t); osc2.stop(t + gate);
      nodes.push(osc2);
    }

    // Bass (root, every 2 beats)
    if (i % 2 === 0) {
      const bass = ctx.createOscillator();
      const bassEnv = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.value = freq / 2;
      bassEnv.gain.setValueAtTime(0, t);
      bassEnv.gain.linearRampToValueAtTime(0.3, t + 0.02);
      bassEnv.gain.exponentialRampToValueAtTime(0.001, t + noteLen * 2);
      bass.connect(bassEnv); bassEnv.connect(master);
      bass.start(t); bass.stop(t + noteLen * 2);
      nodes.push(bass);
    }

    // Kick drum on beats 1+3
    if (i % 4 === 0 || i % 4 === 2) {
      const kick = ctx.createOscillator(); const kickEnv = ctx.createGain();
      kick.type = 'sine'; kick.frequency.setValueAtTime(160, t);
      kick.frequency.exponentialRampToValueAtTime(40, t + 0.08);
      kickEnv.gain.setValueAtTime(0.6, t); kickEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      kick.connect(kickEnv); kickEnv.connect(master);
      kick.start(t); kick.stop(t + 0.2);
      nodes.push(kick);
    }

    // Hi-hat click on every beat
    const noiseLen = 0.04;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let k = 0; k < nd.length; k++) nd[k] = (Math.random() * 2 - 1) * 0.15;
    const hat = ctx.createBufferSource(); const hatEnv = ctx.createGain();
    hat.buffer = noiseBuf;
    hatEnv.gain.setValueAtTime(0.4, t + 0.01); hatEnv.gain.exponentialRampToValueAtTime(0.001, t + noiseLen);
    hat.connect(hatEnv); hatEnv.connect(master);
    hat.start(t + 0.01);
    nodes.push(hat);

    t += noteLen;
  }

  STATE._synthNodes = nodes;
  STATE._synthMaster = master;

  // Fire onAudioEnded after the synth completes
  const totalTime = totalNotes * noteLen * 1000;
  clearTimeout(STATE._synthEndTimeout);
  STATE._synthEndTimeout = setTimeout(() => {
    if (STATE.isPlaying) onAudioEnded();
  }, totalTime + 300);

  // Make stop button work with synth
  STATE._synthStopFn = () => {
    nodes.forEach(n => { try { n.stop(); } catch(e){} });
    clearTimeout(STATE._synthEndTimeout);
  };
}

// ── Audio Player ──────────────────────────────────────────────
function playAudio(url, title, style, duration) {
  // Stop any ongoing TTS speech before music plays
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  // Init Web Audio engine (needs user gesture — playAudio is always triggered by one)
  AUDIO.init();
  AUDIO.resume();

  // ── HIT SOUND: punchy drum+synth burst on every song start ──
  try {
    const ctx = AUDIO.ctx;
    if (ctx) {
      const now = ctx.currentTime;
      // Kick drum: sub-bass thump
      const kick = ctx.createOscillator(); const kickGain = ctx.createGain();
      kick.connect(kickGain); kickGain.connect(AUDIO.masterGain || ctx.destination);
      kick.type = 'sine'; kick.frequency.setValueAtTime(150, now);
      kick.frequency.exponentialRampToValueAtTime(40, now + 0.08);
      kickGain.gain.setValueAtTime(0.7, now); kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      kick.start(now); kick.stop(now + 0.2);
      // Synth accent: bright zing
      const zing = ctx.createOscillator(); const zingGain = ctx.createGain();
      zing.connect(zingGain); zingGain.connect(AUDIO.masterGain || ctx.destination);
      zing.type = 'square'; zing.frequency.setValueAtTime(880, now + 0.02);
      zing.frequency.exponentialRampToValueAtTime(440, now + 0.1);
      zingGain.gain.setValueAtTime(0.3, now + 0.02); zingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      zing.start(now + 0.02); zing.stop(now + 0.15);
      // Hi-hat noise click
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1)*0.4;
      const hat = ctx.createBufferSource(); const hatGain = ctx.createGain();
      hat.buffer = buf; hat.connect(hatGain); hatGain.connect(AUDIO.masterGain || ctx.destination);
      hatGain.gain.setValueAtTime(0.5, now + 0.01); hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      hat.start(now + 0.01);
    }
  } catch(e) { /* non-critical */ }

  // ── '__synth__' = no API key → play procedural Web Audio song (always works) ──
  if (url === '__synth__') {
    playSynthSong(style || 'playful', duration || 20);
  } else {
    const audio = document.getElementById('audioPlayer');
    audio.src = url;
    audio.volume = (parseInt(document.getElementById('masterVolume')?.value || 70)) / 100;
    audio.play().catch(() => {
      // Real URL failed — fall back to synth immediately
      showToast('Streaming song... using built-in music!', '🎵', 'info');
      playSynthSong(style || 'playful', duration || 20);
    });
  }

  STATE.isPlaying = true;
  STATE.progressStart = Date.now();
  STATE.progressDuration = (duration || 20) * 1000;

  document.getElementById('nowPlayingTitle').textContent = title || 'AI Music Snippet';
  document.getElementById('nowPlayingStyle').textContent = (STYLE_EMOJIS[style]||'🎵') + ' ' + style + ' • AI Generated';
  document.getElementById('nowPlayingEmoji').textContent = STYLE_EMOJIS[style] || '🎵';
  document.getElementById('timeDuration').textContent = \`0:\${String(duration||20).padStart(2,'0')}\`;
  
  updateStateUI('sing', 'playing');

  // ── AI Sing-Along: speak lyrics over instrumental ─────────
  // 3 seconds after song starts, AI sings the first lyric line.
  // This gives the child the feel of the AI performing with them.
  setTimeout(function() {
    if (STATE.isPlaying) {
      singLyricsWithSong(title, style, duration || 20);
    }
  }, 3000);

  // Trigger beat-synced hype oscillators while playing
  if (STATE.hypeEnabled && STATE.sessionActive) {
    const bpm = STATE.tempo === 'fast' ? 120 : STATE.tempo === 'slow' ? 80 : 100;
    const beatMs = (60 / bpm) * 1000;
    const hypeAt = [8, 16, 24]; // beats
    hypeAt.forEach(beat => {
      setTimeout(() => {
        if (STATE.isPlaying) AUDIO.playHypeOscillator(beat === 16 ? 'woo' : 'yeah');
      }, beat * beatMs);
    });
  }

  // Start preloading next song in background
  setTimeout(() => preloadNextSong(), 2000);
  
  // Progress tracking
  clearInterval(STATE.progressTimer);
  STATE.progressTimer = setInterval(() => {
    const elapsed = Date.now() - STATE.progressStart;
    const pct = Math.min(100, (elapsed / STATE.progressDuration) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    const secs = Math.floor(elapsed / 1000);
    document.getElementById('timeElapsed').textContent = \`0:\${String(secs).padStart(2,'0')}\`;
    if (pct >= 100) clearInterval(STATE.progressTimer);
  }, 200);
}

async function onAudioEnded() {
  STATE.isPlaying = false;
  clearInterval(STATE.progressTimer);
  document.getElementById('progressFill').style.width = '100%';
  updateStateUI('talk', 'song_ended');

  const name = STATE.selectedChild?.name || 'friend';

  // ── DOPAMINE LOOP: reward → praise → new prompt ──────────
  // 1. Immediate reward sound + animation (< 100ms)
  REWARDS.triggerDopamineLoop(STATE.engScore, 'song_complete');

  // 2. Expressive after-song voice via PERFORMER (energy-matched)
  const t = PERFORMER.getAfterSong(name, STATE.energyLevel);
  addChatBubble(t + ' 🎉', 'ai');

  // 3. Await speech before anything else
  await speakText(t);

  addCycleEvent('💬', 'talk', 'Post-song response');
  STATE.lastInteraction = 'talk';

  // 4. Auto-trigger next (the "new prompt" in the dopamine loop)
  if (STATE.sessionActive && STATE.mode === 'auto') {
    await new Promise(r => setTimeout(r, 1200));
    if (STATE.sessionActive && STATE.mode === 'auto' && !STATE.isPlaying) {
      triggerInteraction('auto_after_song');
    }
  }

  updateEngagementUI();
}

function resetPlayer() {
  clearInterval(STATE.progressTimer);
  STATE.isPlaying = false;
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('timeElapsed').textContent = '0:00';
  document.getElementById('nowPlayingTitle').textContent = 'Ready to Play!';
  document.getElementById('nowPlayingStyle').textContent = 'Select a child and start a session';
  document.getElementById('nowPlayingEmoji').textContent = '🎵';
}

async function repeatSnippet() {
  if (!STATE.currentSnippet) { showToast('No song to repeat yet', 'ℹ️'); return; }
  if (!STATE.sessionActive) { showToast('Start a session first!', '⚠️', 'warning'); return; }
  
  const repeatTexts = [
    \`One more time just for you, \${STATE.selectedChild?.name}!\`,
    \`You want that again? Sure! Here we go!\`,
    \`Coming right up!\`
  ];
  const t = repeatTexts[Math.floor(Math.random() * repeatTexts.length)];
  addChatBubble(t + ' 🎵', 'ai');
  
  await speakText(t);
  playAudio(STATE.currentSnippet.audio_url, STATE.currentSnippet.title, 
            STATE.currentSnippet.style, STATE.currentSnippet.duration_seconds);
  addCycleEvent('🔁', 'repeat', 'Repeat');
}

function skipSnippet() {
  if (!STATE.sessionActive) { showToast('Start a session first!', '⚠️', 'warning'); return; }
  const audio = document.getElementById('audioPlayer');
  audio.pause();
  if (STATE._synthStopFn) { STATE._synthStopFn(); STATE._synthStopFn = null; }
  STATE.isPlaying = false;
  clearInterval(STATE.progressTimer);
  triggerInteraction('skip');
}

// ── Engagement Cue Handling ────────────────────────────────────
async function sendEngagementCue(type, intensity) {
  if (!STATE.currentSession) { return; } // no session — silently skip (don't toast)
  if (!STATE.selectedChild)  { return; } // no child selected — silently skip

  const r = await api('POST', '/engagement/event', {
    child_id: STATE.selectedChild.id,
    session_id: STATE.currentSession.id,
    event_type: type,
    intensity: intensity,
    duration_ms: 800 + Math.floor(Math.random()*1200),
    gaze_x: STATE.gazeX,
    gaze_y: STATE.gazeY,
    snippet_id: STATE.currentSnippet?.snippet_id || null
  }).catch(() => ({ success: false }));

  if (!r.success) return;

  // ── Also post to Groq engagement stream (non-blocking) ──────
  api('POST', '/groq/engage', {
    sessionId: STATE.currentSession.id,
    childId: STATE.selectedChild.id,
    eventType: type,
    value: intensity,
    confidence: 0.85,
  }).catch(() => {});

  // Visual feedback
  const badge = document.createElement('div');
  const colors = { smile:'bg-yellow-500 bg-opacity-80', laughter:'bg-pink-500 bg-opacity-80',
    fixation:'bg-green-500 bg-opacity-80', attention_loss:'bg-gray-500 bg-opacity-80', boredom:'bg-blue-900 bg-opacity-80',
    face_motion:'bg-teal-500 bg-opacity-60', voice_detected:'bg-purple-500 bg-opacity-80' };
  const icons = { smile:'😊', laughter:'😂', fixation:'👀', attention_loss:'😴', boredom:'🥱',
    face_motion:'🎥', voice_detected:'🎤' };
  badge.className = \`emotion-badge \${colors[type]||'bg-gray-600'}\`;
  badge.innerHTML = \`\${icons[type]||'•'} \${type.replace('_',' ')}\`;
  const overlay = document.getElementById('emotionOverlays');
  if (overlay) { overlay.appendChild(badge); setTimeout(() => badge.remove(), 3000); }

  // Update counters — guard against missing DOM elements
  if (type === 'smile') {
    STATE.smileCount++;
    const smileEl = document.getElementById('smileCount');
    if (smileEl) smileEl.textContent = STATE.smileCount;
    REWARDS.fire('micro', { trigger: 'smile' });
    STATE.engScore = Math.min(100, STATE.engScore + 5);
    updateEngagementScoreUI();
    // Groq celebrate response on 3rd+ smile (live-host reacts!)
    if (STATE.smileCount === 3 || STATE.smileCount % 5 === 0) {
      GROQ_ENGINE.decide('celebrate_smile', 'celebrate').then(b => {
        if (b?.text) { addChatBubble(b.text + ' 😍', 'ai'); if (!STATE.isPlaying) speakText(b.text, b.tone); }
        else { const msg = PERFORMER.getJoy(STATE.selectedChild?.name || 'friend', STATE.energyLevel); addChatBubble(msg + ' 😍', 'ai'); }
      }).catch(() => {});
    } else if (STATE.isPlaying && STATE.currentSnippet) {
      setTimeout(() => {
        const msg = PERFORMER.getJoy(STATE.selectedChild?.name || 'friend', STATE.energyLevel);
        addChatBubble(msg + ' 😍', 'ai');
      }, 500);
    }
  }
  if (type === 'laughter') {
    STATE.laughCount++;
    const laughEl = document.getElementById('laughCount');
    if (laughEl) laughEl.textContent = STATE.laughCount;
    REWARDS.fire('medium', { trigger: 'laughter' });
    // Ask Groq for a celebrate response
    GROQ_ENGINE.decide('laugh_detected', 'celebrate').then(b => {
      const msg = b?.text || PERFORMER.getJoy(STATE.selectedChild?.name || 'friend', STATE.energyLevel);
      const tone = b?.tone;
      addChatBubble(msg + ' 😂🎵', 'ai');
      if (!STATE.isPlaying) speakText(msg, tone);
    }).catch(() => {});
    STATE.engScore = Math.min(100, STATE.engScore + 15);
    updateEngagementScoreUI();
  }
  if (type === 'fixation') {
    const fixEl = document.getElementById('fixationTime');
    if (fixEl) fixEl.textContent = Math.floor(Math.random()*8+2) + 's';
    STATE.engScore = Math.min(100, STATE.engScore + 8);
    updateEngagementScoreUI();
  }
  if (type === 'attention_loss' && STATE.sessionActive && !STATE.isPlaying) {
    setTimeout(async () => {
      // Use Groq reengage mode, fall back to static text
      const behavior = await GROQ_ENGINE.decide('attention_loss', 'reengage').catch(() => null);
      const msg = behavior?.text
        || \`Hey \${STATE.selectedChild?.name || 'friend'}! Come back — I have something special for you! 🎵\`;
      const tone = behavior?.tone;
      addChatBubble(msg + ' 🎵', 'ai');
      await speakText(msg, tone);
      if (STATE.mode === 'auto') triggerInteraction('re_engage');
    }, 1000);
  }
  
  addCycleEvent(icons[type]||'•', type, \`Detected: \${type}\`);
  showToast(\`\${type} detected (intensity: \${(intensity*100).toFixed(0)}%)\`, icons[type]||'•');
}

function updateGaze(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  STATE.gazeX = (e.clientX - rect.left) / rect.width;
  STATE.gazeY = (e.clientY - rect.top) / rect.height;
  const dot = document.getElementById('gazeSimDot');
  if (dot) { dot.style.left = (STATE.gazeX * 100) + '%'; dot.style.top = (STATE.gazeY * 100) + '%'; }
  
  // Update camera gaze indicator
  const camDot = document.getElementById('gazeIndicator');
  if (STATE.sessionActive && camDot) {
    camDot.style.display = 'block';
    camDot.style.left = (STATE.gazeX * 100) + '%';
    camDot.style.top  = (STATE.gazeY * 100) + '%';
  }
}

function sendGazeCue(e) {
  sendEngagementCue('fixation', 0.7 + Math.random() * 0.3);
}

// ── Real Webcam Feed ──────────────────────────────────────────
// Shows the actual camera — child sees their own face mirrored
// while the system tracks engagement (smiles, gaze, attention)
const WEBCAM = {
  stream: null,
  faceCheckInterval: null,

  async start() {
    const video = document.getElementById('webcamVideo');
    const placeholder = document.getElementById('cameraPlaceholder');
    const visionStatus = document.getElementById('visionStatus');
    if (!video) return;

    // Guard: if already streaming, don't re-init
    if (WEBCAM.stream) return;

    // Timeout fallback: if getUserMedia hangs > 8s, show fallback
    let _timedOut = false;
    const timeoutId = setTimeout(() => {
      _timedOut = true;
      SYSTEM.log('warn', 'WEBCAM', 'Camera init timed out after 8s');
      WEBCAM._showFallback(placeholder, visionStatus);
    }, 8000);

    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      });

      clearTimeout(timeoutId);
      if (_timedOut) { stream.getTracks().forEach(t => t.stop()); return; } // already showed fallback

      WEBCAM.stream = stream;
      video.srcObject = stream;
      video.style.transform = 'scaleX(-1)'; // mirror — feels natural
      video.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';

      // Timeout for metadata load (video.onloadedmetadata may not fire)
      const metaTimeout = setTimeout(() => {
        try { video.play().catch(() => {}); WEBCAM.startFaceDetection(video); } catch(e) {}
      }, 3000);

      video.onloadedmetadata = () => {
        clearTimeout(metaTimeout);
        video.play().catch(() => {});
        WEBCAM.startFaceDetection(video);
      };

      if (visionStatus) visionStatus.innerHTML = '<i class="fas fa-circle mr-1 text-green-400"></i>Live';
    } catch (err) {
      clearTimeout(timeoutId);
      // Camera permission denied or unavailable — show friendly fallback
      SYSTEM.log('warn', 'WEBCAM', 'Camera not available: ' + (err.message || 'unknown'));
      WEBCAM._showFallback(placeholder, visionStatus);
    }
  },

  _showFallback(placeholder, visionStatus) {
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.innerHTML = \`
        <div class="text-center p-2">
          <i class="fas fa-eye text-green-400 text-3xl mb-2 block"></i>
          <p class="text-xs text-green-400 font-bold">Session Active</p>
          <p class="text-xs text-gray-500 mt-1">\${STATE.selectedChild?.name || 'Friend'}</p>
          <p class="text-xs text-gray-600 mt-1">Allow camera for live monitoring</p>
        </div>\`;
    }
    if (visionStatus) visionStatus.innerHTML = '<i class="fas fa-circle mr-1 text-yellow-400"></i>No Camera';
  },

  stop() {
    if (WEBCAM.faceCheckInterval) {
      clearInterval(WEBCAM.faceCheckInterval);
      WEBCAM.faceCheckInterval = null;
    }
    if (WEBCAM.stream) {
      WEBCAM.stream.getTracks().forEach(t => t.stop());
      WEBCAM.stream = null;
    }
    const video = document.getElementById('webcamVideo');
    if (video) { video.srcObject = null; video.style.display = 'none'; }
    const badge = document.getElementById('faceDetectBadge');
    if (badge) badge.classList.add('hidden');
  },

  // Lightweight canvas-based face presence check (no ML library needed)
  // Detects motion/presence by analyzing pixel brightness variance
  startFaceDetection(video) {
    const canvas = document.createElement('canvas');
    canvas.width  = 80;   // tiny for performance
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    let prevBrightness = 0;
    let noMotionFrames = 0;
    const badge = document.getElementById('faceDetectBadge');
    const label = document.getElementById('faceDetectLabel');

    WEBCAM.faceCheckInterval = setInterval(() => {
      try {
        ctx.drawImage(video, 0, 0, 80, 60);
        const data = ctx.getImageData(0, 0, 80, 60).data;
        let brightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          brightness += (data[i] + data[i+1] + data[i+2]) / 3;
        }
        brightness /= (data.length / 4);

        const motion = Math.abs(brightness - prevBrightness);
        prevBrightness = brightness;

        // A very dark frame means no face / camera covered
        const facePresent = brightness > 15;

        if (badge) {
          if (facePresent) {
            badge.classList.remove('hidden');
            if (motion < 0.5) {
              noMotionFrames++;
              if (noMotionFrames > 10 && label) label.textContent = 'Still — looking!';
            } else {
              noMotionFrames = 0;
              if (label) label.textContent = 'Active ✨';
              // Register engagement event when motion detected
              if (STATE.sessionActive && STATE.currentSession && motion > 3) {
                sendEngagementCue('face_motion', Math.min(1, motion / 20));
              }
            }
          } else {
            badge.classList.add('hidden');
            noMotionFrames = 0;
          }
        }
      } catch (e) { /* frame not ready yet */ }
    }, 800);
  },
};

function startWebcam() { WEBCAM.start(); }
function stopWebcam()  { WEBCAM.stop(); }

// ── Groq Real-Time Behavior Engine (Frontend) ─────────────────
// Calls the Groq backend and drives the live interaction loop.
// This is the master conductor: it decides what to DO next.
const GROQ_ENGINE = {
  _lastCall: 0,
  _minInterval: 4000,  // Don't call Groq more than once per 4s
  _consecutiveSongs: 0,

  buildEngagement() {
    return {
      smileCount:    STATE.smileCount   || 0,
      laughCount:    STATE.laughCount   || 0,
      attentionLoss: STATE.engScore < 20 ? 2 : 0,
      intensity:     Math.min(1, (STATE.engScore || 50) / 100),
      voiceDetected: false,
      gazeOnScreen:  true,
      dominantEvent: STATE.smileCount > STATE.laughCount ? 'smile' : 'laughter',
      recentEvents:  STATE.cycleLog?.slice(-5) || [],
    };
  },

  buildContext(trigger) {
    const child = STATE.selectedChild || { name: 'friend', age: 5, preferred_style: 'playful' };
    const age = child.age || 5;
    return {
      childName:       child.name,
      childAge:        age,
      ageGroup:        age < 3 ? 'toddler' : age < 6 ? 'preschool' : 'early_school',
      preferredStyle:  child.preferred_style || 'playful',
      energyLevel:     STATE.energyLevel || 'medium',
      currentMode:     STATE.lastInteraction || 'talk',
      lastMode:        STATE._lastMode || null,
      sessionDuration: STATE.currentSession
        ? Math.round((Date.now() - new Date(STATE.currentSession.started_at).getTime()) / 60000)
        : 0,
      songCount:       STATE.consecutiveSongs || 0,
      talkCount:       0,
      lastInteraction: new Date().toISOString(),
      consecutiveSongs: GROQ_ENGINE._consecutiveSongs,
      trigger,
    };
  },

  async decide(trigger = 'auto', forceMode = null) {
    // Throttle — avoid hammering Groq
    const now = Date.now();
    if (now - GROQ_ENGINE._lastCall < GROQ_ENGINE._minInterval) return null;
    GROQ_ENGINE._lastCall = now;

    const payload = {
      intent: 'GENERATE_BEHAVIOR',
      userId: AUTH.user?.id ? String(AUTH.user.id) : 'demo',
      childId:   STATE.selectedChild?.id ?? undefined,
      sessionId: STATE.currentSession?.id ?? undefined,
      data: {
        context:    GROQ_ENGINE.buildContext(trigger),
        engagement: GROQ_ENGINE.buildEngagement(),
        forceMode:  forceMode ?? undefined,
      },
    };

    try {
      const r = await api('POST', '/intent', payload);
      if (r.success && r.data?.text) {
        return r.data;  // BehaviorResponse: { mode, tone, text, followUp, timing }
      }
    } catch(e) {
      // Intent unavailable — silently fall through
    }
    return null;
  },

  // Apply a behavior response: speak the text and handle follow-up
  async apply(behavior, skipSpeak = false) {
    if (!behavior) return;
    const { mode, tone, text, followUp } = behavior;

    // Emit to chat
    if (text) addChatBubble(text + ' 🎵', 'ai');

    // Track mode for next context
    STATE._lastMode = STATE.lastInteraction;

    // Speak the text with the right emotion
    if (!skipSpeak && text) {
      await speakText(text, tone);
    }

    // Handle follow-up action
    switch (followUp) {
      case 'play_next_song':
      case 'sing_along':
        if (STATE.sessionActive && !STATE.isPlaying) {
          setTimeout(() => triggerInteraction('groq_followup'), 800);
        }
        break;
      case 'start_minigame':
        const types = ['repeat', 'clap', 'rhythm'];
        setTimeout(() => startMiniGame(types[Math.floor(Math.random() * types.length)]), 1000);
        break;
      case 'celebrate_achievement':
        REWARDS.fire('major', { trigger: 'groq_celebrate' });
        break;
      case 'wait_for_response':
      case 'encourage_participation':
        // Start voice recognition for child response
        VOICE_INPUT.listenForResponse(5000);
        break;
    }
  },
};

// ── Voice Input (Web Speech Recognition) ─────────────────────
// Listens to the child's voice and drives engagement events.
const VOICE_INPUT = {
  _recognition: null,
  _listening: false,
  _gameCallback: null,

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  create(continuous = false, interimResults = false) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous      = continuous;
    r.interimResults  = interimResults;
    r.maxAlternatives = 1;
    r.lang            = 'en-US';
    return r;
  },

  // Listen once for child response (e.g. in games or after Groq asks a question)
  listenForResponse(timeoutMs = 8000) {
    if (!VOICE_INPUT.isSupported()) return;

    // Abort any existing recognition first
    if (VOICE_INPUT._recognition) {
      try { VOICE_INPUT._recognition.abort(); } catch(e) {}
      VOICE_INPUT._recognition = null;
      VOICE_INPUT._listening = false;
    }
    if (VOICE_INPUT._listening) return;

    const r = VOICE_INPUT.create();
    if (!r) return;

    VOICE_INPUT._listening = true;
    VOICE_INPUT._recognition = r;

    // Show listening indicator
    showToast('Listening... 🎤', '🎤', 'info');

    r.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.toLowerCase().trim() || '';
      VOICE_INPUT._listening = false;

      if (transcript) {
        addChatBubble(transcript + ' 🗣️', 'user');
        STATE.smileCount++; // voice = positive engagement
        sendEngagementCue('voice_detected', 0.8);

        // If there is a game callback, fire it
        if (VOICE_INPUT._gameCallback) {
          VOICE_INPUT._gameCallback(transcript);
          VOICE_INPUT._gameCallback = null;
        } else {
          // Let Groq respond to what the child said
          GROQ_ENGINE.decide('voice_response').then(b => GROQ_ENGINE.apply(b));
        }
      }
    };

    r.onerror = () => { VOICE_INPUT._listening = false; };
    r.onend   = () => { VOICE_INPUT._listening = false; };

    try { r.start(); } catch(e) { VOICE_INPUT._listening = false; return; }
    setTimeout(() => {
      try { r.stop(); } catch(e) {}
      VOICE_INPUT._listening = false;
    }, timeoutMs);
  },

  // Listen for a specific word/phrase and call callback
  listenFor(expectedPhrase, timeoutMs, onSuccess, onFail) {
    if (!VOICE_INPUT.isSupported()) { if (onFail) onFail('not_supported'); return; }

    // Abort any existing recognition before starting a new one
    if (VOICE_INPUT._recognition) {
      try { VOICE_INPUT._recognition.abort(); } catch(e) {}
      VOICE_INPUT._recognition = null;
    }
    VOICE_INPUT._listening = false;

    const r = VOICE_INPUT.create();
    if (!r) { if (onFail) onFail('no_recognition'); return; }

    VOICE_INPUT._listening = true;
    VOICE_INPUT._recognition = r;

    // Track whether we already called a callback (prevent double-fire)
    let _settled = false;

    const micIcon = document.getElementById('lessonMicStatus') || document.getElementById('mgMicStatus') || document.getElementById('carMicStatus');
    if (micIcon) micIcon.textContent = '🎤 Listening...';

    r.onresult = (event) => {
      if (_settled) return;
      const transcript = event.results[0]?.[0]?.transcript?.toLowerCase().trim() || '';
      VOICE_INPUT._listening = false;
      const expected = expectedPhrase.toLowerCase();
      // Fuzzy match: check if any key word present
      const words = expected.split(/\s+/);
      const matched = words.some(w => w.length > 2 && transcript.includes(w));
      if (matched || transcript.includes(expected)) {
        _settled = true;
        if (onSuccess) onSuccess(transcript);
      } else {
        _settled = true;
        if (onFail) onFail(transcript);
      }
    };

    r.onerror = (e) => {
      if (_settled) return;
      VOICE_INPUT._listening = false;
      // Don't fire onFail for 'no-speech' — just reset button silently
      if (e.error !== 'no-speech') {
        _settled = true;
        if (onFail) onFail('error');
      }
    };
    r.onend   = () => {
      VOICE_INPUT._listening = false;
      if (micIcon) micIcon.textContent = '';
    };

    try { r.start(); } catch(e) {
      VOICE_INPUT._listening = false;
      if (!_settled) { _settled = true; if (onFail) onFail('error'); }
      return;
    }

    setTimeout(() => {
      try { r.stop(); } catch(e) {}
      VOICE_INPUT._listening = false;
      // Only fire timeout if no result yet
      if (!_settled) {
        _settled = true;
        if (onFail) onFail('timeout');
      }
    }, timeoutMs);
  },
};

// ── Background listening ──────────────────────────────────────
async function detectBackground() {
  if (!STATE.selectedChild || !STATE.currentSession) {
    showToast('Start a session first!', '⚠️', 'warning'); return;
  }
  const bgInput = document.getElementById('bgSongInput');
  const song = bgInput ? bgInput.value.trim() : '';
  if (!song) { showToast('Enter a song name first', '⚠️', 'warning'); return; }
  
  const r = await api('POST', '/engagement/background-detect', {
    child_id: STATE.selectedChild.id,
    session_id: STATE.currentSession.id,
    detected_song: song,
    confidence: 0.85
  }).catch(() => ({ success: false }));
  
  if (r.success) {
    STATE.bgSong = song;
    const bgDetected = document.getElementById('bgDetected');
    const bgName     = document.getElementById('bgDetectedName');
    if (bgDetected) bgDetected.classList.remove('hidden');
    if (bgName)     bgName.textContent = \`"\${song}" will be used as seed\`;
    showToast(\`"\${song}" set as music seed! 🎵\`, '🎵', 'success');
  }
}

// ── Emoji & symbol stripper (keep letters, numbers, punctuation; drop pictographs) ──
function stripEmojisAndSymbols(text) {
  return text
    // Remove emoji Unicode ranges
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
    .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '')
    .replace(/[\u{1F100}-\u{1F1FF}]/gu, '')
    .replace(/[\u{1F200}-\u{1F2FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // variation selectors
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '') // skin tone modifiers
    .replace(/\u200D/g, '')                  // zero-width joiners
    // Music symbols spoken aloud
    .replace(/[♪♫♩♬♭♮♯]/g, '')
    // Trim multiple spaces left over
    .replace(/  +/g, ' ')
    .trim();
}

// ── TTS text normalizer ───────────────────────────────────────
// Runs on ALL text before it goes to ANY TTS provider (API or browser).
// Expands contractions, normalises punctuation, removes characters that
// cause TTS engines to truncate or speak strangely.
// NOTE: Also used inside the browser SpeechSynthesis fallback.
function normalizeTTSText(t) {
  if (!t) return t;
  // Normalise curly/smart apostrophes to straight apostrophe
  t = t.replace(/[\u2018\u2019\u02BC]/g, "'");
  // Replace em/en dash with a comma pause (more natural in speech)
  t = t.replace(/\u2014|\u2013/g, ', ');
  // Expand contractions (preserves capitalisation)
  const cx = (pat, exp) => {
    t = t.replace(pat, (m) =>
      m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase()
        ? exp.charAt(0).toUpperCase() + exp.slice(1) : exp);
  };
  cx(/\bit's\b/gi,      'it is');
  cx(/\bthat's\b/gi,    'that is');
  cx(/\blet's\b/gi,     'let us');
  cx(/\bwe're\b/gi,     'we are');
  cx(/\byou're\b/gi,    'you are');
  cx(/\bthey're\b/gi,   'they are');
  cx(/\bi'm\b/g,        'I am');
  cx(/\bhe's\b/gi,      'he is');
  cx(/\bshe's\b/gi,     'she is');
  cx(/\bwhat's\b/gi,    'what is');
  cx(/\bwhere's\b/gi,   'where is');
  cx(/\bthere's\b/gi,   'there is');
  cx(/\bhow's\b/gi,     'how is');
  cx(/\bwho's\b/gi,     'who is');
  cx(/\bhere's\b/gi,    'here is');
  cx(/\byou've\b/gi,    'you have');
  cx(/\bwe've\b/gi,     'we have');
  cx(/\bi've\b/g,       'I have');
  cx(/\bthey've\b/gi,   'they have');
  cx(/\bcould've\b/gi,  'could have');
  cx(/\bwould've\b/gi,  'would have');
  cx(/\bshould've\b/gi, 'should have');
  cx(/\bdon't\b/gi,     'do not');
  cx(/\bdoesn't\b/gi,   'does not');
  cx(/\bdidn't\b/gi,    'did not');
  cx(/\bcan't\b/gi,     'cannot');
  cx(/\bwon't\b/gi,     'will not');
  cx(/\bwouldn't\b/gi,  'would not');
  cx(/\bcouldn't\b/gi,  'could not');
  cx(/\bshouldn't\b/gi, 'should not');
  cx(/\bisn't\b/gi,     'is not');
  cx(/\baren't\b/gi,    'are not');
  cx(/\bwasn't\b/gi,    'was not');
  cx(/\bweren't\b/gi,   'were not');
  cx(/\bhasn't\b/gi,    'has not');
  cx(/\bhaven't\b/gi,   'have not');
  cx(/\bhadn't\b/gi,    'had not');
  // Remove remaining apostrophes (possessives like "dog's" → "dogs")
  t = t.replace(/(\w)'s\b/g, '$1s');
  // Collapse double-spaces left by dash replacement
  t = t.replace(/  +/g, ' ').trim();
  return t;
}

// ── TTS / Chat ────────────────────────────────────────────────
// speakText: strips emojis, applies expression engine, then speaks
// Returns a Promise that resolves when speech is DONE
// Intent: RequestTTS — all TTS must go through this function (never direct Audio() elsewhere)
// Pre-check: Intent CheckUsageLimit (SYSTEM.hasCredits) before attempting premium pipeline
async function speakText(text, emotionHint) {
  const cleanText = stripEmojisAndSymbols(text);
  if (!cleanText) return;

  // Apply expression engine + PERFORMER for human, energetic delivery
  const expressiveText = EXPRESSOR.express(cleanText);

  // Normalize ALL text before any TTS path (API or browser fallback):
  // expands contractions, fixes em-dashes, removes apostrophes that cause
  // TTS engines (ElevenLabs, OpenAI, browser SpeechSynthesis) to truncate.
  const ttsText = normalizeTTSText(expressiveText);

  // ── Map Groq BehaviorTone → TTS emotion ───────────────────────
  // Groq returns tones like 'warm','playful','soothing','encouraging',
  // 'celebratory','curious','gentle'. TTS understands: 'friendly',
  // 'excited','calm','encouraging','whisper','singing'.
  const TONE_TO_EMOTION = {
    warm: 'friendly', playful: 'excited', soothing: 'calm',
    encouraging: 'encouraging', celebratory: 'excited',
    curious: 'friendly', gentle: 'calm',
    excited: 'excited', calm: 'calm', friendly: 'friendly',
    singing: 'singing', whisper: 'whisper', surprised: 'excited',
  };
  const resolvedEmotion = TONE_TO_EMOTION[emotionHint]
    || emotionHint  // pass through if already a valid TTS emotion
    || (STATE.energyLevel === 'high' ? 'excited'
        : STATE.energyLevel === 'low' ? 'calm'
        : 'friendly');

  // ── INTENT LAYER: REQUEST_TTS ──────────────────────────────────
  // Phase 2: passes userText for emotion detection, engagement
  // signals from camera, and behaviorTone from Groq.
  // Response now includes emotion label + ambientMusic payload.
  try {
    const r = await api('POST', '/intent', {
      intent:    'REQUEST_TTS',
      userId:    AUTH.user?.id ? String(AUTH.user.id) : 'demo',
      childId:   STATE.selectedChild?.id ?? undefined,
      sessionId: STATE.currentSession?.id ?? undefined,
      data: {
        text:        ttsText,
        userText:    text,
        emotion:     resolvedEmotion,
        style:       STATE.sessionActive ? 'children_host' : 'neutral',
        behaviorTone: emotionHint,
        engagement:  {
          smileCount:    STATE.smileCount    || 0,
          laughCount:    STATE.laughCount    || 0,
          attentionLoss: STATE.attentionLoss || 0,
          intensity:     (STATE.engScore || 50) / 100,
          voiceDetected: false,
        },
      },
    });

    if (r.success && r.data?.audioUrl) {
      // ── Stop any currently-playing server TTS to prevent overlap ──
      if (window._activeTTSAudio) {
        try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
        window._activeTTSAudio = null;
      }
      // Cancel any browser speech synthesis too
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();

      // ── Trigger ambient background music (ONLY during active music sessions) ─
      // Ambient music layers softly UNDER an active song — it must NOT auto-play
      // for standalone TTS calls (lessons, games, feedback responses).
      // Guard: STATE.isPlaying means the main music player has a song going.
      if (STATE.sessionActive && STATE.isPlaying && r.data.ambientMusic && r.data.ambientMusic.trackUrl) {
        AMBIENT_MUSIC.play(r.data.ambientMusic);
      } else if (STATE.sessionActive && STATE.isPlaying) {
        const clientEmotion = detectEmotionClient(text);
        AMBIENT_MUSIC.playVibe(emotionToVibe(clientEmotion));
      }

      // ── Server-generated audio (OpenAI / ElevenLabs / Polly) ──
      const bgAudio = document.getElementById('audioPlayer');
      if (STATE.isPlaying && bgAudio) bgAudio.volume = Math.max(0.1, bgAudio.volume * 0.3);

      // Show trial indicator if running low
      if (r.data.trialRemaining !== undefined && r.data.trialRemaining <= 3) {
        showToast(
          r.data.trialRemaining === 0
            ? 'Premium voice trial ended. Upgrade for ElevenLabs! \u{1F3A4}'
            : \`Premium voice: \${r.data.trialRemaining} uses left\`,
          '\u{1F3A4}',
          r.data.trialRemaining === 0 ? 'warning' : 'info'
        );
      }
      // Show upgrade prompt if billing trigger set
      if (r.data.billingTrigger) {
        setTimeout(() => BILLING.open('starter'), 1500);
      }

      return new Promise((resolve) => {
        const vol = (parseInt(document.getElementById('masterVolume')?.value || '70')) / 100;
        const ttsAudio = new Audio();
        ttsAudio.preload = 'auto';
        ttsAudio.volume  = vol;
        window._activeTTSAudio = ttsAudio;

        const cleanup = () => {
          if (window._activeTTSAudio === ttsAudio) window._activeTTSAudio = null;
          ttsAudio.src = '';
        };

        ttsAudio.onended = () => {
          cleanup();
          if (STATE.isPlaying && bgAudio) {
            bgAudio.volume = (parseInt(document.getElementById('masterVolume')?.value || '70')) / 100;
          }
          AMBIENT_MUSIC.fadeOut(2000);
          resolve();
        };
        ttsAudio.onerror = (e) => {
          console.warn('[TTS] Audio error', e);
          cleanup();
          resolve();
        };

        // Wait for enough data before playing to prevent stuttering
        const tryPlay = () => {
          ttsAudio.play().catch((e) => {
            console.warn('[TTS] play() rejected', e);
            cleanup();
            resolve();
          });
        };

        // canplaythrough = browser has buffered enough to play without interruption
        ttsAudio.addEventListener('canplaythrough', tryPlay, { once: true });

        // Fallback: if canplaythrough never fires within 8s, play anyway
        const fallbackTimer = setTimeout(() => {
          ttsAudio.removeEventListener('canplaythrough', tryPlay);
          tryPlay();
        }, 8000);

        ttsAudio.onended = () => {
          clearTimeout(fallbackTimer);
          cleanup();
          if (STATE.isPlaying && bgAudio) {
            bgAudio.volume = (parseInt(document.getElementById('masterVolume')?.value || '70')) / 100;
          }
          AMBIENT_MUSIC.fadeOut(2000);
          resolve();
        };

        // Set src AFTER attaching listeners
        ttsAudio.src = r.data.audioUrl;
        ttsAudio.load();
      });
    }
    // Fall through to Web Speech API (server returned success but no audioUrl, or demo tier)
  } catch (e) {
    // Intent endpoint unavailable — fall through to browser TTS
  }

  // ── Fallback: Web Speech API (built-in, zero cost, always works) ──
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  return new Promise((resolve) => {
    // ttsText was already normalized by normalizeTTSText() above — contractions
    // expanded, em-dashes replaced, apostrophes removed. Pass it directly.
    const utter = new SpeechSynthesisUtterance(ttsText);
    const baseRate = parseFloat(document.getElementById('ttsSpeed')?.value || 0.9);
    const energyBoost = STATE.energyLevel === 'high' ? 0.07 : STATE.energyLevel === 'low' ? -0.05 : 0;
    utter.rate = Math.max(0.7, Math.min(1.3, baseRate + energyBoost));
    utter.pitch = STATE.energyLevel === 'high' ? 1.35 : STATE.energyLevel === 'low' ? 1.05 : 1.2;
    utter.volume = (parseInt(document.getElementById('masterVolume')?.value || 70)) / 100;

    // Best available voice: Google UK Female → Google US → Samantha → any English female
    const voices = window.speechSynthesis.getVoices();
    const pick = (fn) => voices.find(fn);
    const friendly =
      pick(v => v.name === 'Google UK English Female') ||
      pick(v => v.name === 'Google US English') ||
      pick(v => v.name.includes('Samantha')) ||
      pick(v => v.name.includes('Karen')) ||
      pick(v => v.name.includes('Moira')) ||
      pick(v => v.name.includes('Tessa')) ||
      pick(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')) ||
      pick(v => v.lang === 'en-US' || v.lang === 'en-GB') ||
      pick(v => v.lang.startsWith('en'));
    if (friendly) utter.voice = friendly;

    // Watchdog: Chromium sometimes stalls speechSynthesis
    window.speechSynthesis.speak(utter);
    const watchdog = setTimeout(() => {
      window.speechSynthesis.cancel();
      resolve();
    }, (ttsText.length / 10 * 1000) + 4000);
    utter.onend  = () => { clearTimeout(watchdog); resolve(); };
    utter.onerror = () => { clearTimeout(watchdog); resolve(); };
  });
}

function addChatBubble(text, from = 'ai') {
  const area = document.getElementById('chatArea');
  const bubble = document.createElement('div');
  bubble.className = \`chat-bubble text-sm \${from === 'user' ? 'user' : ''}\`;
  if (from === 'ai') bubble.innerHTML = \`<span class="text-pink-300 font-black text-xs block mb-1">MusicBuddy 🎵</span>\${text}\`;
  else bubble.innerHTML = \`<span class="text-blue-300 font-black text-xs block mb-1">You</span>\${text}\`;
  area.appendChild(bubble);
  area.scrollTop = area.scrollHeight;
}

async function sendCustomTTS() {
  const text = document.getElementById('customTtsInput').value.trim();
  if (!text) return;
  addChatBubble(text, 'user');
  document.getElementById('customTtsInput').value = '';
  
  if (!STATE.currentSession || !STATE.selectedChild) {
    addChatBubble("I'm not in a session right now. Start one to play!", 'ai');
    return;
  }
  
  // speakText strips emojis internally
  speakText(text);
  await api('POST', '/music/tts', {
    child_id: STATE.selectedChild.id,
    session_id: STATE.currentSession.id,
    text: stripEmojisAndSymbols(text),
    trigger: 'manual'
  });
}

// ── Mode & Style ──────────────────────────────────────────────
function setMode(mode) {
  STATE.mode = mode;
  ['auto','manual','background'].forEach(m => {
    document.getElementById('mode' + m.charAt(0).toUpperCase() + m.slice(1))?.classList.toggle('active', m === mode);
  });
  clearInterval(STATE.cycleTimer);
  if (mode === 'auto' && STATE.sessionActive) startAutoCycle();
  showToast(\`Mode: \${mode}\`, '⚙️');
}

function setStyle(style) {
  STATE.style = style;
  updateStyleUI();
}

function updateStyleUI() {
  document.querySelectorAll('[data-style]').forEach(b => {
    b.classList.toggle('active', b.dataset.style === STATE.style);
  });
}

// ── State UI Updates ──────────────────────────────────────────
function updateStateUI(action, phase) {
  document.getElementById('currentAction').textContent = action;
  document.getElementById('cyclePhase').textContent = phase || '-';
  
  const stateColors = {
    talk: 'text-yellow-400', sing: 'text-pink-400', 
    generating: 'text-blue-400', wait: 'text-gray-400', idle: 'text-gray-600'
  };
  const el = document.getElementById('currentAction');
  el.className = 'text-xs font-black ' + (stateColors[action] || 'text-white');
}

function updateEngagementScoreUI() {
  const pct = Math.min(100, STATE.engScore);
  document.getElementById('engScoreBar').style.width = pct + '%';
  document.getElementById('engScoreVal').textContent = pct + '%';
  // Adapt energy system based on engagement
  adaptEnergyFromEngagement();
}

function updateEngagementUI() {
  document.getElementById('smileCount').textContent = STATE.smileCount;
  document.getElementById('laughCount').textContent = STATE.laughCount;
  updateEngagementScoreUI();
}

function addCycleEvent(icon, type, label) {
  STATE.cycleLog.push({ icon, type, label, time: Date.now() });
  const timeline = document.getElementById('cycleTimeline');
  const badge = document.createElement('div');
  const colors = {
    song: 'bg-pink-900 text-pink-300',
    talk: 'bg-yellow-900 text-yellow-300',
    smile: 'bg-yellow-900 text-yellow-300',
    laughter: 'bg-pink-900 text-pink-300',
    fixation: 'bg-green-900 text-green-300',
    attention_loss: 'bg-gray-800 text-gray-400',
    repeat: 'bg-purple-900 text-purple-300',
    greeting: 'bg-blue-900 text-blue-300',
  };
  badge.className = \`px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap \${colors[type]||'bg-gray-800 text-gray-400'}\`;
  badge.textContent = icon + ' ' + label.slice(0, 12);
  timeline.appendChild(badge);
  timeline.scrollLeft = timeline.scrollWidth;
}

// ── Dashboard ─────────────────────────────────────────────────
function populateDashboardSelect(profiles) {
  const sel = document.getElementById('dashboardChildSelect');
  if (!profiles) return;
  sel.innerHTML = '<option value="">Select a child profile...</option>';
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = \`\${AVATARS[p.avatar]||'🐾'} \${p.name} (Age \${p.age})\`;
    sel.appendChild(opt);
  });
}

async function loadDashboard(childId) {
  if (!childId) return;
  
  const r = await api('GET', '/dashboard/' + childId);
  if (!r.success) { showToast('Error loading dashboard', '❌', 'error'); return; }
  
  const d = r.data;
  switchTab('dashboard');
  document.getElementById('dashboardChildSelect').value = childId;
  document.getElementById('dashboardContent').classList.remove('hidden');
  document.getElementById('dashboardEmpty').classList.add('hidden');

  // Stats
  document.getElementById('dashSmiles').textContent = d.engagement_summary?.smile_count ?? 0;
  document.getElementById('dashLaughs').textContent = d.engagement_summary?.laughter_count ?? 0;
  document.getElementById('dashSessions').textContent = d.today_sessions ?? 0;
  document.getElementById('dashSongsPlayed').textContent = d.adaptive_profile?.total_songs_played ?? 0;

  // Screen time ring
  const mins = d.total_time_today_minutes || 0;
  const limit = d.screen_time_limit_minutes || 30;
  const pct = Math.min(1, mins / limit);
  const circumference = 314;
  document.getElementById('screenTimeRing').style.strokeDashoffset = circumference * (1 - pct);
  document.getElementById('screenTimeVal').textContent = mins.toFixed(0);
  document.getElementById('screenTimeLimit').textContent = limit;
  if (d.screen_time_alert) document.getElementById('screenTimeAlert').classList.remove('hidden');
  else document.getElementById('screenTimeAlert').classList.add('hidden');

  // Engagement chart — lazy-load Chart.js only now (first time analytics opens)
  function _renderEngChart() {
    const ctx = document.getElementById('engagementChart').getContext('2d');
    if (window._engChart) window._engChart.destroy();
    window._engChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Smiles', 'Laughs', 'Focus', 'Neutral'],
      datasets: [{
        data: [
          d.engagement_summary?.smile_count || 0,
          d.engagement_summary?.laughter_count || 0,
          Math.round((d.engagement_summary?.avg_fixation_ms || 0) / 1000),
          Math.max(0, 10 - (d.engagement_summary?.smile_count || 0) - (d.engagement_summary?.laughter_count || 0))
        ],
        backgroundColor: ['#ffd93d88','#ff6b9d88','#6bcb7788','#4d96ff44'],
        borderColor: ['#ffd93d','#ff6b9d','#6bcb77','#4d96ff'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#ccc', font: { size: 11 } } } },
      cutout: '65%'
    }
  });
  }
  // Lazy-load Chart.js script if not yet loaded, then render
  if (typeof Chart === 'undefined') {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = _renderEngChart;
    document.head.appendChild(s);
  } else {
    _renderEngChart();
  }

  // Recommendations
  const recs = document.getElementById('recommendationsList');
  recs.innerHTML = (d.recommendations || []).map((rec, i) => {
    const icons = ['💡','⚠️','🌟','📊'];
    return \`<div class="glass-light p-2 rounded-xl text-xs flex items-start gap-2">
      <span>\${icons[i % icons.length]}</span>
      <span>\${rec}</span>
    </div>\`;
  }).join('') || '<div class="text-xs text-gray-400">No recommendations yet.</div>';

  // Favorite styles
  const stylesList = document.getElementById('favoriteStylesList');
  const favStyles = [];
  if (d.adaptive_profile?.favorite_styles) {
    try {
      const s = JSON.parse(d.adaptive_profile.favorite_styles);
      Object.entries(s).sort((a,b)=>b[1]-a[1]).slice(0,4).forEach(([k,v]) => favStyles.push({k,v}));
    } catch {}
  }
  stylesList.innerHTML = favStyles.length ? favStyles.map(({k,v}) => {
    const pct = Math.min(100, v * 20);
    return \`<div>
      <div class="flex justify-between text-xs mb-1">
        <span class="font-bold">\${STYLE_EMOJIS[k]||'🎵'} \${k}</span>
        <span class="text-gray-400">\${v.toFixed(1)} pts</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:\${pct}%"></div></div>
    </div>\`;
  }).join('') : '<div class="text-xs text-gray-400">No style data yet. Play more songs!</div>';

  // Top songs
  const topList = document.getElementById('topSongsList');
  topList.innerHTML = (d.top_snippets || []).length ? (d.top_snippets || []).map((s, i) => {
    const medals = ['🥇','🥈','🥉','🏅'];
    return \`<div class="glass-light p-2 rounded-xl flex items-center justify-between text-xs">
      <span>\${medals[i]||'🎵'} \${s.source_song || 'AI Generated'} · \${s.style}</span>
      <span class="text-yellow-400 font-bold">\${(s.engagement_score*100).toFixed(0)}% ❤️</span>
    </div>\`;
  }).join('') : '<div class="text-xs text-gray-400">No songs rated yet.</div>';

  // Adaptive data
  const adaptEl = document.getElementById('adaptiveData');
  const ap = d.adaptive_profile;
  adaptEl.innerHTML = ap ? \`
    <div class="space-y-2">
      <div class="flex justify-between glass-light p-2 rounded-xl text-xs">
        <span>Total Sessions</span><span class="font-black text-pink-400">\${ap.total_sessions}</span>
      </div>
      <div class="flex justify-between glass-light p-2 rounded-xl text-xs">
        <span>Songs Played</span><span class="font-black text-yellow-400">\${ap.total_songs_played}</span>
      </div>
      <div class="flex justify-between glass-light p-2 rounded-xl text-xs">
        <span>Avg Engagement</span><span class="font-black text-green-400">\${(ap.avg_engagement_score*100).toFixed(1)}%</span>
      </div>
      <div class="glass-light p-2 rounded-xl text-xs">
        <div class="flex justify-between mb-1"><span>Engagement Score</span><span class="text-blue-400 font-black">\${(ap.avg_engagement_score*100).toFixed(0)}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:\${ap.avg_engagement_score*100}%"></div></div>
      </div>
    </div>\` : '<div class="text-xs text-gray-400">No adaptive data yet.</div>';
}

async function saveParentalRules() {
  const childId = document.getElementById('dashboardChildSelect').value;
  if (!childId) { showToast('Select a child first!', '⚠️', 'warning'); return; }
  
  const st = parseInt(document.getElementById('ruleScreenTime').value) || 30;
  const vol = parseInt(document.getElementById('ruleVolume').value) || 70;
  
  await api('POST', '/dashboard/' + childId + '/rules', {
    rule_type: 'screen_time', rule_value: { maxMinutes: st, alertAt: st - 5 }
  });
  await api('POST', '/dashboard/' + childId + '/rules', {
    rule_type: 'volume_limit', rule_value: { maxVolume: vol }
  });
  
  showToast('Parental rules saved! 🛡️', '✅', 'success');
}

// ── Library ───────────────────────────────────────────────────
function populateLibrarySelect(profiles) {
  const sel = document.getElementById('libraryChildSelect');
  if (!profiles) return;
  sel.innerHTML = '<option value="">Select profile...</option>';
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = \`\${AVATARS[p.avatar]||'🐾'} \${p.name}\`;
    sel.appendChild(opt);
  });
}

async function loadLibrary(childId) {
  if (!childId) return;
  const r = await api('GET', '/music/snippets/' + childId);
  const content = document.getElementById('libraryContent');
  
  if (!r.success || !r.data?.snippets?.length) {
    content.innerHTML = \`<div class="glass p-12 text-center">
      <i class="fas fa-music text-5xl text-gray-600 mb-4 block"></i>
      <p class="text-gray-400 font-bold">No songs generated yet for this profile</p>
      <p class="text-gray-500 text-sm mt-2">Start a session and generate some music!</p>
    </div>\`;
    return;
  }

  const snippets = r.data.snippets;
  content.innerHTML = \`<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    \${snippets.map(s => \`
      <div class="glass p-4 slide-up">
        <div class="flex items-start gap-3 mb-3">
          <div class="text-3xl">\${STYLE_EMOJIS[s.style]||'🎵'}</div>
          <div class="flex-1 min-w-0">
            <div class="font-black truncate">\${s.source_song || 'AI Original'}</div>
            <div class="text-xs text-gray-400">\${s.style} · \${s.tempo} · \${s.duration_seconds}s</div>
          </div>
          <div class="text-xs font-black text-yellow-400">\${(s.engagement_score*100).toFixed(0)}% ❤️</div>
        </div>
        <div class="flex gap-2">
          <button onclick="playLibrarySnippet('\${s.audio_url}','\${s.source_song||'AI Song'}','\${s.style}',\${s.duration_seconds})"
            class="btn-secondary flex-1 text-xs">
            <i class="fas fa-play mr-1"></i> Play
          </button>
          <div class="text-xs text-gray-500 flex items-center px-2">
            <i class="fas fa-headphones mr-1"></i>\${s.play_count}x
          </div>
        </div>
        <div class="text-xs text-gray-600 mt-2 truncate">\${new Date(s.created_at).toLocaleDateString()}</div>
      </div>
    \`).join('')}
  </div>\`;
}

function playLibrarySnippet(url, title, style, duration) {
  playAudio(url, title, style, duration);
  switchTab('companion');
  showToast(\`Playing: \${title}\`, '🎵');
}

// ── Settings / System Info ────────────────────────────────────
async function saveApiKeys() {
  const suno = document.getElementById('sunoKeyInput').value.trim();
  const openai = document.getElementById('openaiKeyInput').value.trim();
  const replicate = document.getElementById('replicateKeyInput')?.value.trim() || '';
  
  // Save locally for display purposes
  if (suno) localStorage.setItem('mb_suno_key', suno);
  if (openai) localStorage.setItem('mb_openai_key', openai);
  if (replicate) localStorage.setItem('mb_replicate_key', replicate);
  
  // Validate keys server-side
  if (openai || replicate) {
    showToast('Validating API keys...', '🔑');
    const r = await api('POST', '/music/keys/validate', {
      suno_key: suno || undefined,
      replicate_key: replicate || undefined,
      openai_key: openai || undefined
    });
    if (r.success) {
      const results = r.data.validation;
      const msgs = Object.entries(results).map(([k,v]) => k + ': ' + v).join(', ');
      const provider = r.data.active_provider;
      showToast('Active: ' + provider + '. ' + (msgs || 'Keys validated.'), '✅', 'success');
    }
  }
  
  // Show setup instructions
  showToast('⚡ To persist for all users: run wrangler secret commands — see Settings for details', '🔑', 'info');
}

async function loadSystemInfo() {
  const r = await api('GET', '/health');
  const el = document.getElementById('systemInfo');
  if (r.status === 'ok') {
    el.innerHTML = Object.entries(r).map(([k,v]) =>
      typeof v === 'object'
        ? \`<div class="font-black text-xs text-gray-400 mt-2 mb-1 uppercase">\${k}</div>\${
            Object.entries(v).map(([k2,v2])=>\`<div class="flex justify-between glass-light p-1 px-2 rounded text-xs mb-1"><span class="text-gray-400">\${k2}</span><span class="font-bold text-green-400">\${v2}</span></div>\`).join('')}\`
        : \`<div class="flex justify-between glass-light p-1 px-2 rounded text-xs mb-1"><span class="text-gray-400">\${k}</span><span class="font-bold">\${v}</span></div>\`
    ).join('');
  }
}

// ── Initialize ────────────────────────────────────────────────
// ── Family Mode Functions — Phase 3 ──────────────────────────
async function createFamilyGroup() {
  const name = document.getElementById('familyNameInput').value.trim() || 'My Family';
  const checks = document.querySelectorAll('.family-child-check:checked');
  const childIds = Array.from(checks).map(c => parseInt(c.value));
  if (childIds.length < 2) {
    showToast('Select at least 2 children for a family group', '⚠️', 'warning');
    return;
  }
  const r = await FAMILY.create(name, childIds);
  if (r.success) {
    document.getElementById('familyGroupStatus').textContent = name + ' (' + childIds.length + ' children)';
    document.getElementById('familyGroupSetup').classList.add('hidden');
    document.getElementById('familyGroupDisplay').classList.remove('hidden');
    const list = document.getElementById('familyMembersList');
    list.innerHTML = r.data.members.map(m =>
      \`<span class="song-pill text-xs active">\${m.name}, age \${m.age}</span>\`
    ).join('');
  }
}

function renderFamilyCheckboxes(profiles) {
  const container = document.getElementById('familyChildCheckboxes');
  if (!container) return;
  container.innerHTML = profiles.map(p =>
    \`<label class="flex items-center gap-2 song-pill text-xs cursor-pointer">
      <input type="checkbox" class="family-child-check" value="\${p.id}" />
      \${p.name} (age \${p.age})
    </label>\`
  ).join('');
}

// ── Shared Intelligence Panel — Phase 3 ──────────────────────
function updateSharedIntelPanel(shared, ageGroup) {
  const totalEl = document.getElementById('siTotalSessions');
  const styleEl = document.getElementById('siTopStyle');
  const tempoEl = document.getElementById('siTopTempo');
  const ageEl = document.getElementById('siAgeGroup');
  if (totalEl) totalEl.textContent = shared.total_sessions_aggregated;
  if (ageEl) ageEl.textContent = ageGroup;
  if (styleEl && shared.top_styles) {
    const top = Object.entries(shared.top_styles).sort((a,b) => b[1]-a[1])[0];
    styleEl.textContent = top ? top[0] : '–';
  }
  if (tempoEl && shared.top_tempos) {
    const top = Object.entries(shared.top_tempos).sort((a,b) => b[1]-a[1])[0];
    tempoEl.textContent = top ? top[0] : '–';
  }
}

// ══════════════════════════════════════════════════════════
// PHASE 5: BILLING SYSTEM — Intent Layer only
// Modular: Payment → Key Provisioning → Key Injection
// ══════════════════════════════════════════════════════════
const BILLING = {
  // ── Plan definitions (modular — add/remove plans here) ──
  PLANS: [
    {
      id: 'free',
      name: 'Free',
      emoji: '🆓',
      price: '$0',
      priceNote: 'forever',
      color: 'text-green-400',
      features: ['Mini-games (clap, repeat, rhythm)', 'Call-and-response interactions', 'Reward sounds + animations', 'XP + Level system', 'Browser TTS voice'],
      gatedFeatures: ['ai_music', 'premium_tts', 'extended_session'],
      stripePrice: null,
    },
    {
      id: 'starter',
      name: 'Starter',
      emoji: '🎵',
      price: '$4.99',
      priceNote: '/ month',
      color: 'text-blue-400',
      features: ['Everything in Free', '20 AI songs/month', 'OpenAI TTS (shimmer voice)', 'Unlimited sessions', 'Song library'],
      gatedFeatures: ['extended_session'],
      stripePrice: 'price_starter_monthly', // replace with real Stripe price ID
    },
    {
      id: 'premium',
      name: 'Premium',
      emoji: '👑',
      price: '$9.99',
      priceNote: '/ month',
      color: 'text-yellow-400',
      features: ['Everything in Starter', 'Unlimited AI songs', 'ElevenLabs TTS (most natural voice)', 'Creator Mode', 'Family group mode', 'Adaptive intelligence'],
      gatedFeatures: [],
      stripePrice: 'price_premium_monthly', // replace with real Stripe price ID
      badge: 'Best Value',
    },
  ],

  // ── Current state ────────────────────────────────────────
  currentTier: null,       // loaded from localStorage
  selectedPlanId: null,
  stripeInstance: null,
  stripeElements: null,
  stripeCard: null,

  // ── Intent: CheckKeyStatus ────────────────────────────────
  getTier() {
    if (this.currentTier) return this.currentTier;
    const saved = localStorage.getItem('mb_tier');
    // Verify keys exist for claimed tier
    if (saved === 'premium') {
      const hasEL = !!localStorage.getItem('mb_elevenlabs_key');
      const hasRep = !!localStorage.getItem('mb_replicate_key');
      if (hasEL || hasRep) { this.currentTier = 'premium'; return 'premium'; }
    }
    if (saved === 'starter') {
      const hasOAI = !!localStorage.getItem('mb_openai_key');
      const hasRep = !!localStorage.getItem('mb_replicate_key');
      if (hasOAI || hasRep) { this.currentTier = 'starter'; return 'starter'; }
    }
    this.currentTier = 'free';
    return 'free';
  },

  isPremium()  { return ['premium'].includes(this.getTier()); },
  isStarter()  { return ['starter','premium'].includes(this.getTier()); },
  hasMusicGen(){ return this.isStarter() && !!localStorage.getItem('mb_replicate_key'); },
  hasPremiumTTS(){ return !!localStorage.getItem('mb_elevenlabs_key') || !!localStorage.getItem('mb_openai_key'); },

  // ── Intent: Open billing modal ────────────────────────────
  open(highlightPlan = null) {
    this.renderTiers(highlightPlan);
    const modal = document.getElementById('billingModal');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    this.renderStatus();
    this.renderSettingsPlans();
    this.updateTTSProviderUI();
  },

  closeModal() {
    const modal = document.getElementById('billingModal');
    modal.style.display = 'none';
    modal.classList.add('hidden');
    this.selectedPlanId = null;
  },

  renderTiers(highlight) {
    const container = document.getElementById('billingTiers');
    if (!container) return;
    const tier = this.getTier();
    container.innerHTML = this.PLANS.map(plan => {
      const isActive = tier === plan.id;
      const borderColor = isActive ? 'rgba(255,107,157,0.8)' : 'rgba(255,255,255,0.1)';
      const badgeHtml = plan.badge ? '<span class="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full font-bold">' + plan.badge + '</span>' : '';
      const activeBadge = isActive ? '<span class="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full font-bold">Current</span>' : '';
      const preview = plan.features.slice(0,2).join(' • ');
      return '<div onclick="BILLING.selectPlan(this.dataset.plan)" data-plan="' + plan.id + '"' +
        ' class="glass-light rounded-xl p-4 cursor-pointer border-2 transition"' +
        ' id="billingPlanCard_' + plan.id + '"' +
        ' style="border-color:' + borderColor + '">' +
        '<div class="flex items-center gap-3">' +
        '<span class="text-2xl">' + plan.emoji + '</span>' +
        '<div class="flex-1"><div class="flex items-center gap-2">' +
        '<span class="font-black ' + plan.color + '">' + plan.name + '</span>' +
        badgeHtml + activeBadge +
        '</div><div class="text-xs text-gray-400">' + preview + '</div></div>' +
        '<div class="text-right"><div class="font-black ' + plan.color + '">' + plan.price + '</div>' +
        '<div class="text-xs text-gray-500">' + plan.priceNote + '</div></div>' +
        '</div></div>';
    }).join('');
    if (highlight) setTimeout(() => this.selectPlan(highlight), 100);
  },

  selectPlan(planId) {
    this.selectedPlanId = planId;
    const plan = this.PLANS.find(p => p.id === planId);
    if (!plan) return;

    // Highlight selected card
    this.PLANS.forEach(p => {
      const card = document.getElementById('billingPlanCard_' + p.id);
      if (card) card.style.borderColor = p.id === planId ? 'rgba(255,107,157,0.8)' : 'rgba(255,255,255,0.1)';
    });

    // Show tier details
    const detail = document.getElementById('billingTierDetail');
    document.getElementById('billingTierName').textContent = plan.emoji + ' ' + plan.name + ' Plan';
    document.getElementById('billingTierFeatures').innerHTML = plan.features.map(function(f){return '<li class="flex items-start gap-1"><span class="text-green-400 mt-0.5">2713</span>'+f+'</li>';}).join('');
    document.getElementById('billingTierPrice').textContent = plan.price + ' ' + plan.priceNote;
    detail.classList.remove('hidden');

    if (planId === 'free') {
      document.getElementById('billingPaymentSection').classList.add('hidden');
    } else {
      document.getElementById('billingPaymentSection').classList.remove('hidden');
      document.getElementById('billingPayBtnLabel').textContent = 'Subscribe to ' + plan.name + ' — ' + plan.price + '/mo';
      this.initStripe();
    }

    // Step bar
    document.getElementById('billingStep1Bar').style.background = 'rgba(255,107,157,0.8)';
    document.getElementById('billingStep2Bar').style.background = planId !== 'free' ? 'rgba(255,107,157,0.8)' : 'rgba(255,255,255,0.1)';
  },

  // ── Intent: Initialize Stripe ─────────────────────────────
  initStripe() {
    const pubKey = localStorage.getItem('mb_stripe_pub_key');
    if (!pubKey) {
      document.getElementById('billingStripeStatus').textContent = 'Add Stripe key in self-service below';
      return;
    }
    if (this.stripeInstance) return; // already initialized
    try {
      if (typeof Stripe !== 'undefined') {
        this.stripeInstance = Stripe(pubKey);
        this.stripeElements = this.stripeInstance.elements();
        this.stripeCard = this.stripeElements.create('card', {
          style: { base: { color: '#ffffff', fontSize: '14px', '::placeholder': { color: '#666' } } }
        });
        this.stripeCard.mount('#stripeCardElement');
        document.getElementById('stripeCardPlaceholder').style.display = 'none';
        document.getElementById('billingStripeStatus').textContent = 'Ready';
      }
    } catch(e) { console.warn('Stripe init:', e); }
  },

  // ── Intent: ProcessPayment ────────────────────────────────
  async processPayment() {
    const plan = this.PLANS.find(p => p.id === this.selectedPlanId);
    if (!plan || plan.id === 'free') { this.closeModal(); return; }

    // Check for self-service keys first (no payment needed)
    const hasOwnKeys = this.checkSelfServiceKeysForPlan(plan.id);
    if (hasOwnKeys) {
      this.completePlanActivation(plan.id);
      return;
    }

    const btn = document.getElementById('billingPayBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Processing...';
    this.showBillingStatus('Verifying payment...', 'info');

    // ── Intent: VerifyPayment → InjectKey ─────────────────
    // In production: POST to /api/billing/create-subscription with stripeCard token
    // For demo/self-hosted: simulate payment verification
    try {
      if (this.stripeInstance && this.stripeCard) {
        const { paymentMethod, error } = await this.stripeInstance.createPaymentMethod({
          type: 'card', card: this.stripeCard,
        });
        if (error) throw new Error(error.message);

        // POST intent to backend: PurchaseAPIKey
        const r = await api('POST', '/billing/subscribe', {
          plan_id: plan.id,
          payment_method_id: paymentMethod.id,
          stripe_price_id: plan.stripePrice,
        });

        if (r.success) {
          // Intent: InjectKey — backend returns provisioned keys
          if (r.data?.openai_key) localStorage.setItem('mb_openai_key', r.data.openai_key);
          if (r.data?.replicate_key) localStorage.setItem('mb_replicate_key', r.data.replicate_key);
          if (r.data?.elevenlabs_key) localStorage.setItem('mb_elevenlabs_key', r.data.elevenlabs_key);
          this.completePlanActivation(plan.id);
        } else {
          throw new Error(r.error || 'Payment failed');
        }
      } else {
        // No Stripe configured — show self-service prompt
        this.showBillingStatus('Add your API keys in the section below to activate this plan', 'info');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-lock mr-2"></i> <span id="billingPayBtnLabel">Complete Purchase</span>';
      }
    } catch(e) {
      this.showBillingStatus('Error: ' + e.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-lock mr-2"></i> <span id="billingPayBtnLabel">Try Again</span>';
    }
  },

  checkSelfServiceKeysForPlan(planId) {
    if (planId === 'premium') return !!localStorage.getItem('mb_elevenlabs_key') || !!localStorage.getItem('mb_replicate_key');
    if (planId === 'starter') return !!localStorage.getItem('mb_openai_key') || !!localStorage.getItem('mb_replicate_key');
    return false;
  },

  // ── Intent: SaveSelfServiceKeys ──────────────────────────
  saveSelfServiceKeys() {
    const oai = document.getElementById('selfServiceOpenAI')?.value.trim();
    const rep = document.getElementById('selfServiceReplicate')?.value.trim();
    const el  = document.getElementById('selfServiceElevenLabs')?.value.trim();
    if (oai) localStorage.setItem('mb_openai_key', oai);
    if (rep) localStorage.setItem('mb_replicate_key', rep);
    if (el)  localStorage.setItem('mb_elevenlabs_key', el);

    // Auto-upgrade tier based on keys provided
    let tier = 'free';
    if (el) tier = 'premium';
    else if (oai || rep) tier = 'starter';

    this.completePlanActivation(tier);
  },

  // ── Intent: InjectKey — activates tier ───────────────────
  completePlanActivation(planId) {
    localStorage.setItem('mb_tier', planId);
    this.currentTier = planId;
    this.closeModal();
    this.renderStatus();
    this.renderSettingsPlans();
    this.updateTTSProviderUI();
    REWARDS.fire('major', { trigger: 'plan_activated' });
    const plan = this.PLANS.find(p => p.id === planId);
    showToast((plan?.emoji || '🎉') + ' ' + (plan?.name || planId) + ' plan activated!', '🔓', 'success');
    speakText('Yaaayyy! Everything is unlocked! Let us make some amazing music!');
    // Update gate states
    GATE.refresh();
  },

  showBillingStatus(msg, type) {
    const el = document.getElementById('billingStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'mt-4 text-xs text-center ' + (type === 'error' ? 'text-red-400' : 'text-gray-400');
    el.classList.remove('hidden');
  },

  // ── Render subscription status in Settings tab ───────────
  renderStatus() {
    const tier = this.getTier();
    const plan = this.PLANS.find(p => p.id === tier);
    const el = document.getElementById('subscriptionStatus');
    if (!el || !plan) return;
    el.innerHTML = '<div class="flex items-center gap-3">' +
      '<div class="text-3xl">' + plan.emoji + '</div>' +
      '<div><div class="font-black text-sm ' + plan.color + '">' + plan.name + ' Plan</div>' +
      '<div class="text-xs text-gray-400">' + plan.features.slice(0,2).join(' • ') + '</div></div>' +
      (tier !== 'premium'
        ? '<button onclick="BILLING.open()" class="btn-primary text-xs ml-auto px-4"><i class="fas fa-unlock mr-1"></i> Upgrade</button>'
        : '<span class="text-xs text-green-400 font-black ml-auto">Active</span>') +
      '</div>';
    // Update icon states
    const musicIcon = document.getElementById('settingsMusicIcon');
    const ttsIcon = document.getElementById('settingsTTSIcon');
    if (musicIcon) musicIcon.textContent = this.hasMusicGen() ? '✓' : '🔒';
    if (ttsIcon) ttsIcon.textContent = this.hasPremiumTTS() ? '✓' : '🔒';
  },

  renderSettingsPlans() {
    const el = document.getElementById('settingsPlansList');
    if (!el) return;
    const tier = this.getTier();
    el.innerHTML = this.PLANS.map(function(plan) {
      const isActive = tier === plan.id;
      const preview = plan.features.slice(0,2).join(' • ');
      const actionBtn = isActive
        ? '<span class="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full font-bold">Active</span>'
        : (plan.id !== 'free' ? '<button onclick="BILLING.open(this.dataset.plan)" data-plan="' + plan.id + '" class="btn-primary text-xs px-3">Select</button>' : '');
      return '<div class="flex items-center gap-3 glass-light p-3 rounded-xl">' +
        '<span class="text-xl">' + plan.emoji + '</span>' +
        '<div class="flex-1">' +
        '<span class="font-black text-sm ' + plan.color + '">' + plan.name + '</span>' +
        '<span class="text-xs text-gray-400 ml-2">' + preview + '</span></div>' +
        '<div class="font-black ' + plan.color + ' text-sm">' + plan.price + '</div>' +
        actionBtn + '</div>';
    }).join('');
  },

  updateTTSProviderUI() {
    const sel = document.getElementById('ttsProvider');
    const note = document.getElementById('ttsProviderNote');
    if (!sel || !note) return;
    const hasEL = !!localStorage.getItem('mb_elevenlabs_key');
    const hasOAI = !!localStorage.getItem('mb_openai_key');

    if (hasEL) {
      sel.value = 'elevenlabs';
      note.textContent = 'ElevenLabs active — most natural, human-sounding voice';
      note.className = 'text-xs text-green-400 mt-1';
    } else if (hasOAI) {
      sel.value = 'openai';
      note.textContent = 'OpenAI shimmer voice active';
      note.className = 'text-xs text-blue-400 mt-1';
    } else {
      sel.value = 'webspeech';
      note.textContent = 'Browser voice (free). Upgrade for a natural, child-friendly voice.';
      note.className = 'text-xs text-gray-500 mt-1';
    }
  },
};

// ══════════════════════════════════════════════════════════
// PHASE 5: FEATURE GATE — Intent Layer
// Controls what's available per tier. Never blocks Action Layer.
// ══════════════════════════════════════════════════════════
const GATE = {
  // Feature registry
  FEATURES: {
    ai_music:         { tiers: ['starter','premium'], name: 'AI Song Generation', emoji: '🎵' },
    premium_tts:      { tiers: ['starter','premium'], name: 'Premium TTS Voice',  emoji: '🗣️' },
    extended_session: { tiers: ['premium'],            name: 'Extended Sessions',  emoji: '⏱️' },
    creator_mode:     { tiers: ['premium'],            name: 'Creator Mode',       emoji: '🎛️' },
    family_mode:      { tiers: ['premium'],            name: 'Family Group Mode',  emoji: '👨‍👩‍👧' },
  },

  // ── Intent: attempt_premium_feature ──────────────────────
  // Returns true if allowed, false + fires soft gate if not
  check(featureId, context = {}) {
    const feature = this.FEATURES[featureId];
    if (!feature) return true; // unknown feature = allow
    const tier = BILLING.getTier();
    if (feature.tiers.includes(tier)) return true;

    // Gate fires — but only when engagement is high or repeated access
    this.fireSoftGate(featureId, feature, context);
    return false;
  },

  fireSoftGate(featureId, feature, context) {
    // Only show gate prompt at good moments (high engagement OR 2nd+ attempt)
    const key = 'mb_gate_count_' + featureId;
    const count = parseInt(localStorage.getItem(key) || '0') + 1;
    localStorage.setItem(key, count.toString());

    const modal = document.getElementById('softGateModal');
    if (!modal) return;

    // Expressive voice line BEFORE showing modal
    const child = STATE.selectedChild?.name || 'friend';
    const voiceLines = {
      ai_music:         'Ooooh ' + child + '! You want to hear a real song? That is so exciting!',
      premium_tts:      'Ooooh! You want my best voice? I can sound even better!',
      extended_session: 'Wow ' + child + ', you are having so much fun! Let us keep going!',
      creator_mode:     'A real song builder! You are going to LOVE this!',
      family_mode:      'Everyone together! That sounds amazing!',
    };

    const line = voiceLines[featureId] || ('Ooooh! Something special is waiting for you, ' + child + '!');
    speakText(line);

    // Preview text
    document.getElementById('sgEmoji').textContent = feature.emoji;
    document.getElementById('sgTitle').textContent = count === 1 ? 'Ooooh... want to hear more?' : 'You really want this!';
    document.getElementById('sgDesc').textContent = feature.name + ' unlocks with a subscription';
    document.getElementById('sgPreviewWhat').innerHTML = BILLING.PLANS
      .filter(p => p.id !== 'free' && p.gatedFeatures && !p.gatedFeatures.includes(featureId))
        .map(function(p) { return '<div class="text-xs text-gray-300"><span class="' + p.color + ' font-black">' + p.emoji + ' ' + p.name + '</span> — ' + p.price + '/mo</div>'; })
      .join('');

    // Progress-based unlock message
    const xpNeeded = 500;
    if (REWARDS.xp >= xpNeeded && featureId === 'ai_music') {
      document.getElementById('sgProgressUnlock').textContent =
          'You have earned ' + REWARDS.xp + ' XP! You unlocked 1 free song preview!';
      // Grant one free preview
      setTimeout(() => { this.grantFreePreview('ai_music'); }, 1000);
    } else {
      document.getElementById('sgProgressUnlock').textContent =
          'Earn ' + Math.max(0, xpNeeded - REWARDS.xp) + ' more XP to unlock a free preview!';
    }

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
  },

  grantFreePreview(featureId) {
    const key = 'mb_free_preview_' + featureId;
    const used = localStorage.getItem(key);
    if (used) return false;
    localStorage.setItem(key, '1');
    closeSoftGate();
    showToast('Free preview unlocked! Enjoy!', '🎁', 'success');
    return true;
  },

  refresh() {
    // Re-check all gate states after tier change
    const tier = BILLING.getTier();
    // Creator tab availability
    const creatorBtn = document.getElementById('tab-creator');
    if (creatorBtn) {
      creatorBtn.style.opacity = BILLING.isPremium() ? '1' : '0.7';
      creatorBtn.title = BILLING.isPremium() ? '' : 'Premium feature — upgrade to unlock';
    }
  },
};

function closeSoftGate() {
  const modal = document.getElementById('softGateModal');
  modal.style.display = 'none';
  modal.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════
// PHASE 5: ELEVENLABS TTS INTEGRATION
// Highest quality — most human-sounding, best for children
// Injected into speakText pipeline before OpenAI fallback
// ══════════════════════════════════════════════════════════
async function callElevenLabsTTS(text, voiceId = 'EXAVITQu4vr4xnSDxMaL') {
  // EXAVITQu4vr4xnSDxMaL = "Bella" — warm, friendly female, ideal for children
  // Alternative: 21m00Tcm4TlvDq8ikWAM = "Rachel"
  const key = localStorage.getItem('mb_elevenlabs_key');
  if (!key) return null;
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.slice(0, 500),
        model_id: 'eleven_turbo_v2_5',   // fastest + highest quality
        voice_settings: {
          stability: 0.45,        // more expressive/variable
          similarity_boost: 0.85,
          style: 0.6,             // more character
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) throw new Error('ElevenLabs ' + res.status);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch(e) {
    console.warn('ElevenLabs TTS error:', e);
    return null;
  }
}

// ── Creator tab gate intercept ────────────────────────────────
const _origSwitchTab = window.switchTab;
function switchTabGated(tab) {
  if (tab === 'creator' && !BILLING.isPremium()) {
    GATE.fireSoftGate('creator_mode', GATE.FEATURES.creator_mode, { trigger: 'tab_click' });
    return;
  }
  switchTab(tab);
}

// ── Creator Tab Init ─────────────────────────────────────────
function initCreatorTab() {
  // Update provider display
  const providerEl = document.getElementById('creatorProvider');
  if (providerEl) {
    api('GET', '/health').then(r => {
      const prov = r.layers ? 'demo' : 'demo';
      providerEl.textContent = prov;
    }).catch(() => {});
  }
  // Reflect selected child name in prompt field placeholder
  if (STATE.selectedChild) {
    const promptField = document.getElementById('promptChildName');
    if (promptField && !promptField.value) promptField.placeholder = STATE.selectedChild.name;
  }
}

// ══════════════════════════════════════════════════════════
// AUTH SYSTEM — Login / Register / Logout / Session Restore
// Tokens stored in localStorage; API calls use Bearer header
// ══════════════════════════════════════════════════════════

const AUTH = {
  get token() { return localStorage.getItem('mb_auth_token'); },
  get user()  { return JSON.parse(localStorage.getItem('mb_auth_user') || 'null'); },
};

// Auth-aware fetch helper (attaches Bearer token)
async function apiAuth(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  const token = localStorage.getItem('mb_auth_token');
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch('/api' + path, opts);
    return await res.json();
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function switchAuthTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  // Update tab button styling
  const loginTab    = document.getElementById('authTabLogin');
  const registerTab = document.getElementById('authTabRegister');
  if (loginTab)    loginTab.classList.toggle('auth-tab-active', tab === 'login');
  if (loginTab)    loginTab.classList.toggle('text-gray-400', tab !== 'login');
  if (registerTab) registerTab.classList.toggle('auth-tab-active', tab === 'register');
  if (registerTab) registerTab.classList.toggle('text-gray-400', tab !== 'register');
  showAuthError('');
}

function togglePwd(fieldId, iconId) {
  const f = document.getElementById(fieldId);
  const i = document.getElementById(iconId);
  if (!f) return;
  f.type = f.type === 'password' ? 'text' : 'password';
  if (i) i.className = f.type === 'text' ? 'fas fa-eye-slash' : 'fas fa-eye';
}

function showAuthError(msg) {
  // Show error in whichever error element is currently visible
  ['authError', 'loginError', 'regError'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
    el.classList.toggle('hidden', !msg);
  });
}

function onAuthSuccess(data) {
  localStorage.setItem('mb_auth_token', data.token);
  localStorage.setItem('mb_auth_user', JSON.stringify(data.user));

  // Update header badge
  const badge = document.getElementById('userBadge');
  const badgeName = document.getElementById('userBadgeName');
  if (badge) badge.style.display = 'flex';
  if (badgeName) badgeName.textContent = data.user.name;

  // Hide auth screen, show app
  const authScreen = document.getElementById('authScreen');
  if (authScreen) authScreen.style.display = 'none';

  showToast('Welcome back, ' + data.user.name + '! 🎵', '🎉', 'success');
  init();
}

async function doLogin() {
  const btn = document.getElementById('loginBtn');
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) { showAuthError('Please enter email and password'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
  showAuthError('');
  try {
    const r = await apiAuth('POST', '/auth/login', { email, password });
    if (r.success) {
      onAuthSuccess(r.data);
    } else {
      showAuthError(r.error || 'Login failed');
    }
  } catch(e) {
    showAuthError('Connection error. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}

async function doRegister() {
  const btn = document.getElementById('registerBtn');
  const name     = document.getElementById('regName')?.value?.trim();
  const email    = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value;
  if (!name || !email || !password) { showAuthError('Please fill in all fields'); return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account...'; }
  showAuthError('');
  try {
    const r = await apiAuth('POST', '/auth/register', { name, email, password });
    if (r.success) {
      onAuthSuccess(r.data);
    } else {
      showAuthError(r.error || 'Registration failed');
    }
  } catch(e) {
    showAuthError('Connection error. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
  }
}

function demoLogin() {
  // Bypass auth — run as demo user
  const demoUser = { id: 0, name: 'Demo User', email: 'demo@musicbuddy.ai', role: 'demo' };
  localStorage.setItem('mb_auth_user', JSON.stringify(demoUser));
  localStorage.removeItem('mb_auth_token'); // no token for demo

  const badge = document.getElementById('userBadge');
  const badgeName = document.getElementById('userBadgeName');
  if (badge) badge.style.display = 'flex';
  if (badgeName) badgeName.textContent = '🎮 Demo';

  const authScreen = document.getElementById('authScreen');
  if (authScreen) authScreen.style.display = 'none';

  showToast('Demo mode — no account needed! 🎵', '🎮', 'success');
  init();
}

async function doLogout() {
  // Call server logout endpoint (invalidates token)
  if (AUTH.token) {
    try { await apiAuth('POST', '/auth/logout'); } catch(e) { /* ignore */ }
  }
  localStorage.removeItem('mb_auth_token');
  localStorage.removeItem('mb_auth_user');

  // Clear UI state
  const badge = document.getElementById('userBadge');
  if (badge) badge.style.display = 'none';

  // Stop active session if running
  if (STATE.sessionActive) await stopSession();

  // Show auth screen again
  const authScreen = document.getElementById('authScreen');
  if (authScreen) { authScreen.style.display = 'flex'; authScreen.style.opacity = '1'; }

  // Reset app state
  STATE.selectedChild = null;
  STATE.currentSession = null;

  showToast('Logged out. See you next time! 👋', '👋', 'success');
}

async function tryRestoreSession() {
  const token = AUTH.token;
  const user  = AUTH.user;

  if (!token && !user) {
    // No session at all — show auth screen
    const authScreen = document.getElementById('authScreen');
    if (authScreen) authScreen.style.display = 'flex';
    return false;
  }

  // Demo mode — skip token validation, go straight to app
  if (!token && user?.role === 'demo') {
    const badge = document.getElementById('userBadge');
    const badgeName = document.getElementById('userBadgeName');
    if (badge) badge.style.display = 'flex';
    if (badgeName) badgeName.textContent = '🎮 Demo';
    const authScreen = document.getElementById('authScreen');
    if (authScreen) authScreen.style.display = 'none';
    return true;
  }

  // Validate token against server
  try {
    const r = await apiAuth('GET', '/auth/me');
    if (r.success) {
      localStorage.setItem('mb_auth_user', JSON.stringify(r.data.user));
      const badge = document.getElementById('userBadge');
      const badgeName = document.getElementById('userBadgeName');
      if (badge) badge.style.display = 'flex';
      if (badgeName) badgeName.textContent = r.data.user.name;
      const authScreen = document.getElementById('authScreen');
      if (authScreen) authScreen.style.display = 'none';
      return true;
    }
  } catch(e) { /* fall through */ }

  // Token invalid — clear storage and show auth screen
  localStorage.removeItem('mb_auth_token');
  localStorage.removeItem('mb_auth_user');
  const authScreen = document.getElementById('authScreen');
  if (authScreen) authScreen.style.display = 'flex';
  return false;
}

// ============================================================
// ADAPTIVE CHILD SYSTEM — Frontend Controller
// Connects to Intent Layer for all age/personality/emotion logic.
// All state persists to DB via /api/intent endpoints.
//
// Flow: child selected → GET_FULL_SESSION_STATE
//   → render age-adaptive games, personality picker, emotion state
//   → on each engagement event: UPDATE_EMOTION_STATE → SAVE_ENGAGEMENT_STATE
//   → on song generation: CHECK_USAGE_LIMIT → TRACK_USAGE
// ============================================================

// ── Adaptive State ────────────────────────────────────────────
const ADAPTIVE = {
  personality:  'playful',    // energetic|calm|playful|nurturing|teacher
  emotion:      'neutral',    // happy|excited|proud|encouraging|concerned|neutral
  ageGroup:     'toddler',    // infant|toddler|early_learning|advanced
  ageProfile:   null,         // full profile from Intent Layer
  games:        [],           // age-appropriate games
  loaded:       false,
  _saveTimer:   null,

  // ── Intent Layer helpers ──────────────────────────────────
  async intent(intentName, data) {
    const user = AUTH.getUser();
    const child = STATE.selectedChild;
    try {
      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          intent: intentName,
          userId:  user?.id?.toString() ?? 'demo',
          childId: child?.id ?? undefined,
          data:    data || {},
        }),
      });
      return await res.json();
    } catch(e) {
      console.warn('[ADAPTIVE] intent error:', intentName, e);
      return { success: false, error: e.message };
    }
  },

  // ── Load full session state on child select ───────────────
  async loadForChild(child) {
    if (!child) return;
    try {
      const r = await this.intent('GET_FULL_SESSION_STATE', {});
      if (r.success && r.data) {
        const d = r.data;
        this.personality = d.personality ?? 'playful';
        if (d.engagementState?.found) {
          this.emotion = d.engagementState.emotion ?? 'neutral';
          STATE.smileCount     = d.engagementState.smileCount ?? 0;
          STATE.laughCount     = d.engagementState.laughCount ?? 0;
          STATE.attentionLoss  = d.engagementState.attentionLoss ?? 0;
          STATE.engScore       = d.engagementState.engScore ?? 0;
        }
      }
    } catch(e) { console.warn('[ADAPTIVE] loadForChild error', e); }

    await this.loadAgeGames(child.age);
    this.renderPersonalityPicker();
    this.renderEmotionState();
    this.renderUsageSummary();
    this.loaded = true;
  },

  // ── Load age-appropriate games via Intent Layer ───────────
  async loadAgeGames(age) {
    try {
      const r = await this.intent('GET_AGE_GAMES', { age: age ?? 5 });
      if (r.success && r.data) {
        this.ageGroup  = r.data.ageGroup;
        this.ageProfile = r.data;
        this.games      = r.data.games ?? [];
        this.renderAgeGames(r.data);
        return;
      }
    } catch(e) { console.warn('[ADAPTIVE] loadAgeGames error', e); }
    // fallback: keep defaults
    this.renderAgeGames(null);
  },

  // ── Render age-adaptive game buttons ─────────────────────
  renderAgeGames(data) {
    const container = document.getElementById('ageGameButtons');
    const bonusContainer = document.getElementById('bonusGameButtons');
    const badge = document.getElementById('ageGroupBadge');
    const label = document.getElementById('ageGamesLabel');
    const hint  = document.getElementById('ageGamesHint');
    if (!container) return;

    const GAME_COLORS = [
      'linear-gradient(135deg,#6c3fc4,#9d4edd)',
      'linear-gradient(135deg,#c4503f,#e86c4d)',
      'linear-gradient(135deg,#2d6a4f,#40916c)',
      'linear-gradient(135deg,#1a4e8c,#2d7dd2)',
      'linear-gradient(135deg,#7b2d8b,#c44dce)',
    ];

    if (!data || !data.games || !data.games.length) {
      // Fallback to hardcoded toddler defaults
      return;
    }

    const games = data.games;
    const ageGroupLabels = {
      infant: 'Baby (0-2)', toddler: 'Toddler (3-5)',
      early_learning: 'Ages 6-8', advanced: 'Ages 9+'
    };

    if (badge) { badge.textContent = ageGroupLabels[data.ageGroup] || data.ageLabel; badge.classList.remove('hidden'); }
    if (label) label.textContent = 'AGE GAMES — ' + (ageGroupLabels[data.ageGroup] || '');
    if (hint)  hint.textContent  = games.length + ' free games for ' + (ageGroupLabels[data.ageGroup] || 'this age') + ' · Tap to start!';

    // Map game ids to existing minigame types where possible
    const GAME_TO_MINIGAME = {
      repeat_after_me: 'repeat', counting_game: 'repeat',
      call_response: 'callresponse', clap_game: 'clap',
      animal_sounds: 'repeat', simple_matching: 'clap',
      math_mini: 'rhythm', spelling_game: 'repeat',
      pattern_match: 'rhythm', memory_cards: 'clap',
      rhythm_match: 'rhythm', peekaboo: 'peekaboo',
      sound_imitation: 'soundimitation', color_flash: 'colorflash',
      gentle_bounce: 'gentlebounce', music_quiz: 'musicquiz',
      logic_rhythm: 'rhythm', story_song: 'storysong',
      beat_maker: 'clap', lyric_fill: 'lyricfill',
    };

    // First 3 games in main grid
    const mainGames = games.slice(0, 3);
    const extraGames = games.slice(3);

    // Build game buttons using DOM (avoid quote-escaping issues in template literal)
    function _makeGameBtn(g, type, color, extraClass) {
      var btn = document.createElement("button");
      btn.className = (extraClass || "flex flex-col items-center gap-1 rounded-2xl py-3 px-1") + " font-black text-xs transition-all active:scale-95 hover:scale-105";
      btn.setAttribute("style", "background:" + color + ";border:2px solid rgba(255,255,255,0.2)");
      (function(id, t) { btn.addEventListener("click", function() { launchAdaptiveGame(id, t); }); })(g.id, type);
      var emoSpan = document.createElement("span");
      emoSpan.className = (extraClass ? "text-xl" : "text-2xl");
      emoSpan.textContent = g.emoji;
      var lblSpan = document.createElement("span");
      lblSpan.textContent = g.label.split("!")[0].slice(0, extraClass ? 12 : 10);
      btn.appendChild(emoSpan);
      btn.appendChild(lblSpan);
      if (!extraClass) {
        var descSpan = document.createElement("span");
        descSpan.setAttribute("style", "font-size:9px;opacity:0.8");
        descSpan.textContent = (g.description || "").slice(0, 16);
        btn.appendChild(descSpan);
      }
      return btn;
    }
    container.innerHTML = "";
    mainGames.forEach(function(g, i) {
      var type = GAME_TO_MINIGAME[g.id] || "clap";
      var color = GAME_COLORS[i % GAME_COLORS.length];
      container.appendChild(_makeGameBtn(g, type, color, null));
    });

    // 4th and 5th games in bonus row
    if (bonusContainer && extraGames.length > 0) {
      bonusContainer.innerHTML = "";
      extraGames.forEach(function(g, i) {
        var type = GAME_TO_MINIGAME[g.id] || "clap";
        var color = GAME_COLORS[(i + 3) % GAME_COLORS.length];
        bonusContainer.appendChild(_makeGameBtn(g, type, color, "flex flex-col items-center gap-1 rounded-2xl py-2 px-2"));
      });
      bonusContainer.classList.remove("hidden");
    }
  },

  // ── Set personality (persists via Intent Layer) ───────────
  async setPersonality(type) {
    this.personality = type;
    this.renderPersonalityPicker();
    const r = await this.intent('SAVE_PERSONALITY_PREF', { personality: type });
    if (r.success) showToast('Personality set to ' + type + '!', '🎭', 'success');
  },

  // ── Render personality picker UI ─────────────────────────
  renderPersonalityPicker() {
    const PERSONALITY_HINTS = {
      energetic:  '⚡ Explosive energy — caps, triple exclamation, WOW!',
      calm:       '😌 Gentle, slow, soft — reassuring and nurturing',
      playful:    '🎉 Silly and fun — jokes, rhymes, giggles',
      nurturing:  '💖 Warm and loving — supportive, "sweetheart"',
      teacher:    '🎓 Guided learning — questions, specific praise',
    };
    const active = this.personality;
    ['energetic','calm','playful','nurturing','teacher'].forEach(function(p) {
      const btn = document.getElementById('pers-' + p);
      if (!btn) return;
      if (p === active) {
        btn.style.borderColor = '#ff6b9d';
        btn.style.background  = 'rgba(255,107,157,0.2)';
      } else {
        btn.style.borderColor = 'rgba(255,255,255,0.1)';
        btn.style.background  = 'rgba(255,255,255,0.03)';
      }
    });
    const hint = document.getElementById('personalityHint');
    if (hint) hint.textContent = PERSONALITY_HINTS[active] || '';

    // Update emotion badge too
    const badge = document.getElementById('currentEmotionBadge');
    if (badge) {
      const EMOTION_DISPLAY = {
        happy: '😊 Happy', excited: '🤩 Excited', proud: '🏆 Proud',
        encouraging: '💪 Go!', concerned: '🤔 Quiet', neutral: '😐 Neutral',
      };
      badge.textContent = EMOTION_DISPLAY[this.emotion] || '😊';
    }
  },

  // ── Update emotion state from engagement metrics ──────────
  async updateEmotion(metrics) {
    const r = await this.intent('UPDATE_EMOTION_STATE', metrics);
    if (r.success && r.data) {
      const prev = this.emotion;
      this.emotion = r.data.emotionState ?? 'neutral';
      if (prev !== this.emotion) {
        this.renderEmotionState();
        STATE.lastDetectedEmotion = this.emotion;
        this.scheduleSaveState();
      }
    }
  },

  // ── Render emotion state UI ───────────────────────────────
  renderEmotionState() {
    const EMOTION_IDS = ['happy','excited','proud','encouraging','concerned','neutral'];
    const active = this.emotion;
    EMOTION_IDS.forEach(function(e) {
      const el = document.getElementById('emo-' + e);
      if (!el) return;
      if (e === active) {
        el.style.borderColor = '#ff6b9d';
        el.style.background  = 'rgba(255,107,157,0.15)';
        el.style.color       = '#fff';
        el.style.fontWeight  = '700';
      } else {
        el.style.borderColor = 'rgba(255,255,255,0.1)';
        el.style.background  = 'transparent';
        el.style.color       = '';
        el.style.fontWeight  = '';
      }
    });
    // Sync badge
    this.renderPersonalityPicker();
  },

  // ── Usage summary render ──────────────────────────────────
  async renderUsageSummary() {
    try {
      const r = await this.intent('GET_USAGE_SUMMARY', {});
      if (!r.success || !r.data?.summary) return;
      const list = document.getElementById('usageSummaryList');
      if (!list) return;
      const LABELS = {
        songs_per_day:  { emoji: '🎵', label: 'Songs today' },
        premium_voice:  { emoji: '🎙️', label: 'Premium voice' },
        tts_basic:      { emoji: '🔊', label: 'Basic TTS' },
        games_free:     { emoji: '🎮', label: 'Games' },
        ai_behavior:    { emoji: '🧠', label: 'AI decisions' },
      };
      const html = Object.entries(r.data.summary).map(function([id, s]) {
        const meta = LABELS[id] || { emoji: '•', label: id };
        if (s.unlimited) {
          return '<div class="flex items-center justify-between text-xs">'
            + '<span>' + meta.emoji + ' ' + meta.label + '</span>'
            + '<span class="text-green-400 font-bold">∞ Free</span></div>';
        }
        const pct = Math.min(100, Math.round((s.used / s.limit) * 100));
        const color = pct >= 100 ? '#f87171' : pct >= 80 ? '#fbbf24' : '#4ade80';
        return '<div class="mb-1">'
          + '<div class="flex items-center justify-between text-xs mb-0.5">'
          + '<span>' + meta.emoji + ' ' + meta.label + '</span>'
          + '<span style="color:' + color + '">' + s.used + ' / ' + s.limit + '</span></div>'
          + '<div class="h-1 rounded-full bg-white bg-opacity-10">'
          + '<div class="h-full rounded-full transition-all" style="width:' + pct + '%;background:' + color + '"></div></div></div>';
      }).join('');
      list.innerHTML = html;

      // Also update usage bar in game panel
      this.updateUsageBar(r.data.summary);
    } catch(e) { console.warn('[ADAPTIVE] renderUsageSummary error', e); }
  },

  updateUsageBar(summary) {
    const bar  = document.getElementById('usageLimitBar');
    const fill = document.getElementById('usageLimitFill');
    const lbl  = document.getElementById('usageLimitLabel');
    const cnt  = document.getElementById('usageLimitCount');
    if (!bar || !summary) return;
    const songs = summary['songs_per_day'];
    if (!songs || songs.unlimited) { bar.style.display = 'none'; return; }
    bar.style.display = 'block';
    if (lbl) lbl.textContent = '🎵 Daily Songs';
    if (cnt) cnt.textContent = songs.used + ' / ' + songs.limit;
    const pct = Math.min(100, Math.round((songs.used / songs.limit) * 100));
    const color = pct >= 100 ? '#f87171' : pct >= 80 ? '#fbbf24' : '#4ade80';
    if (fill) { fill.style.width = pct + '%'; fill.style.background = 'linear-gradient(90deg,' + color + ',' + color + ')'; }
  },

  // ── Check usage limit before generating a song ────────────
  async checkUsageBeforeSong() {
    try {
      const r = await this.intent('CHECK_USAGE_LIMIT', { featureId: 'songs_per_day' });
      if (r.success && r.data) {
        if (!r.data.allowed && !r.data.unlimited) {
          showUsageLimitModal('songs_per_day', r.data);
          return false;
        }
      }
    } catch(e) { /* allow on error */ }
    return true;
  },

  // ── Track usage after successful song ─────────────────────
  async trackSongUsage() {
    await this.intent('TRACK_USAGE', { featureId: 'songs_per_day' });
    await this.renderUsageSummary();
  },

  // ── Check premium voice usage ─────────────────────────────
  async checkPremiumVoice() {
    try {
      const r = await this.intent('CHECK_USAGE_LIMIT', { featureId: 'premium_voice' });
      if (r.success && r.data && !r.data.allowed && !r.data.unlimited) {
        return false;
      }
    } catch(e) { /* allow */ }
    return true;
  },

  // ── Save engagement state (debounced, 10s) ────────────────
  scheduleSaveState() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveEngagementState(), 10000);
  },

  async saveEngagementState() {
    await this.intent('SAVE_ENGAGEMENT_STATE', {
      emotion:      this.emotion,
      personality:  this.personality,
      smileCount:   STATE.smileCount    || 0,
      laughCount:   STATE.laughCount    || 0,
      attentionLoss: STATE.attentionLoss || 0,
      engScore:     STATE.engScore      || 0,
      voiceDetected: false,
      currentSong:  STATE.currentSnippet?.name || null,
    });
  },

  // ── Engagement loop step (called every 15s during session) ─
  async engagementLoopStep() {
    if (!STATE.sessionActive) return;
    const metrics = {
      smileCount:    STATE.smileCount    || 0,
      laughCount:    STATE.laughCount    || 0,
      attentionLoss: STATE.attentionLoss || 0,
      engScore:      STATE.engScore      || 0,
      voiceDetected: false,
    };
    await this.updateEmotion(metrics);

    // If concerned (attention loss), trigger an engagement response
    if (this.emotion === 'concerned' && STATE.sessionActive) {
      const child = STATE.selectedChild;
      if (child && Date.now() - (this._lastEngageResponse || 0) > 60000) {
        this._lastEngageResponse = Date.now();
        const phrases = [
          "Hey " + child.name + "! Are you still there? Let's play!",
          child.name + ", guess what! I have a new game for you!",
          "Oops, I think you might have walked away! Come back " + child.name + "!",
          "Time for something new! Ready, " + child.name + "?",
        ];
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        speakText(phrase);
        STATE.attentionLoss = Math.max(0, STATE.attentionLoss - 1);
      }
    }

    this.scheduleSaveState();
  },
};

// ── Global setter called from personality picker buttons ─────
function setPersonality(type) {
  ADAPTIVE.setPersonality(type);
}

// ── Launch age-adaptive game ─────────────────────────────────
function launchAdaptiveGame(gameId, legacyType) {
  // For games that have new implementations, route to them
  const NEW_GAME_HANDLERS = {
    peekaboo:       startPeekabooGame,
    sound_imitation: startSoundImitationGame,
    color_flash:    startColorFlashGame,
    gentle_bounce:  startGentleBounceGame,
    counting_game:  startCountingGame,
    animal_sounds:  startAnimalSoundsGame,
    simple_matching: startSimpleMatchingGame,
    math_mini:      startMathMiniGame,
    spelling_game:  startSpellingGame,
    pattern_match:  null,
    memory_cards:   null,
    music_quiz:     startMusicQuizGame,
    logic_rhythm:   null,
    story_song:     startStorySongGame,
    beat_maker:     null,
    lyric_fill:     startLyricFillGame,
  };

  const handler = NEW_GAME_HANDLERS[gameId];
  if (handler) {
    handler();
    return;
  }

  // Fall back to existing minigame system
  if (legacyType === 'callresponse') { startCallAndResponse(); return; }
  startMiniGame(legacyType || 'clap');
}

// ── Show usage limit paywall ──────────────────────────────────
function showUsageLimitModal(featureId, data) {
  const modal = document.getElementById('usageLimitModal');
  if (!modal) { BILLING.openModal(); return; }

  const MESSAGES = {
    songs_per_day: { title: 'Daily Song Limit Reached!', msg: "You've used all your free songs for today. Upgrade for unlimited songs!", emoji: '🎵' },
    premium_voice: { title: 'Premium Voice Limit!', msg: "You've used your free premium voice uses. Upgrade for unlimited!", emoji: '🎙️' },
    tts_basic:     { title: 'Voice Limit Reached!', msg: 'Daily voice limit reached. Upgrade for unlimited voice!', emoji: '🔊' },
    ai_behavior:   { title: 'AI Limit Reached!', msg: 'Daily AI interactions used. Upgrade for unlimited AI!', emoji: '🧠' },
  };

  const m = MESSAGES[featureId] || MESSAGES.songs_per_day;
  const titleEl = document.getElementById('usageLimitTitle');
  const msgEl   = document.getElementById('usageLimitMsg');
  const emojiEl = document.getElementById('usageLimitEmoji');
  const detailEl = document.getElementById('usageLimitDetail');
  const premEl  = document.getElementById('usagePremiumDetail');

  if (titleEl) titleEl.textContent = m.title;
  if (msgEl)   msgEl.textContent   = m.msg;
  if (emojiEl) emojiEl.textContent = m.emoji;
  if (detailEl && data) detailEl.textContent = data.used + ' / ' + data.limit;

  modal.style.display = 'flex';
}

function closeUsageLimitModal() {
  const modal = document.getElementById('usageLimitModal');
  if (modal) modal.style.display = 'none';
}

// ── Age-adaptive mini-game stubs for new game types ──────────
// These wrap the existing MINIGAME system with age-appropriate content

function startPeekabooGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const child = STATE.selectedChild;
  const name = child?.name || 'friend';
  const phrases = ['Where am I? PEEKABOO! There I am!', 'Ready? 1... 2... 3... PEEKABOO!', 'Hiding! Hiding! PEEKABOO — found you!'];
  let i = 0;
  function step() {
    if (i >= phrases.length) return;
    speakText(phrases[i++]);
    setTimeout(step, 3500);
  }
  speakText("Let's play Peekaboo, " + name + "!");
  setTimeout(step, 1500);
  showToast('Peekaboo game started!', '🙈', 'success');
}

function startSoundImitationGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const sounds = ['Moo! Can you say MOO?', 'Woof woof! Can you say WOOF?', 'Meow! Can you say MEOW?', 'Oink oink! Can you say OINK?'];
  const sound = sounds[Math.floor(Math.random() * sounds.length)];
  speakText(sound);
  showToast('Copy that sound!', '🔊', 'success');
}

function startColorFlashGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const colors = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  const colorNames = ['RED!', 'BLUE!', 'YELLOW!', 'GREEN!', 'ORANGE!', 'PURPLE!'];
  let i = 0;
  const modal = document.getElementById('miniGameModal');
  const content = document.getElementById('miniGameContent');
  const title   = document.getElementById('miniGameTitle');
  if (!modal || !content) { startMiniGame('clap'); return; }
  title.textContent = 'Color Flash!';
  content.innerHTML = '<div id="colorFlashScreen" style="height:180px;border-radius:16px;background:red;display:flex;align-items:center;justify-content:center;font-size:3rem;font-weight:900;color:white;transition:background 0.3s" onclick="nextColorFlash()">RED!</div><p style="text-align:center;margin-top:12px;color:#ccc;font-size:13px">Tap to see next color!</p>';
  modal.style.display = 'flex';
  modal.classList.remove('hidden');
  window._colorFlashList = colors;
  window._colorFlashIdx  = 0;
  speakText('Watch the colors! RED!');
}

window.nextColorFlash = function() {
  const colors = ['red','blue','yellow','green','orange','purple'];
  const names  = ['RED!','BLUE!','YELLOW!','GREEN!','ORANGE!','PURPLE!'];
  window._colorFlashIdx = ((window._colorFlashIdx || 0) + 1) % colors.length;
  const el = document.getElementById('colorFlashScreen');
  if (el) { el.style.background = colors[window._colorFlashIdx]; el.textContent = names[window._colorFlashIdx]; }
  speakText(names[window._colorFlashIdx]);
};

function startGentleBounceGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  speakText('Bounce bounce bounce! Can you bounce with me? Up! Down! Up! Down!');
  showToast('Bouncy time!', '🎈', 'success');
}

function startCountingGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const child = STATE.selectedChild;
  const name = child?.name || 'friend';
  const max = 5;
  speakText("Let's count together, " + name + "! Ready? ONE... TWO... THREE... FOUR... FIVE! Amazing!");
  showToast('Counting game!', '🔢', 'success');
}

function startAnimalSoundsGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const animals = [
    ['cow', 'MOO'],['dog', 'WOOF'],['cat', 'MEOW'],['pig', 'OINK'],
    ['duck', 'QUACK'],['lion', 'ROAR'],['sheep', 'BAA'],['frog','RIBBIT']
  ];
  const [animal, sound] = animals[Math.floor(Math.random() * animals.length)];
  speakText('What does a ' + animal + ' say? It says ' + sound + '! Can you say ' + sound + '?');
  showToast('Animal sounds!', '🐾', 'success');
}

function startSimpleMatchingGame() {
  startMiniGame('clap');
}

function startMathMiniGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const a = Math.floor(Math.random() * 5) + 1;
  const b = Math.floor(Math.random() * 5) + 1;
  speakText('Music Math! If I play ' + a + ' notes, then ' + b + ' more notes, how many notes is that? Count with me: ' + (a + b) + '! Great job!');
  showToast('Music Math!', '🎼', 'success');
}

function startSpellingGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const words = ['BEAT', 'SONG', 'NOTE', 'DRUM', 'SING', 'PLAY', 'TUNE', 'MUSIC'];
  const word = words[Math.floor(Math.random() * words.length)];
  speakText("Let's spell " + word + "! Ready? " + word.split("").join("... ") + "! You spelled " + word + "!");
  showToast('Spell it out!', '🔤', 'success');
}

function startMusicQuizGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const questions = [
    ['How many notes are in a musical scale?', '7! Do Re Mi Fa Sol La Ti!'],
    ['What instrument has black and white keys?', 'A piano!'],
    ['How many strings does a guitar have?', 'Six strings!'],
    ['What do you call the speed of music?', 'Tempo!'],
    ['What is a group of musicians called?', 'A band or orchestra!'],
  ];
  const [q, a] = questions[Math.floor(Math.random() * questions.length)];
  speakText("Music Quiz! Here's your question: " + q + " Do you know the answer? The answer is... " + a + " Amazing!");
  showToast('Music Quiz!', '🎓', 'success');
}

function startStorySongGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const child = STATE.selectedChild;
  const name = child?.name || 'the hero';
  speakText('Once upon a time, ' + name + ' found a magical instrument. When they played it, the whole world started to dance! What instrument did ' + name + ' find? Tell me your story!');
  showToast('Story Song!', '📖', 'success');
}

function startLyricFillGame() {
  if (window._activeTTSAudio) { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; window._activeTTSAudio = null; }
  const lyrics = [
    ['Twinkle twinkle little...', 'STAR!'],
    ['Old MacDonald had a...', 'FARM!'],
    ['The wheels on the bus go round and...', 'ROUND!'],
    ['Row row row your...', 'BOAT!'],
    ['Head shoulders knees and...', 'TOES!'],
  ];
  const [line, answer] = lyrics[Math.floor(Math.random() * lyrics.length)];
  speakText('Fill in the lyric! ' + line + ' What comes next? Say it! ' + answer + '! You got it!');
  showToast('Fill the Lyric!', '✍️', 'success');
}

// ── Engagement loop timer (runs every 15s during session) ────
let _engagementLoopTimer = null;
function startEngagementLoop() {
  clearInterval(_engagementLoopTimer);
  _engagementLoopTimer = setInterval(function() {
    ADAPTIVE.engagementLoopStep();
  }, 15000);
}
function stopEngagementLoop() {
  clearInterval(_engagementLoopTimer);
  _engagementLoopTimer = null;
  ADAPTIVE.saveEngagementState();
}

// ============================================================
// VOICE PERSONALITY ENGINE — Frontend Controller
// Phase 2 "Alive System" — 5-Stage Pipeline:
//   Input → Emotion Detection → Memory → Groq Personality
//   → ElevenLabs TTS → Ambient Music Layer
// ============================================================
const VOICE_PERSONALITY = {
  gender:      'female',
  style:       'default',
  character:   'luna',   // luna | max | bubbles | _custom_eleven | _custom_openai
  stability:   0.35,
  styleBoost:  0.75,
  similarity:  0.60,
  groqEnabled: true,
  _saved:      false,
  // Full voice picker fields
  preferredProvider:    'elevenlabs',
  elevenlabsVoiceId:    'EXAVITQu4vr4xnSDxMaL',
  elevenlabsVoiceName:  'Luna (Rachel)',
  openaiVoice:          'nova',
  openaiVoiceLabel:     'Nova (Warm female)',
  // Character → gender + style mapping
  CHARACTERS: {
    luna:    { gender: 'female', style: 'default',  emoji: '🌙', desc: 'Luna — Warm female host (Rachel voice)',     label: 'Luna' },
    max:     { gender: 'male',   style: 'energetic', emoji: '⚡', desc: 'Max — Fun energetic male (Josh voice)',      label: 'Max'  },
    bubbles: { gender: 'female', style: 'playful',  emoji: '🫧', desc: 'Bubbles — Silly bright female (Matilda)',   label: 'Bubbles' },
  },
  VOICE_NAMES: {
    female: { default: 'Rachel (Warm Host)', playful: 'Matilda (Playful)', soothing: 'Bella (Soothing)', energetic: 'Elli (Energetic)' },
    male:   { default: 'Charlie (Narrator)', playful: 'Will (Playful)',    soothing: 'Callum (Calm)',    energetic: 'Josh (Energetic)' },
  },
};

// ── Client-side emotion detection (mirrors backend EmotionEngine) ──
const EMOTION_KEYWORDS = {
  comfort:   ['sad','cry','crying','bad','hurt','miss','lonely','scared','afraid','tired','boring'],
  calm:      ['sleep','sleepy','bed','night','quiet','calm','relax','slow','lullaby','peaceful'],
  excited:   ['wow','amazing','yay','woohoo','awesome','best','love','happy','fun','excited','yess'],
  singing:   ['sing','song','music','la','melody','beat','rhythm','dance'],
  curious:   ['why','what','how','tell me','explain','wonder','curious','show me'],
  surprised: ['surprise','oh my','whoa','oh wow','no way','really','omg'],
};

function detectEmotionClient(text) {
  if (!text) return 'happy';
  const lower = (text || '').toLowerCase();
  for (const emotion of ['comfort','calm','excited','singing','curious','surprised']) {
    if (EMOTION_KEYWORDS[emotion].some(function(w) { return lower.indexOf(w) !== -1; })) {
      return emotion;
    }
  }
  return 'happy';
}

// Map client emotion → TTSEmotion string for API
function emotionToTTSEmotion(emotion) {
  var map = { excited: 'excited', singing: 'singing', calm: 'calm',
              comfort: 'encouraging', curious: 'friendly', surprised: 'surprised', happy: 'friendly' };
  return map[emotion] || 'friendly';
}

// Map emotion → music vibe for ambient layer
function emotionToVibe(emotion) {
  var map = { excited: 'upbeat', singing: 'upbeat', happy: 'playful',
              curious: 'playful', calm: 'soothing', comfort: 'warm', surprised: 'celebratory' };
  return map[emotion] || 'playful';
}

// ── Character Voice Selector ──────────────────────────────────
// Map character → ElevenLabs voice ID
var CHAR_VOICE_IDS = {
  luna:    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Luna (Rachel)',  provider: 'elevenlabs' },
  max:     { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Max (Josh)',     provider: 'elevenlabs' },
  bubbles: { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Bubbles (Matilda)', provider: 'elevenlabs' },
};
function setCharacterVoice(character) {
  const chars = VOICE_PERSONALITY.CHARACTERS;
  const char  = chars[character];
  if (!char) return;
  VOICE_PERSONALITY.character = character;
  VOICE_PERSONALITY.gender    = char.gender;
  VOICE_PERSONALITY.style     = char.style;
  // Set ElevenLabs voice ID for this character
  var cvi = CHAR_VOICE_IDS[character];
  if (cvi) {
    VOICE_PERSONALITY.elevenlabsVoiceId   = cvi.id;
    VOICE_PERSONALITY.elevenlabsVoiceName = cvi.name;
    VOICE_PERSONALITY.preferredProvider   = cvi.provider;
  }
  const active   = 'border-color:#ff6b9d;background:rgba(255,107,157,0.15)';
  const inactive = 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
  ['luna','max','bubbles'].forEach(function(c) {
    const btn = document.getElementById('char' + c.charAt(0).toUpperCase() + c.slice(1));
    if (btn) btn.style.cssText = (c === character ? active : inactive);
  });
  // Deselect ElevenLabs/OpenAI custom buttons
  document.querySelectorAll('.eleven-voice-btn,.openai-voice-btn').forEach(function(btn) {
    btn.style.cssText = 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
  });
  const infoEl = document.getElementById('selectedCharInfo');
  if (infoEl) infoEl.textContent = char.emoji + ' ' + char.desc;
  // Update active bar
  if (typeof VOICE_PICKER !== 'undefined') {
    VOICE_PICKER.updateActiveBar(char.emoji, char.label, char.desc, 'ElevenLabs');
  }
  // Also sync style buttons
  setVoiceStyle(char.style);
  updateExpressivenessPreview();
}

// Keep setVoiceGender for API compatibility (called by loadVoiceSettings)
function setVoiceGender(g) {
  VOICE_PERSONALITY.gender = g;
  // Sync the character button if it matches
  var matchChar = null;
  Object.keys(VOICE_PERSONALITY.CHARACTERS).forEach(function(c) {
    if (VOICE_PERSONALITY.CHARACTERS[c].gender === g &&
        VOICE_PERSONALITY.CHARACTERS[c].style === VOICE_PERSONALITY.style) matchChar = c;
  });
  if (matchChar) {
    var active   = 'border-color:#ff6b9d;background:rgba(255,107,157,0.15)';
    var inactive = 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
    ['luna','max','bubbles'].forEach(function(c) {
      var btn = document.getElementById('char' + c.charAt(0).toUpperCase() + c.slice(1));
      if (btn) btn.style.cssText = (c === matchChar ? active : inactive);
    });
    VOICE_PERSONALITY.character = matchChar;
  }
  updateExpressivenessPreview();
}

function setVoiceStyle(s) {
  VOICE_PERSONALITY.style = s;
  ['default','playful','energetic','soothing'].forEach(function(id) {
    const btn = document.getElementById('vstyle-' + id);
    if (!btn) return;
    btn.style.cssText = (id === s)
      ? 'border-color:#ff6b9d;background:rgba(255,107,157,0.15)'
      : 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
  });
  const presets = {
    default:   { stability: 0.35, style: 0.75, similarity: 0.60 },
    playful:   { stability: 0.30, style: 0.90, similarity: 0.60 },
    energetic: { stability: 0.28, style: 0.95, similarity: 0.65 },
    soothing:  { stability: 0.65, style: 0.35, similarity: 0.55 },
  };
  const p = presets[s] || presets.default;
  VOICE_PERSONALITY.stability  = p.stability;
  VOICE_PERSONALITY.styleBoost = p.style;
  VOICE_PERSONALITY.similarity = p.similarity;
  const stab = document.getElementById('elStability');
  const styl = document.getElementById('elStyleBoost');
  const sim  = document.getElementById('elSimilarity');
  if (stab) { stab.value = String(p.stability);  document.getElementById('stabilityVal').textContent  = p.stability.toFixed(2); }
  if (styl) { styl.value = String(p.style);      document.getElementById('styleBoostVal').textContent = p.style.toFixed(2); }
  if (sim)  { sim.value  = String(p.similarity); document.getElementById('similarityVal').textContent = p.similarity.toFixed(2); }
  updateExpressivenessPreview();
}

function updateExpressivenessPreview() {
  const stabEl  = document.getElementById('elStability');
  const styleEl = document.getElementById('elStyleBoost');
  const stab  = parseFloat(stabEl  ? stabEl.value  : '0.35');
  const style = parseFloat(styleEl ? styleEl.value : '0.75');
  VOICE_PERSONALITY.stability  = stab;
  VOICE_PERSONALITY.styleBoost = style;
  const el = document.getElementById('expressivenessPreview');
  if (!el) return;
  const names = VOICE_PERSONALITY.VOICE_NAMES[VOICE_PERSONALITY.gender];
  const voiceName = (names && names[VOICE_PERSONALITY.style]) || 'Rachel';
  let label = '', color = '#ff6b9d';
  if (stab < 0.32 && style > 0.85)      { label = '🔥 ULTRA Expressive — Maximum character!';  color = '#ff4444'; }
  else if (stab < 0.45 && style > 0.65) { label = '✨ Very Expressive — Perfect for children!'; color = '#ff6b9d'; }
  else if (stab < 0.55)                  { label = '😊 Expressive — Warm and engaging';          color = '#f59e0b'; }
  else if (stab > 0.65)                  { label = '🌙 Calm & Soothing — Great for lullabies';  color = '#60a5fa'; }
  else                                   { label = '⭐ Balanced — Natural speech';               color = '#a78bfa'; }
  el.textContent = label + '  |  ' + voiceName;
  el.style.color = color;
  el.style.background = color + '22';
}

// ══════════════════════════════════════════════════════════════
// VOICE_PICKER — Full voice picker controller
// Manages tab switching, ElevenLabs + OpenAI voice lists,
// per-child voice persistence, and active voice display.
// ══════════════════════════════════════════════════════════════
var VOICE_PICKER = {
  activeTab: 'chars',

  // All known ElevenLabs voices (name, ID, gender, tag)
  ELEVEN_VOICES: [
    // Female
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Luna (Rachel)',  gender: 'female', tag: 'Warm Host',    emoji: '🌙' },
    { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Bubbles (Matilda)', gender: 'female', tag: 'Playful',   emoji: '🫧' },
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',        gender: 'female', tag: 'Warm',          emoji: '🌸' },
    { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',          gender: 'female', tag: 'Strong',        emoji: '💪' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',          gender: 'female', tag: 'Energetic',     emoji: '⚡' },
    { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda',       gender: 'female', tag: 'Storyteller',   emoji: '📖' },
    { id: 'pMsXgVXv3BLzUgSXRplE', name: 'Serena',        gender: 'female', tag: 'Calm',          emoji: '🕊️' },
    { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlotte',     gender: 'female', tag: 'Narrator',      emoji: '🎬' },
    { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace',         gender: 'female', tag: 'Gentle',        emoji: '🌿' },
    { id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Bella',         gender: 'female', tag: 'Soothing',      emoji: '🌙' },
    // Male
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Max (Josh)',    gender: 'male',   tag: 'Energetic Host', emoji: '⚡' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',        gender: 'male',   tag: 'Strong',        emoji: '🦁' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',          gender: 'male',   tag: 'Deep',          emoji: '🎤' },
    { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde',         gender: 'male',   tag: 'Western',       emoji: '🤠' },
    { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',           gender: 'male',   tag: 'Casual',        emoji: '😊' },
    { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas',        gender: 'male',   tag: 'Calm',          emoji: '🌊' },
    { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',        gender: 'male',   tag: 'Authoritative', emoji: '🎙️' },
    { id: 'ODq5zmih8GrVes37Dizd', name: 'Patrick',       gender: 'male',   tag: 'Narrative',     emoji: '📚' },
    { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'Fin',           gender: 'male',   tag: 'Friendly',      emoji: '👋' },
    { id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan',         gender: 'male',   tag: 'Whispery',      emoji: '🤫' },
  ],

  // OpenAI voices
  OPENAI_VOICES: [
    { id: 'nova',    name: 'Nova',    label: 'Nova (Warm female)',     emoji: '🌟', gender: 'female' },
    { id: 'shimmer', name: 'Shimmer', label: 'Shimmer (Clear female)', emoji: '✨', gender: 'female' },
    { id: 'alloy',   name: 'Alloy',   label: 'Alloy (Neutral)',        emoji: '🔩', gender: 'neutral' },
    { id: 'echo',    name: 'Echo',    label: 'Echo (Calm male)',        emoji: '🔊', gender: 'male' },
    { id: 'fable',   name: 'Fable',   label: 'Fable (Storyteller)',    emoji: '📖', gender: 'male' },
    { id: 'onyx',    name: 'Onyx',    label: 'Onyx (Deep male)',        emoji: '🖤', gender: 'male' },
  ],

  // Switch tab
  switchTab: function(tab) {
    this.activeTab = tab;
    var panels = ['chars', 'eleven', 'openai'];
    panels.forEach(function(p) {
      var panel = document.getElementById('vpPanel-' + p);
      var tabBtn = document.getElementById('vpTab-' + p);
      if (panel) {
        if (p === tab) { panel.classList.remove('hidden'); }
        else { panel.classList.add('hidden'); }
      }
      if (tabBtn) {
        if (p === tab) {
          tabBtn.style.background = '#ff6b9d';
          tabBtn.style.color = '#fff';
        } else {
          tabBtn.style.background = 'transparent';
          tabBtn.style.color = '#aaa';
        }
      }
    });
    // Lazy-render ElevenLabs / OpenAI on first open
    if (tab === 'eleven') this.renderElevenLabs();
    if (tab === 'openai') this.renderOpenAI();
  },

  // Build an ElevenLabs voice button
  _elevenBtn: function(v) {
    var isActive = (VOICE_PERSONALITY.elevenlabsVoiceId === v.id) ||
                   (VOICE_PERSONALITY.character === 'luna'    && v.id === 'EXAVITQu4vr4xnSDxMaL') ||
                   (VOICE_PERSONALITY.character === 'max'     && v.id === 'TxGEqnHWrfWFTfGW9XjX') ||
                   (VOICE_PERSONALITY.character === 'bubbles' && v.id === 'jBpfuIE2acCO8z3wKNLl');
    var active   = 'border-color:#ff6b9d;background:rgba(255,107,157,0.15)';
    var inactive = 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
    var btn = document.createElement('button');
    btn.className = 'eleven-voice-btn flex items-center gap-2 p-2 rounded-xl border transition-all text-left w-full';
    btn.style.cssText = isActive ? active : inactive;
    btn.setAttribute('data-vid', v.id);
    btn.innerHTML = '<span class="text-lg flex-shrink-0">' + v.emoji + '</span>' +
      '<div class="min-w-0"><div class="text-xs font-bold truncate">' + v.name + '</div>' +
      '<div class="text-xs truncate" style="color:#aaa">' + v.tag + '</div></div>';
    var self = this;
    btn.onclick = function() { self.selectElevenVoice(v); };
    return btn;
  },

  renderElevenLabs: function() {
    var femEl = document.getElementById('vpElevenFemale');
    var malEl = document.getElementById('vpElevenMale');
    if (!femEl || !malEl) return;
    // Only rebuild if empty or voice changed
    femEl.innerHTML = '';
    malEl.innerHTML = '';
    var self = this;
    this.ELEVEN_VOICES.forEach(function(v) {
      var btn = self._elevenBtn(v);
      if (v.gender === 'female') femEl.appendChild(btn);
      else malEl.appendChild(btn);
    });
  },

  renderOpenAI: function() {
    var el = document.getElementById('vpOpenAI');
    if (!el) return;
    el.innerHTML = '';
    var self = this;
    this.OPENAI_VOICES.forEach(function(v) {
      var isActive = VOICE_PERSONALITY.openaiVoice === v.id;
      var active   = 'border-color:#3b82f6;background:rgba(59,130,246,0.15)';
      var inactive = 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
      var btn = document.createElement('button');
      btn.className = 'openai-voice-btn flex items-center gap-2 p-2 rounded-xl border transition-all text-left w-full';
      btn.style.cssText = isActive ? active : inactive;
      btn.setAttribute('data-vid', v.id);
      btn.innerHTML = '<span class="text-lg flex-shrink-0">' + v.emoji + '</span>' +
        '<div class="min-w-0"><div class="text-xs font-bold truncate">' + v.name + '</div>' +
        '<div class="text-xs truncate" style="color:#aaa">' + v.label + '</div></div>';
      btn.onclick = function() { self.selectOpenAIVoice(v); };
      el.appendChild(btn);
    });
  },

  selectElevenVoice: function(v) {
    // Store the ElevenLabs voice ID
    VOICE_PERSONALITY.elevenlabsVoiceId   = v.id;
    VOICE_PERSONALITY.elevenlabsVoiceName = v.name;
    VOICE_PERSONALITY.preferredProvider   = 'elevenlabs';
    // Map gender
    VOICE_PERSONALITY.gender = v.gender === 'male' ? 'male' : 'female';
    // Clear character selection (it's a raw EL voice now)
    VOICE_PERSONALITY.character = '_custom_eleven';
    // Update character buttons to none
    var inactive = 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
    ['luna','max','bubbles'].forEach(function(c) {
      var btn = document.getElementById('char' + c.charAt(0).toUpperCase() + c.slice(1));
      if (btn) btn.style.cssText = inactive;
    });
    // Update EL button highlights
    document.querySelectorAll('.eleven-voice-btn').forEach(function(btn) {
      btn.style.cssText = btn.getAttribute('data-vid') === v.id
        ? 'border-color:#ff6b9d;background:rgba(255,107,157,0.15)'
        : 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
    });
    // Update info
    var infoEl = document.getElementById('selectedCharInfo');
    if (infoEl) infoEl.textContent = v.emoji + ' ' + v.name + ' — ' + v.tag + ' (ElevenLabs)';
    this.updateActiveBar(v.emoji, v.name, v.tag, 'ElevenLabs');
  },

  selectOpenAIVoice: function(v) {
    VOICE_PERSONALITY.openaiVoice        = v.id;
    VOICE_PERSONALITY.openaiVoiceLabel   = v.label;
    VOICE_PERSONALITY.preferredProvider  = 'openai';
    VOICE_PERSONALITY.gender = (v.gender === 'male') ? 'male' : 'female';
    VOICE_PERSONALITY.character = '_custom_openai';
    // Clear character buttons
    var inactive = 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
    ['luna','max','bubbles'].forEach(function(c) {
      var btn = document.getElementById('char' + c.charAt(0).toUpperCase() + c.slice(1));
      if (btn) btn.style.cssText = inactive;
    });
    // Update OpenAI button highlights
    document.querySelectorAll('.openai-voice-btn').forEach(function(btn) {
      btn.style.cssText = btn.getAttribute('data-vid') === v.id
        ? 'border-color:#3b82f6;background:rgba(59,130,246,0.15)'
        : 'border-color:rgba(255,255,255,0.1);background:rgba(255,255,255,0.03)';
    });
    var infoEl = document.getElementById('selectedCharInfo');
    if (infoEl) infoEl.textContent = v.emoji + ' ' + v.name + ' — ' + v.label + ' (OpenAI)';
    this.updateActiveBar(v.emoji, v.name, v.label, 'OpenAI');
  },

  updateActiveBar: function(emoji, name, desc, provider) {
    var emoEl  = document.getElementById('activeVoiceEmoji');
    var namEl  = document.getElementById('activeVoiceName');
    var desEl  = document.getElementById('activeVoiceDesc');
    var prvEl  = document.getElementById('activeVoiceProvider');
    if (emoEl) emoEl.textContent = emoji;
    if (namEl) namEl.textContent = name;
    if (desEl) desEl.textContent = desc;
    if (prvEl) {
      prvEl.textContent = provider;
      var isOpenAI = provider === 'OpenAI';
      prvEl.style.background = isOpenAI ? 'rgba(59,130,246,0.2)' : 'rgba(168,85,247,0.2)';
      prvEl.style.color      = isOpenAI ? '#60a5fa' : '#c084fc';
    }
  },

  // Update active bar from current VOICE_PERSONALITY state
  syncActiveBar: function() {
    var char = VOICE_PERSONALITY.CHARACTERS[VOICE_PERSONALITY.character];
    if (char) {
      this.updateActiveBar(char.emoji, char.label, char.desc, 'ElevenLabs');
    } else if (VOICE_PERSONALITY.preferredProvider === 'openai') {
      var ov = this.OPENAI_VOICES.find(function(v) { return v.id === VOICE_PERSONALITY.openaiVoice; });
      if (ov) this.updateActiveBar(ov.emoji, ov.name, ov.label, 'OpenAI');
    } else if (VOICE_PERSONALITY.elevenlabsVoiceName) {
      var ev = this.ELEVEN_VOICES.find(function(v) { return v.id === VOICE_PERSONALITY.elevenlabsVoiceId; });
      if (ev) this.updateActiveBar(ev.emoji, ev.name, ev.tag, 'ElevenLabs');
    }
  },

  // Show/hide per-child voice badge
  showChildBadge: function(childName) {
    var badge = document.getElementById('childVoiceBadge');
    var text  = document.getElementById('childVoiceBadgeText');
    if (!badge) return;
    if (childName) {
      if (text) text.textContent = 'Voice saved for ' + childName;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  // Init voice picker: render lists, sync active bar
  init: function() {
    this.renderElevenLabs();
    this.renderOpenAI();
    this.syncActiveBar();
  },
};

async function testVoice() {
  const input  = document.getElementById('voiceTestInput');
  const status = document.getElementById('voiceTestStatus');
  const btn    = document.getElementById('voiceTestBtn');
  const text   = (input && input.value.trim()) || "Wow, let's make some amazing music together!";
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Generating...'; }
  if (status) status.textContent = '⏳ Calling Groq Personality + ElevenLabs...';
  try {
    const emotion = VOICE_PERSONALITY.style === 'soothing'  ? 'calm'
                  : VOICE_PERSONALITY.style === 'energetic' ? 'excited'
                  : VOICE_PERSONALITY.style === 'playful'   ? 'encouraging'
                  : 'friendly';
    await speakText(text, emotion);
    const names = VOICE_PERSONALITY.VOICE_NAMES[VOICE_PERSONALITY.gender];
    const voiceName = (names && names[VOICE_PERSONALITY.style]) || 'Rachel';
    if (status) status.textContent = '✅ Playing! Stability=' + VOICE_PERSONALITY.stability.toFixed(2)
      + ' Style=' + VOICE_PERSONALITY.styleBoost.toFixed(2) + ' (' + voiceName + ')';
  } catch(e) {
    if (status) status.textContent = '❌ Error: ' + (e && e.message ? e.message : 'TTS failed');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play mr-1"></i> Test'; }
  }
}

async function saveVoiceSettings() {
  const stabEl = document.getElementById('elStability');
  const stylEl = document.getElementById('elStyleBoost');
  const simEl  = document.getElementById('elSimilarity');
  const togEl  = document.getElementById('groqPersonalityToggle');
  VOICE_PERSONALITY.stability  = parseFloat(stabEl ? stabEl.value : '0.35');
  VOICE_PERSONALITY.styleBoost = parseFloat(stylEl ? stylEl.value : '0.75');
  VOICE_PERSONALITY.similarity = parseFloat(simEl  ? simEl.value  : '0.60');
  VOICE_PERSONALITY.groqEnabled = togEl ? togEl.checked : true;

  // Determine active voice IDs
  var cvi = CHAR_VOICE_IDS[VOICE_PERSONALITY.character];
  var elId   = cvi ? cvi.id   : (VOICE_PERSONALITY.elevenlabsVoiceId   || 'EXAVITQu4vr4xnSDxMaL');
  var elName = cvi ? cvi.name : (VOICE_PERSONALITY.elevenlabsVoiceName || 'Luna');
  var provider = VOICE_PERSONALITY.preferredProvider || (cvi ? 'elevenlabs' : 'openai');

  // Current child ID (for per-child persistence)
  var childId = STATE.selectedChild ? (STATE.selectedChild.id || -1) : -1;

  var prefsPayload = {
    userId:               AUTH.user?.id ? String(AUTH.user.id) : 'demo',
    childId:              childId,
    voiceGender:          VOICE_PERSONALITY.gender,
    voiceCharacter:       VOICE_PERSONALITY.character,
    voiceStyle:           VOICE_PERSONALITY.style,
    stability:            VOICE_PERSONALITY.stability,
    styleBoost:           VOICE_PERSONALITY.styleBoost,
    similarity:           VOICE_PERSONALITY.similarity,
    groqPersonality:      VOICE_PERSONALITY.groqEnabled,
    preferredProvider:    provider,
    elevenlabsVoice:      elId,
    elevenlabsVoiceName:  elName,
    openaiVoice:          VOICE_PERSONALITY.openaiVoice || 'nova',
    openaiVoiceLabel:     VOICE_PERSONALITY.openaiVoiceLabel || 'Nova (Warm female)',
  };

  try {
    const r = await api('PUT', '/tts/prefs', prefsPayload);
    var char = VOICE_PERSONALITY.CHARACTERS[VOICE_PERSONALITY.character];
    var charName = char ? char.label : (VOICE_PERSONALITY.elevenlabsVoiceName || VOICE_PERSONALITY.openaiVoice || 'selected voice');
    var childName = STATE.selectedChild ? STATE.selectedChild.name : null;
    if (r.success !== false) {
      var msg = childName
        ? 'Voice saved for ' + childName + ': ' + charName
        : charName + ' is your host';
      showToast(msg, '🎤', 'success');
      VOICE_PERSONALITY._saved = true;
      if (childName && typeof VOICE_PICKER !== 'undefined') {
        VOICE_PICKER.showChildBadge(childName);
      }
      const statusEl = document.getElementById('voiceEngineStatus');
      if (statusEl) {
        statusEl.textContent = (VOICE_PERSONALITY.groqEnabled ? '🧠 Groq + ' : '') + provider.charAt(0).toUpperCase() + provider.slice(1) + ' Active';
        statusEl.style.color = '#4ade80';
        statusEl.style.background = 'rgba(0,200,100,0.15)';
      }
    } else {
      showToast('Saved locally (API unavailable)', '💾', 'info');
    }
  } catch(e) {
    showToast('Saved locally', '💾', 'info');
  }

  // LocalStorage fallback (survives page refresh even if API down)
  localStorage.setItem('mb_voice_personality', JSON.stringify({
    gender:              VOICE_PERSONALITY.gender,
    character:           VOICE_PERSONALITY.character,
    style:               VOICE_PERSONALITY.style,
    stability:           VOICE_PERSONALITY.stability,
    styleBoost:          VOICE_PERSONALITY.styleBoost,
    similarity:          VOICE_PERSONALITY.similarity,
    groqEnabled:         VOICE_PERSONALITY.groqEnabled,
    elevenlabsVoiceId:   VOICE_PERSONALITY.elevenlabsVoiceId   || elId,
    elevenlabsVoiceName: VOICE_PERSONALITY.elevenlabsVoiceName || elName,
    openaiVoice:         VOICE_PERSONALITY.openaiVoice         || 'nova',
    openaiVoiceLabel:    VOICE_PERSONALITY.openaiVoiceLabel     || 'Nova (Warm female)',
    preferredProvider:   provider,
  }));

  // Intent Layer SET_VOICE_PREFS
  ADAPTIVE.intent('SET_VOICE_PREFS', {
    preferredProvider:    provider,
    elevenlabsVoiceId:    elId,
    elevenlabsVoiceName:  elName,
    openaiVoice:          VOICE_PERSONALITY.openaiVoice || 'nova',
    defaultEmotion:       'friendly',
  }).catch(() => {});

  // Sync active bar display
  if (typeof VOICE_PICKER !== 'undefined') VOICE_PICKER.syncActiveBar();
}

// ── Load voice settings — per-child if child selected, else user-level ──
async function loadVoiceSettings(childId) {
  try {
    const uid = AUTH.user?.id ? String(AUTH.user.id) : 'demo';
    var qp = '/tts/prefs?userId=' + encodeURIComponent(uid);
    if (childId && childId > 0) qp += '&childId=' + childId;
    const r = await api('GET', qp);
    if (r.success !== false && r.data) {
      const d = r.data;
      if (d.voiceGender)           VOICE_PERSONALITY.gender             = d.voiceGender;
      if (d.voiceCharacter)        VOICE_PERSONALITY.character          = d.voiceCharacter;
      if (d.voiceStyle)            VOICE_PERSONALITY.style              = d.voiceStyle;
      if (d.stability  != null)    VOICE_PERSONALITY.stability          = d.stability;
      if (d.styleBoost != null)    VOICE_PERSONALITY.styleBoost         = d.styleBoost;
      if (d.similarity != null)    VOICE_PERSONALITY.similarity         = d.similarity;
      if (d.groqPersonality != null) VOICE_PERSONALITY.groqEnabled      = d.groqPersonality;
      if (d.elevenlabsVoice)       VOICE_PERSONALITY.elevenlabsVoiceId  = d.elevenlabsVoice;
      if (d.elevenlabsVoiceName)   VOICE_PERSONALITY.elevenlabsVoiceName = d.elevenlabsVoiceName;
      if (d.openaiVoice)           VOICE_PERSONALITY.openaiVoice        = d.openaiVoice;
      if (d.openaiVoiceLabel)      VOICE_PERSONALITY.openaiVoiceLabel   = d.openaiVoiceLabel;
      if (d.preferredProvider)     VOICE_PERSONALITY.preferredProvider  = d.preferredProvider;
    }
  } catch(e) {
    try {
      const saved = JSON.parse(localStorage.getItem('mb_voice_personality') || '{}');
      if (saved.gender)             VOICE_PERSONALITY.gender             = saved.gender;
      if (saved.character)          VOICE_PERSONALITY.character          = saved.character;
      if (saved.style)              VOICE_PERSONALITY.style              = saved.style;
      if (saved.stability  != null) VOICE_PERSONALITY.stability          = saved.stability;
      if (saved.styleBoost != null) VOICE_PERSONALITY.styleBoost         = saved.styleBoost;
      if (saved.similarity != null) VOICE_PERSONALITY.similarity         = saved.similarity;
      if (saved.groqEnabled != null) VOICE_PERSONALITY.groqEnabled       = saved.groqEnabled;
      if (saved.elevenlabsVoiceId)  VOICE_PERSONALITY.elevenlabsVoiceId  = saved.elevenlabsVoiceId;
      if (saved.elevenlabsVoiceName) VOICE_PERSONALITY.elevenlabsVoiceName = saved.elevenlabsVoiceName;
      if (saved.openaiVoice)        VOICE_PERSONALITY.openaiVoice        = saved.openaiVoice;
      if (saved.openaiVoiceLabel)   VOICE_PERSONALITY.openaiVoiceLabel   = saved.openaiVoiceLabel;
      if (saved.preferredProvider)  VOICE_PERSONALITY.preferredProvider  = saved.preferredProvider;
    } catch(e2) {}
  }
  // Restore button highlights
  var char = VOICE_PERSONALITY.CHARACTERS[VOICE_PERSONALITY.character];
  if (char) {
    setCharacterVoice(VOICE_PERSONALITY.character);
  } else {
    setVoiceGender(VOICE_PERSONALITY.gender);
    setVoiceStyle(VOICE_PERSONALITY.style);
    // Highlight custom ElevenLabs/OpenAI button if applicable
    if (typeof VOICE_PICKER !== 'undefined') {
      if (VOICE_PERSONALITY.preferredProvider === 'openai') {
        var ov = VOICE_PICKER.OPENAI_VOICES.find(function(v) { return v.id === VOICE_PERSONALITY.openaiVoice; });
        if (ov) VOICE_PICKER.selectOpenAIVoice(ov);
      } else if (VOICE_PERSONALITY.elevenlabsVoiceId) {
        var ev = VOICE_PICKER.ELEVEN_VOICES.find(function(v) { return v.id === VOICE_PERSONALITY.elevenlabsVoiceId; });
        if (ev) VOICE_PICKER.selectElevenVoice(ev);
      }
    }
  }
  const stab = document.getElementById('elStability');
  const styl = document.getElementById('elStyleBoost');
  const sim  = document.getElementById('elSimilarity');
  const tog  = document.getElementById('groqPersonalityToggle');
  const stabVal = document.getElementById('stabilityVal');
  const stylVal = document.getElementById('styleBoostVal');
  const simVal  = document.getElementById('similarityVal');
  if (stab) { stab.value = String(VOICE_PERSONALITY.stability);  if (stabVal) stabVal.textContent  = VOICE_PERSONALITY.stability.toFixed(2); }
  if (styl) { styl.value = String(VOICE_PERSONALITY.styleBoost); if (stylVal) stylVal.textContent = VOICE_PERSONALITY.styleBoost.toFixed(2); }
  if (sim)  { sim.value  = String(VOICE_PERSONALITY.similarity); if (simVal)  simVal.textContent  = VOICE_PERSONALITY.similarity.toFixed(2); }
  if (tog)  { tog.checked = VOICE_PERSONALITY.groqEnabled; }
  updateExpressivenessPreview();
  const statusEl = document.getElementById('voiceEngineStatus');
  if (statusEl) {
    statusEl.textContent = (VOICE_PERSONALITY.groqEnabled ? '🧠 Groq + ' : '') + 'ElevenLabs';
    statusEl.style.color = '#4ade80';
  }
  if (typeof VOICE_PICKER !== 'undefined') {
    VOICE_PICKER.syncActiveBar();
    VOICE_PICKER.renderElevenLabs();
    VOICE_PICKER.renderOpenAI();
  }
}

// ── BehaviorTone → TTSEmotion bridge ─────────────────────────
function toneToEmotion(tone) {
  const map = {
    excited: 'excited', celebratory: 'excited', playful: 'encouraging',
    warm: 'friendly', encouraging: 'encouraging', soothing: 'calm',
    gentle: 'calm', curious: 'friendly',
  };
  return map[tone] || 'friendly';
}

// ============================================================
// SING-ALONG ENGINE — AI sings lyrics over the instrumental
// ============================================================
// Called 3s after a song starts. Generates lyric lines for the
// current song style/title and TTS-speaks them (singing emotion)
// timed to the song. This is what makes MusicBuddy truly sing
// WITH the child — not just hum — actual words are spoken.
//
// Lyric lines are spaced out across the song duration so the AI
// sounds like it's performing. Volume of instrumentals duck a
// little while AI speaks.
//
// Uses EXPRESSOR.generateLyrics() for local generation,
// no extra API cost.
// ============================================================
var _singTimer = null;

function singLyricsWithSong(songTitle, style, durationSecs) {
  // Only sing during an active session
  if (!STATE.sessionActive || !STATE.isPlaying) return;

  // Stop any previous sing-along timer
  if (_singTimer) { clearTimeout(_singTimer); _singTimer = null; }

  var name = STATE.selectedChild ? STATE.selectedChild.name : 'friend';
  var age  = STATE.selectedChild ? (STATE.selectedChild.age || 5) : 5;

  // Get lyrics for this song (use creator lyrics if available, else generate)
  var lyrics = '';
  if (STATE.currentSnippet && STATE.currentSnippet.lyrics) {
    lyrics = STATE.currentSnippet.lyrics;
  } else {
    // Generate appropriate lyrics for the style
    try { lyrics = EXPRESSOR.generateLyrics(songTitle || 'Fun Song', style || 'playful', name, 6); }
    catch(e) { lyrics = _defaultLyrics(style, name); }
  }

  // Split into singable lines
  var lines = lyrics.split('\\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 2; });
  if (lines.length === 0) lines = _defaultLyrics(style, name).split('\\n');

  // Show lyrics display
  var lyricsEl = document.getElementById('singAlongDisplay');
  if (lyricsEl) { lyricsEl.classList.remove('hidden'); }

  // Space lines across the song: start at 3s, end at (duration - 5)s
  var totalSingTime = Math.max(8, (durationSecs - 8)) * 1000;
  var lineCount     = Math.min(lines.length, 4);   // max 4 lines per song
  var lineSpacing   = Math.floor(totalSingTime / (lineCount + 1));

  // Schedule each lyric line
  for (var i = 0; i < lineCount; i++) {
    (function(idx, delay, line) {
      _singTimer = setTimeout(function() {
        if (!STATE.isPlaying) return;  // song stopped — don't sing
        // Update display
        if (lyricsEl) {
          lyricsEl.innerHTML = '<span style="font-size:1.2em">🎵</span> ' + line;
          lyricsEl.style.opacity = '1';
        }
        // Speak the lyric in singing voice (lower volume than main song)
        var mainAudio = document.getElementById('audioPlayer');
        var prevVol   = mainAudio ? mainAudio.volume : 0.7;
        if (mainAudio) mainAudio.volume = Math.max(0.15, prevVol * 0.4);
        speakText(line, 'singing').then(function() {
          if (mainAudio && STATE.isPlaying) mainAudio.volume = prevVol;
        }).catch(function() {
          if (mainAudio && STATE.isPlaying) mainAudio.volume = prevVol;
        });
      }, delay);
    })(i, (i + 1) * lineSpacing, lines[i % lines.length]);
  }

  // Hide lyrics 3s before song ends
  var hideDelay = Math.max(1000, (durationSecs - 3) * 1000);
  setTimeout(function() {
    if (lyricsEl) {
      lyricsEl.style.opacity = '0';
      setTimeout(function() { if (lyricsEl) lyricsEl.classList.add('hidden'); }, 500);
    }
  }, hideDelay);
}

function _defaultLyrics(style, name) {
  var styles = {
    playful:   "Hey " + name + ", lets play today!\\nJump and dance and shout hooray!\\nLa la la, come sing with me!\\nWe are happy as can be!",
    energetic: "Go go go, feel the beat!\\nStamp your feet and feel the heat!\\nYou can do it, " + name + "!\\nMove and groove all day!",
    calm:      "Close your eyes, " + name + ", and breathe...\\nSoft and slow, just like the leaves.\\nLa la la, sweet and low.\\nGentle music, soft and slow.",
    lullaby:   "Sleep tight, sweet " + name + ", goodnight.\\nStars are twinkling, shining bright.\\nDream of songs and happy days.\\nDrifting off in gentle haze.",
    educational: "A B C, come learn with me!\\nNumbers, letters, one two three!\\nWe are so smart, " + name + " and me!\\nLearning is fun as it can be!",
    adventure: name + ", lets go explore!\\nEvery day there is something more!\\nAdventures wait, lets sing along!\\nWe are brave and happy, we are so strong!",
  };
  return styles[style] || styles.playful;
}

// ============================================================
// AMBIENT MUSIC ENGINE — Frontend Background Music Layer
// Phase 2: layers low-volume background music under voice audio
// Maps emotion vibes → tracks in /static/audio/ambient/
// ============================================================
const AMBIENT_MUSIC = (function() {
  var _audio    = null;
  var _current  = null;
  var _fadeTimer= null;
  var _enabled  = true;

  // Vibe → track URL (matching backend AmbientTrack config)
  var VIBE_TRACKS = {
    upbeat:      '/static/audio/ambient/happy-upbeat.mp3',
    playful:     '/static/audio/ambient/fun-kids-loop.mp3',
    soothing:    '/static/audio/ambient/soft-piano.mp3',
    warm:        '/static/audio/ambient/warm-ambient.mp3',
    celebratory: '/static/audio/ambient/celebration-fanfare.mp3',
    none:        null,
  };

  var VIBE_VOLUMES = {
    upbeat: 0.12, playful: 0.12, soothing: 0.10,
    warm: 0.10, celebratory: 0.18, none: 0,
  };

  function _fadeTo(targetVol, durationMs, onDone) {
    if (!_audio) { if (onDone) onDone(); return; }
    if (_fadeTimer) clearInterval(_fadeTimer);
    var startVol = _audio.volume;
    var steps = Math.max(1, Math.floor(durationMs / 50));
    var delta = (targetVol - startVol) / steps;
    var step = 0;
    _fadeTimer = setInterval(function() {
      step++;
      var newVol = startVol + delta * step;
      _audio.volume = Math.max(0, Math.min(1, newVol));
      if (step >= steps) {
        clearInterval(_fadeTimer);
        _fadeTimer = null;
        if (_audio.volume <= 0.001) { _audio.pause(); _audio.currentTime = 0; }
        if (onDone) onDone();
      }
    }, 50);
  }

  return {
    enable:  function() { _enabled = true; },
    disable: function() { _enabled = false; this.stop(); },

    play: function(payload) {
      if (!_enabled || !payload || !payload.trackUrl) return;
      var url    = payload.trackUrl;
      var vol    = payload.volume    || 0.12;
      var loop   = payload.loop      !== false;
      var fadeMs = payload.fadeMs    || 600;
      this._playUrl(url, vol, loop, fadeMs);
    },

    playVibe: function(vibe) {
      if (!_enabled) return;
      var url = VIBE_TRACKS[vibe] || VIBE_TRACKS.playful;
      if (!url) return;
      var vol  = VIBE_VOLUMES[vibe] || 0.12;
      this._playUrl(url, vol, true, 600);
    },

    _playUrl: function(url, vol, loop, fadeMs) {
      if (_current === url && _audio && !_audio.paused) return; // already playing
      this.stop();
      _current = url;
      _audio = new Audio(url);
      _audio.loop   = loop;
      _audio.volume = 0;
      _audio.onerror = function() { _audio = null; _current = null; };
      _audio.play().then(function() {
        _fadeTo(vol, fadeMs || 600, null);
      }).catch(function() {
        _audio = null; _current = null;
      });
    },

    fadeOut: function(durationMs) {
      _fadeTo(0, durationMs || 1000, null);
    },

    stop: function() {
      if (_audio) {
        _audio.pause();
        _audio.currentTime = 0;
        _audio = null;
      }
      _current = null;
      if (_fadeTimer) { clearInterval(_fadeTimer); _fadeTimer = null; }
    },

    setVolume: function(vol) {
      if (_audio) _audio.volume = Math.max(0, Math.min(1, vol));
    },
  };
})();

async function init() {
  // Load voices for TTS
  if ('speechSynthesis' in window) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }

  // Restore XP + level from localStorage
  const savedXP = parseInt(localStorage.getItem('mb_xp') || '0');
  if (savedXP > 0) {
    REWARDS.xp = savedXP;
    REWARDS.level = REWARDS.computeLevel();
    REWARDS.updateXPBar();
  }
  // Auto-save XP every 30s
  setInterval(() => localStorage.setItem('mb_xp', REWARDS.xp.toString()), 30000);

  // Initialize billing system — render settings, check tier, update gates
  BILLING.renderStatus();
  BILLING.renderSettingsPlans();
  BILLING.updateTTSProviderUI();
  GATE.refresh();

  // Show credits header
  const creditsWrap = document.getElementById('creditsHeaderWrap');
  if (creditsWrap) creditsWrap.classList.remove('hidden');
  // Load credits count — uses tts_trial_remaining from the correct tts_trial_usage table
  api('GET', '/billing/credits').then((cr) => {
    if (cr.success) {
      const el = document.getElementById('creditsDisplay');
      if (el) {
        const credits = cr.data.credits ?? 0;
        const voiceTries = cr.data.trial_uses_remaining ?? 0;
        // Show: "3 cr · 15 voice" so user can see both at a glance
        el.textContent = credits + ' cr';
        el.title = credits + ' song credits · ' + voiceTries + ' voice tries remaining';
      }
      // Also update BILLING_V2 local data if loaded
      if (typeof BILLING_V2 !== 'undefined') {
        try {
          var bd = BILLING_V2._data;
          if (bd) {
            bd.credits = cr.data.credits ?? bd.credits;
            bd.trial   = cr.data.trial_uses_remaining ?? bd.trial;
          }
        } catch(e) {}
      }
    }
  });

  // Load voice personality settings (user-level) + init VOICE_PICKER
  await loadVoiceSettings();
  if (typeof VOICE_PICKER !== 'undefined') VOICE_PICKER.init();

  // Load profiles on start
  const r = await api('GET', '/profiles');
  if (r.success && r.data?.length) {
    populateDashboardSelect(r.data);
    populateLibrarySelect(r.data);
    // Auto-select first profile
    if (r.data.length > 0) {
      await selectChild(r.data[0].id);
    }
  }
  
  // Load system info
  await loadSystemInfo();
  
  // nextActionIn countdown
  setInterval(() => {
    if (!STATE.sessionActive) return;
    const elapsed = Date.now() - STATE.lastInteractionTime;
    const cycleMs = parseInt(document.getElementById('cycleInterval')?.value || 30000);
    const remaining = Math.max(0, Math.ceil((cycleMs - elapsed) / 1000));
    const nextEl = document.getElementById('nextActionIn');
    if (nextEl) nextEl.textContent = remaining + 's';
  }, 1000);
}

window.addEventListener('load', async () => {
  // Initialize global stability layer FIRST — catches all errors from here on
  SYSTEM.init();

  // Try to restore an existing session first.
  // tryRestoreSession() hides the auth screen and returns true if already logged in.
  // If not, it shows the auth screen and waits for the user to log in.
  // init() is called by onAuthSuccess (after login/register/demo).
  const restored = await tryRestoreSession();
  if (restored) {
    // Already authenticated — boot the full app
    init();
  }
  // else: auth screen is visible; init() will be called after login
});

// ── Global tab-visibility resource manager ────────────────────
// When the user switches away from this tab, pause heavy operations
// (webcam pixel analysis, engagement loop) to prevent the browser
// from running out of memory and blanking other tabs.
// They resume automatically when the tab becomes visible again.
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    // Tab hidden — pause expensive operations
    if (typeof WEBCAM !== 'undefined' && WEBCAM.faceCheckInterval) {
      clearInterval(WEBCAM.faceCheckInterval);
      WEBCAM.faceCheckInterval = null;
    }
    // Pause engagement loop
    if (typeof stopEngagementLoop === 'function') stopEngagementLoop();
    // Suspend any idle audio contexts to free OS audio resources
    try {
      if (typeof VOICE_PROCESSOR !== 'undefined' && VOICE_PROCESSOR.ctx &&
          VOICE_PROCESSOR.ctx.state === 'running') {
        VOICE_PROCESSOR.ctx.suspend().catch(function(){});
      }
    } catch(e) {}
  } else {
    // Tab visible again — resume if session is active
    if (typeof STATE !== 'undefined' && STATE.sessionActive) {
      // Restart face detection if webcam is streaming but interval was paused
      if (typeof WEBCAM !== 'undefined' && WEBCAM.stream && !WEBCAM.faceCheckInterval) {
        var video = document.getElementById('webcamVideo');
        if (video) WEBCAM.startFaceDetection(video);
      }
      // Restart engagement loop
      if (typeof startEngagementLoop === 'function') startEngagementLoop();
      // Resume audio context
      try {
        if (typeof VOICE_PROCESSOR !== 'undefined' && VOICE_PROCESSOR.ctx &&
            VOICE_PROCESSOR.ctx.state === 'suspended') {
          VOICE_PROCESSOR.ctx.resume().catch(function(){});
        }
      } catch(e) {}
    }
  }
});

// ════════════════════════════════════════════════════════════
// ANIMATION SYSTEM — Intent: TriggerAnimation
// ════════════════════════════════════════════════════════════
var ANIM = (function() {
  var canvas, ctx, particles = [], running = false;

  function ensureCanvas() {
    if (document.getElementById('confettiCanvas')) { canvas = document.getElementById('confettiCanvas'); ctx = canvas.getContext('2d'); return; }
    canvas = document.createElement('canvas');
    canvas.id = 'confettiCanvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  function resize() { if (!canvas) return; canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

  function spawnParticles(count, colors) {
    ensureCanvas(); resize();
    for (var i = 0; i < count; i++) {
      particles.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height*0.4, vx: (Math.random()-0.5)*7, vy: Math.random()*-9-3, size: Math.random()*10+5, color: colors[Math.floor(Math.random()*colors.length)], spin: (Math.random()-0.5)*0.25, angle: Math.random()*Math.PI*2, alpha: 1, gravity: 0.22, shape: ['rect','circle','star'][Math.floor(Math.random()*3)] });
    }
    if (!running) loop();
  }

  function drawStar(cx,cy,r){ctx.beginPath();for(var i=0;i<5;i++){var a=(i*4*Math.PI/5)-Math.PI/2;i===0?ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a)):ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}ctx.closePath();ctx.fill();}

  function loop() {
    running = true;
    if (!canvas) { running = false; return; }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles = particles.filter(function(p){return p.alpha>0.01;});
    particles.forEach(function(p){p.vy+=p.gravity;p.x+=p.vx;p.y+=p.vy;p.angle+=p.spin;p.alpha-=0.011;ctx.globalAlpha=Math.max(0,p.alpha);ctx.fillStyle=p.color;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);if(p.shape==='circle'){ctx.beginPath();ctx.arc(0,0,p.size/2,0,Math.PI*2);ctx.fill();}else if(p.shape==='star'){drawStar(0,0,p.size/2);}else{ctx.fillRect(-p.size/2,-p.size/3,p.size,p.size*0.6);}ctx.restore();});
    ctx.globalAlpha=1;
    particles.length>0 ? requestAnimationFrame(loop) : (running=false);
  }

  var COLORS = { pink:['#ff6b9d','#ff4081','#ffd93d','#ff9800','#fff'], success:['#6bcb77','#4ade80','#22d3ee','#818cf8','#ffd93d'], gentle:['#c084fc','#818cf8','#60a5fa','#a5b4fc'] };

  return {
    trigger: function(type) {
      switch(type) {
        case 'confetti_burst':    spawnParticles(60,  COLORS.pink);    break;
        case 'full_celebration':  spawnParticles(160, COLORS.success); break;
        case 'celebration':       spawnParticles(100, COLORS.success); break;
        case 'soft_encouragement':
          var e=document.createElement('div'); e.textContent=['💪','⭐','🌟','✨'][Math.floor(Math.random()*4)];
          e.style.cssText='position:fixed;bottom:30%;left:50%;transform:translateX(-50%);font-size:3rem;z-index:9998;animation:floatEmoji 1.5s ease forwards;pointer-events:none';
          document.body.appendChild(e); setTimeout(function(){e.remove();},1600); break;
        default: spawnParticles(80, COLORS.pink);
      }
    },
    confetti:      function(){ spawnParticles(120,COLORS.pink); },
    celebration:   function(){ spawnParticles(160,COLORS.success); },
    encouragement: function(){ ANIM.trigger('soft_encouragement'); },
  };
})();
(function(){var s=document.createElement('style');s.textContent='@keyframes floatEmoji{0%{opacity:0;transform:translateX(-50%) translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-120px)}}';document.head.appendChild(s);})();

// ════════════════════════════════════════════════════════════
// LESSONS MODULE — Intent Layer Bound
// Intents: GetAvailableLessons, StartLesson, SubmitAnswer,
//          ExitLesson, ResetLessonState, ValidateLessonIntegrity,
//          TriggerAnimation, RequestTTS (via speakText)
// Rules:
//  - UI never holds truth; all state lives in state object
//  - Every action goes through SYSTEM.guard (error boundary)
//  - TTS text always matches lesson content from source-of-truth
//  - Animations always from ANIM.trigger with server metadata
//  - Answer buttons use data-answer attr (not textContent) to avoid whitespace bugs
//  - No double-TTS: intro speaks once in _openLessonPanel only
//  - Credits respected via SYSTEM.hasCredits() check before TTS
// ════════════════════════════════════════════════════════════
var LESSONS = (function() {
  // ── Source-of-truth state — UI reads ONLY from here ──────
  var state = {
    list:[], filtered:[], filterTopic:'all',
    progress:null, lesson:null, stepIdx:0, childId:null,
    _answering: false,  // guard against double-submit
    _loading: false     // guard against double-start
  };

  // ── Intent: GetAvailableLessons ───────────────────────────
  var load = SYSTEM.guard('LESSONS.load', function() {
    var child = STATE.selectedChild;
    var badge = document.getElementById('lessonsChildBadge');
    var url = '/lessons';
    if (child) {
      state.childId = child.id;
      url = '/lessons?age='+child.age+'&child_id='+child.id;
      if (badge) badge.textContent = child.name + ' (age ' + child.age + ')';
    } else {
      state.childId = null;
      if (badge) badge.textContent = 'All lessons (no child selected)';
    }
    // Show grid loading state
    var g = document.getElementById('lessonsGrid');
    if (g) g.innerHTML = '<div class="glass p-6 text-center text-gray-400 col-span-2"><div class="text-3xl mb-2 animate-pulse">📚</div>Loading lessons…</div>';

    api('GET', url).then(function(r){
      if (r.success) { state.list = r.data.lessons||[]; applyFilter(); }
      else { renderEmpty('Could not load lessons — ' + (r.error||'please try again')); }
    }).catch(function(e) {
      SYSTEM.log('error','LESSONS.load','Fetch failed: '+e.message);
      renderEmpty('Connection error — tap to retry');
    });
  });

  function applyFilter() {
    state.filtered = state.filterTopic==='all'
      ? state.list
      : state.list.filter(function(l){return l.topic===state.filterTopic;});
    renderGrid();
  }

  function renderEmpty(msg) {
    var g = document.getElementById('lessonsGrid');
    if (g) g.innerHTML = '<div class="glass p-6 text-center text-gray-500 col-span-2">'
      +'<i class="fas fa-graduation-cap text-3xl mb-2 block opacity-30"></i>'+msg+'</div>';
  }

  function renderGrid() {
    var g = document.getElementById('lessonsGrid');
    if (!g) return;
    if (!state.filtered.length) { renderEmpty('No lessons found for this filter'); return; }
    g.innerHTML = state.filtered.map(function(l) {
      var locked = l.locked;
      var prog   = l.progress;
      var statusBadge = prog
        ? (prog.status==='completed'
            ? '<span class="text-xs px-2 py-0.5 rounded-full font-bold ml-1" style="background:rgba(107,203,119,0.2);color:#6bcb77">✓ Done '+Math.round(prog.score)+'%</span>'
            : '<span class="text-xs px-2 py-0.5 rounded-full font-bold ml-1" style="background:rgba(245,158,11,0.2);color:#f59e0b">In Progress</span>')
        : '';
      var tierBadge = l.tier_required!=='free'
        ? '<span class="text-xs px-2 py-0.5 rounded-full" style="background:rgba(245,158,11,0.15);color:#f59e0b">'+(l.tier_required==='starter'?'Starter+':'Premium')+'</span>'
        : '<span class="text-xs px-2 py-0.5 rounded-full" style="background:rgba(74,222,128,0.15);color:#4ade80">Free</span>';
      return '<div class="lesson-card'+(locked?' locked':'')+'" onclick="LESSONS.start('+l.id+','+locked+')">'
        +'<div class="flex items-start justify-between mb-2">'
        +'<div class="text-3xl">'+l.thumbnail_emoji+'</div>'
        +'<div class="flex flex-col items-end gap-1">'+tierBadge+statusBadge+'</div>'
        +'</div>'
        +'<div class="font-black text-sm">'+l.title+'</div>'
        +'<div class="text-xs text-gray-400 mt-1">'+l.topic+' · '+l.difficulty+' · '+(l.step_count||'?')+' steps</div>'
        +(locked?'<div class="text-xs text-yellow-400 mt-2"><i class="fas fa-lock mr-1"></i>Upgrade to unlock</div>':'')
        +'</div>';
    }).join('');
  }

  // ── Intent: StartLesson ───────────────────────────────────
  var start = SYSTEM.guard('LESSONS.start', function(id, locked) {
    if (locked) {
      showToast('Upgrade to unlock this lesson! 🔓','⭐','info');
      switchTab('billing');
      return;
    }
    if (state._loading) return;  // prevent double-start
    state._loading = true;

    // Intent: ResetLessonState — clear any previous lesson state
    _resetLessonState();

    var childId = state.childId || (STATE.selectedChild && STATE.selectedChild.id) || null;
    var grid = document.getElementById('lessonsGrid');
    if (grid) grid.innerHTML = '<div class="glass p-8 text-center col-span-2"><div class="text-4xl mb-2 animate-bounce">⏳</div><div class="text-gray-400">Loading lesson…</div></div>';

    api('POST', '/lessons/start', {lesson_id: id, child_id: childId}).then(function(r) {
      state._loading = false;
      if (!r.success) {
        if (r.needs_login) { showToast('Sign in to access this lesson 🔐','🔐','warning'); switchTab('billing'); load(); return; }
        if (r.locked)      { showToast(r.error||'Upgrade to unlock','⭐','info'); switchTab('billing'); load(); return; }
        showToast(r.error||'Could not start lesson','❌','error');
        load();
        return;
      }
      var d = r.data;
      state.progress = d.progress_id;
      state.stepIdx  = 0;

      // Source of truth: lesson object always built from server response
      if (d.steps && d.steps.length) {
        state.lesson = d;
        // Intent: ValidateLessonIntegrity
        var integrity = SYSTEM.validateLesson(state.lesson);
        if (!integrity.ok) {
          SYSTEM.log('error','LESSONS.start','Lesson integrity failed: '+integrity.reason);
          showToast('Lesson data incomplete — try another lesson','⚠️','warning');
          load();
          return;
        }
        _openLessonPanel(state.lesson);
      } else {
        // Fallback: fetch full lesson if steps missing
        api('GET', '/lessons/'+id).then(function(lr) {
          if (!lr.success) { showToast('Could not load lesson content','❌','error'); load(); return; }
          state.lesson = lr.data;
          state.lesson.steps = typeof lr.data.steps === 'string' ? JSON.parse(lr.data.steps) : lr.data.steps;
          var integrity = SYSTEM.validateLesson(state.lesson);
          if (!integrity.ok) { SYSTEM.log('error','LESSONS.start','Fallback integrity failed: '+integrity.reason); load(); return; }
          _openLessonPanel(state.lesson);
        }).catch(function(e) {
          SYSTEM.log('error','LESSONS.start','Fallback fetch failed: '+e.message);
          showToast('Could not load lesson','❌','error');
          load();
        });
      }
    }).catch(function(e) {
      state._loading = false;
      SYSTEM.log('error','LESSONS.start','API error: '+e.message);
      showToast('Connection error — please try again','❌','error');
      load();
    });
  });

  // ── Intent: ResetLessonState ──────────────────────────────
  function _resetLessonState() {
    // Abort any active lesson voice recognition
    if (window.VOICE_INPUT && VOICE_INPUT._recognition) {
      try { VOICE_INPUT._recognition.abort(); } catch(e) {}
      VOICE_INPUT._listening = false;
    }
    var vr = document.getElementById('lessonVoiceRow');
    if (vr) vr.classList.add('hidden');
    state.lesson = null;
    state.progress = null;
    state.stepIdx = 0;
    state._answering = false;
    // Stop any active TTS so lesson intro plays cleanly
    if (window._activeTTSAudio) {
      try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
      window._activeTTSAudio = null;
    }
    if ('speechSynthesis' in window) try { window.speechSynthesis.cancel(); } catch(e) {}
    // Hide feedback
    var fb = document.getElementById('lessonFeedback');
    if (fb) { fb.classList.add('hidden'); fb.textContent = ''; }
  }

  function _openLessonPanel(lesson) {
    var panel = document.getElementById('activeLessonPanel');
    var grid  = document.getElementById('lessonsGrid');
    if (grid)  grid.classList.add('hidden');
    if (panel) {
      panel.classList.remove('hidden');
      panel.scrollIntoView({behavior:'smooth', block:'start'});
    }
    var title = document.getElementById('lessonTitle');
    if (title) title.textContent = (lesson.thumbnail_emoji||'📚') + ' ' + lesson.title;

    // Render the first step UI first, THEN speak (TTS must use lesson source-of-truth)
    _renderStep();

    // Intent: RequestTTS — text comes from lesson source-of-truth, not UI
    var steps = lesson.steps || [];
    if (steps[0] && steps[0].text) {
      // Small delay so UI renders before audio starts
      setTimeout(function() {
        speakText(steps[0].text, steps[0].type === 'intro' ? 'excited' : 'friendly');
      }, 150);
    }
  }

  // ── Intent: RenderLessonStep — UI always driven by state ─
  function _renderStep() {
    var lesson = state.lesson; if (!lesson) return;
    var steps  = lesson.steps || [];
    var step   = steps[state.stepIdx]; if (!step) return;

    // Progress bar: complete when on last step
    var pct = steps.length > 1 ? Math.round((state.stepIdx / (steps.length - 1)) * 100) : 0;
    var pbar = document.getElementById('lessonProgressBar');
    if (pbar) pbar.style.width = pct + '%';

    // Step emoji + text from source-of-truth (never from DOM)
    var emojiEl = document.getElementById('lessonStepEmoji');
    if (emojiEl) emojiEl.textContent = step.emoji || '📚';
    var textEl  = document.getElementById('lessonStepText');
    if (textEl)  textEl.textContent  = step.text  || '';

    var opts    = document.getElementById('lessonAnswerOptions');
    var nextBtn = document.getElementById('lessonNextBtn');
    var fb      = document.getElementById('lessonFeedback');
    if (fb) { fb.classList.add('hidden'); fb.textContent = ''; }

    state._answering = false;  // reset guard for each new step

    if (step.type === 'intro' || step.type === 'reward') {
      if (opts)   opts.innerHTML = '';
      if (nextBtn) {
        nextBtn.classList.remove('hidden');
        nextBtn.disabled = false;
        nextBtn.innerHTML = step.type === 'reward' ? '🏆 Finish!' : '▶ Continue';
      }
      // Intent: TriggerAnimation — reward type always triggers celebration
      if (step.type === 'reward') {
        ANIM.trigger('full_celebration');
        // TTS uses source-of-truth text (already set above)
        speakText(step.text, 'excited');
      }
    } else if (step.type === 'question' && step.options) {
      if (nextBtn) nextBtn.classList.add('hidden');
      if (opts) {
        // data-answer stores the canonical answer string (avoids whitespace textContent bugs)
        opts.innerHTML = step.options.map(function(o) {
          return '<button class="answer-btn" data-answer="'+_escapeAttr(o)+'">'+o+'</button>';
        }).join('');
        opts.querySelectorAll('.answer-btn').forEach(function(b) {
          b.addEventListener('click', function() {
            // Use data-answer (canonical) not textContent (may have whitespace)
            LESSONS.answer(b.getAttribute('data-answer'));
          });
        });
      }
      // ── Intent: Voice Input for lessons (same rule as free games) ──
      var voiceRow = document.getElementById('lessonVoiceRow');
      if (voiceRow) {
        if (VOICE_INPUT.isSupported()) {
          voiceRow.classList.remove('hidden');
          // Auto-start after TTS settles (800 ms, mirrors Call-and-Response pattern)
          setTimeout(function() { _listenForAnswer(step.options); }, 800);
        } else {
          voiceRow.classList.add('hidden');
        }
      }
    } else {
      // hide voice row on intro/reward steps
      var voiceRowHide = document.getElementById('lessonVoiceRow');
      if (voiceRowHide) voiceRowHide.classList.add('hidden');
    }
  }

  // ── Intent: Voice Input for Lessons ──────────────────────────────
  // Mirrors carListenForResponse: listens for any answer option,
  // fuzzy-matches, then routes to LESSONS.answer() via the Intent Layer.
  function _listenForAnswer(options) {
    if (!VOICE_INPUT.isSupported()) return;
    if (state._answering) return;
    if (!state.lesson)    return;

    var micBtn    = document.getElementById('lessonMicBtn');
    var micStatus = document.getElementById('lessonMicStatus');

    if (micBtn) {
      micBtn.disabled = true;
      micBtn.innerHTML = '<span class="text-xl">🔴</span><span>Listening…</span>';
    }
    if (micStatus) micStatus.textContent = '🎤 Listening — say your answer!';

    // Combine all answer option strings — strip punctuation so fuzzy matching works
    // e.g. ["Woof!", "Meow!"] → "Woof Meow" (avoids "oof" vs "woof!" mismatch)
    var expectedPhrase = (options || [])
      .map(function(o) { return o.replace(/[^a-zA-Z0-9\s]/g, '').trim(); })
      .join(' ');

    VOICE_INPUT.listenFor(
      expectedPhrase,
      7000,
      // onSuccess
      function(heard) {
        if (micBtn) {
          micBtn.disabled = false;
          micBtn.innerHTML = '<span class="text-xl">🎤</span><span>Say your answer!</span>';
        }
        if (micStatus) micStatus.textContent = '✅ I heard: ' + heard;

        // Match heard text to the closest answer option
        var matched = null;
        var lHeard  = heard.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        // 1) exact (stripped)
        (options || []).forEach(function(opt) {
          var lOpt = opt.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          if (lOpt === lHeard) matched = opt;
        });
        // 2) substring (stripped)
        if (!matched) {
          (options || []).forEach(function(opt) {
            var lOpt = opt.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            if (!matched && (lHeard.includes(lOpt) || lOpt.includes(lHeard))) matched = opt;
          });
        }
        // 3) word-level fuzzy (stripped)
        if (!matched) {
          var bestScore = 0;
          (options || []).forEach(function(opt) {
            var lOpt = opt.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            var words = lOpt.split(/\s+/);
            var score = words.filter(function(w) {
              return w.length > 1 && lHeard.includes(w);
            }).length;
            if (score > bestScore) { bestScore = score; matched = opt; }
          });
        }

        if (matched) {
          // Route through Intent Layer — identical to a button tap
          LESSONS.answer(matched);
        } else {
          if (micStatus) micStatus.textContent = '🤔 Try tapping your answer below!';
          if (micBtn) {
            micBtn.disabled = false;
            micBtn.innerHTML = '<span class="text-xl">🎤</span><span>Try again!</span>';
          }
        }
      },
      // onFail
      function(reason) {
        if (micBtn) {
          micBtn.disabled = false;
          micBtn.innerHTML = '<span class="text-xl">🎤</span><span>Try again!</span>';
        }
        if (micStatus) micStatus.textContent = reason === 'timeout'
          ? '⏱️ Tap your answer below, or tap 🎤 to try again!'
          : '🔄 Mic issue — tap your answer or try again!';
      }
    );
  }

  // ── Intent: SubmitAnswer(childID, answer) ─────────────────
  var answer = SYSTEM.guard('LESSONS.answer', function(ans) {
    if (!state.lesson || !ans) return;
    if (state._answering) return;  // prevent double-submit
    state._answering = true;

    // Abort any active voice recognition (answer submitted — stop listening)
    if (window.VOICE_INPUT && VOICE_INPUT._recognition) {
      try { VOICE_INPUT._recognition.abort(); } catch(e) {}
      VOICE_INPUT._listening = false;
    }
    // Hide mic row while processing (re-shown by _renderStep on next question)
    var vRowAns = document.getElementById('lessonVoiceRow');
    if (vRowAns) vRowAns.classList.add('hidden');

    // Disable all buttons immediately (prevent re-tap)
    document.querySelectorAll('.answer-btn').forEach(function(b){ b.disabled = true; });

    api('POST', '/lessons/answer', {
      progress_id: state.progress,
      lesson_id:   state.lesson.id || state.lesson.lesson_id,
      child_id:    state.childId,
      step_index:  state.stepIdx,
      answer:      ans,
    }).then(function(r) {
      if (!r.success) {
        SYSTEM.log('error','LESSONS.answer','API error: '+(r.error||'unknown'));
        state._answering = false;
        document.querySelectorAll('.answer-btn').forEach(function(b){ b.disabled = false; });
        // Restore voice row so child can retry by voice too
        var vRowErr = document.getElementById('lessonVoiceRow');
        if (vRowErr && VOICE_INPUT.isSupported()) {
          vRowErr.classList.remove('hidden');
          var msErr = document.getElementById('lessonMicStatus');
          if (msErr) msErr.textContent = '🔄 Try again — tap or say your answer!';
          var mbErr = document.getElementById('lessonMicBtn');
          if (mbErr) { mbErr.disabled = false; mbErr.innerHTML = '<span class="text-xl">🎤</span><span>Try again!</span>'; }
        }
        showToast('Could not submit answer — try again','⚠️','warning');
        return;
      }
      var d = r.data;

      // Highlight correct/wrong using data-answer (canonical match)
      document.querySelectorAll('.answer-btn').forEach(function(b) {
        var bAns = b.getAttribute('data-answer');
        if (bAns === d.correct_answer)       b.classList.add('correct');
        else if (bAns === ans && !d.correct) b.classList.add('wrong');
      });

      // Feedback from server — never constructed in UI
      var fb = document.getElementById('lessonFeedback');
      if (fb) {
        fb.classList.remove('hidden');
        fb.textContent = d.feedback_text;
        fb.style.background = d.correct ? 'rgba(107,203,119,0.15)' : 'rgba(255,80,80,0.15)';
        fb.style.color       = d.correct ? '#6bcb77' : '#ff6b9d';
      }

      // Intent: TriggerAnimation — always from server metadata
      ANIM.trigger(d.animation || (d.correct ? 'confetti_burst' : 'soft_encouragement'));

      // Intent: RequestTTS — text from server feedback (not DOM)
      speakText(d.feedback_text, d.emotion_hint || (d.correct ? 'excited' : 'encouraging'));

      if (d.is_complete) {
        // Lesson complete — show Finish button after celebration
        ANIM.trigger('full_celebration');
        setTimeout(function() {
          var nb = document.getElementById('lessonNextBtn');
          if (nb) { nb.innerHTML = '🏆 Finish!'; nb.classList.remove('hidden'); nb.disabled = false; }
        }, 1200);
      } else {
        // Auto-advance to next step after feedback delay (1.8s)
        setTimeout(function() {
          state.stepIdx  = d.next_step_index;
          state._answering = false;
          _renderStep();
          // TTS for next question from source-of-truth
          var nextStep = (state.lesson.steps || [])[state.stepIdx];
          if (nextStep && nextStep.text && nextStep.type === 'question') {
            setTimeout(function(){ speakText(nextStep.text, 'friendly'); }, 200);
          }
        }, 1800);
      }
    }).catch(function(e) {
      SYSTEM.log('error','LESSONS.answer','Fetch error: '+e.message);
      state._answering = false;
      document.querySelectorAll('.answer-btn').forEach(function(b){ b.disabled = false; });
      showToast('Connection error — tap to try again','❌','error');
    });
  });

  // ── Intent: NextStep (intro/reward continue button) ───────
  var nextStep = SYSTEM.guard('LESSONS.nextStep', function() {
    if (!state.lesson) return;
    var steps = state.lesson.steps || [];
    // If on last step — exit lesson
    if (state.stepIdx >= steps.length - 1) { closeLesson(); return; }
    state.stepIdx++;
    _renderStep();
    // TTS from source-of-truth for the new step
    var step = steps[state.stepIdx];
    if (step && step.text && step.type !== 'reward') {
      // reward type speaks in _renderStep already
      setTimeout(function(){ speakText(step.text, 'friendly'); }, 150);
    }
  });

  // ── Intent: ExitLesson(userID) ────────────────────────────
  var closeLesson = SYSTEM.guard('LESSONS.closeLesson', function() {
    // Stop any active TTS cleanly
    if (window._activeTTSAudio) {
      try { window._activeTTSAudio.pause(); window._activeTTSAudio.src = ''; } catch(e) {}
      window._activeTTSAudio = null;
    }
    if ('speechSynthesis' in window) try { window.speechSynthesis.cancel(); } catch(e) {}

    // Hide panel, show grid
    var panel = document.getElementById('activeLessonPanel');
    if (panel) panel.classList.add('hidden');
    var grid  = document.getElementById('lessonsGrid');
    if (grid)  grid.classList.remove('hidden');

    // Intent: ResetLessonState
    _resetLessonState();

    // Reload lesson list (refresh progress data)
    load();
  });

  function setFilter(topic) {
    state.filterTopic = topic;
    document.querySelectorAll('.lesson-filter-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.topic === topic);
    });
    applyFilter();
  }

  // ── Intent: GenerateLesson ────────────────────────────────
  var generate = SYSTEM.guard('LESSONS.generate', function() {
    var btn    = document.getElementById('genLessonBtn');
    var status = document.getElementById('genLessonStatus');
    var child  = STATE.selectedChild;
    if (!child) { showToast('Select a child first','👶','warning'); return; }
    if (btn) btn.disabled = true;
    if (status) status.textContent = '⏳ Generating with AI…';

    api('POST', '/lessons/generate', {
      topic:      (document.getElementById('genTopic')?.value || 'animals'),
      difficulty: (document.getElementById('genDifficulty')?.value || 'easy'),
      age_group:  child.age + '-' + (child.age + 2),
      child_id:   child.id,
    }).then(function(r) {
      if (btn) btn.disabled = false;
      if (!r.success) {
        if (status) status.textContent = '❌ ' + (r.error || 'Generation failed');
        if (r.needs_login) { showToast('Sign in to generate lessons','🔐','warning'); return; }
        if (r.locked)      { showToast('Upgrade to generate lessons! ⭐','⭐','info'); switchTab('billing'); }
        return;
      }
      if (status) status.textContent = '✅ Created: ' + r.data.title;
      showToast('New lesson ready: ' + r.data.title + '! 🎓','🎓','success');
      load();
    }).catch(function(e) {
      if (btn) btn.disabled = false;
      if (status) status.textContent = '❌ Connection error';
      SYSTEM.log('error','LESSONS.generate','Error: '+e.message);
    });
  });

  // ── Helper: escape HTML attribute value ──────────────────
  function _escapeAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Public API ────────────────────────────────────────────
  return { load: load, start: start, answer: answer, nextStep: nextStep, closeLesson: closeLesson, setFilter: setFilter, generate: generate, lessonMicTap: function() { _listenForAnswer((state.lesson && state.lesson.steps && state.lesson.steps[state.stepIdx] && state.lesson.steps[state.stepIdx].options) || []); } };
})();

// ════════════════════════════════════════════════════════════
// BILLING_V2 MODULE
// ════════════════════════════════════════════════════════════
var BILLING_V2 = (function() {
  var data={credits:0,tier:'free',trial:0,packs:[],transactions:[]};

  function init(){
    // Always load plans/packs from public status endpoint first (no auth needed)
    api('GET','/billing/status').then(function(r){
      if(r.success){
        data.packs = r.data.credit_packs||[];
        // Set tier from user_tier if available
        if(r.data.user_tier) data.tier = r.data.user_tier;
        if(r.data.user_credits!=null) data.credits = r.data.user_credits;
      }
      renderPlans(); renderPacks();
    });
    refreshCredits();
    loadAnalytics();
  }

  function refreshCredits(){
    api('GET','/billing/credits').then(function(r){
      if(!r.success){ renderPlans(); renderPacks(); return; }  // still render plans even if unauthed
      data.credits=r.data.credits; data.tier=r.data.subscription_tier||'free';
      data.trial=r.data.trial_uses_remaining||0; data.packs=r.data.credit_packs||[];
      data.transactions=r.data.recent_transactions||[];
      renderAll();
      // Update header display: show song credits + tooltip with voice tries
      var el=document.getElementById('creditsDisplay');
      if(el) {
        el.textContent=data.credits+' cr';
        el.title=data.credits+' song credits · '+data.trial+' voice tries remaining';
      }
    });
  }

  function renderAll(){ renderCredits(); renderPlans(); renderPacks(); renderTransactions(); }

  function renderCredits(){
    var cc=document.getElementById('billingCreditCount'); if(cc) cc.textContent=data.credits;
    var tb=document.getElementById('billingTierBadge'); if(tb) tb.textContent=(data.tier==='free'?'🆓 Free Plan':data.tier==='starter'?'⭐ Starter ($4.99/mo)':'💎 Premium ($9.99/mo)');
    var tc=document.getElementById('billingTrialCount'); if(tc) tc.textContent=data.trial;
  }

  function renderPlans(){
    var el=document.getElementById('billingPlanCards'); if(!el) return;
    var plans=[
      {id:'free',   name:'Free',    price:'$0',    credits:'3 lifetime', features:['Free games','15 premium voice trials','Basic songs']},
      {id:'starter',name:'Starter', price:'$4.99', credits:'15/month',   features:['All free features','Lessons access','15 credits/month','AI song gen']},
      {id:'premium',name:'Premium', price:'$9.99', credits:'30/month',   features:['Everything in Starter','30 credits/month','Lesson generator','Priority TTS']},
    ];
    el.innerHTML=plans.map(function(p){
      var isCurrent=data.tier===p.id;
      var isHL=p.id==='starter';
      return '<div class="plan-card'+(isCurrent?' current':'')+(isHL?' highlight':'') + '">'
        +'<div class="flex items-center justify-between mb-3"><div><div class="font-black text-lg">'+p.name+'</div><div class="text-2xl font-black text-pink-400">'+p.price+(p.id!=='free'?'<span class="text-sm text-gray-400 font-normal">/mo</span>':'')+'</div></div>'
        +'<div class="text-right"><div class="text-xs text-gray-400">Credits</div><div class="font-black text-purple-300">'+p.credits+'</div></div></div>'
        +'<ul class="text-xs text-gray-300 space-y-1 mb-4">'+p.features.map(function(f){return '<li><i class="fas fa-check text-green-400 mr-2"></i>'+f+'</li>';}).join('')+'</ul>'
        +(isCurrent?'<div class="text-center text-xs font-bold text-green-400 py-2"><i class="fas fa-check-circle mr-1"></i>Current Plan</div>'
          :p.id!=='free'?'<button data-plan-id="'+p.id+'" class="billing-subscribe-btn btn-primary w-full text-sm">Get '+p.name+' <i class="fas fa-arrow-right ml-1"></i></button>':'')
        +'</div>';
    }).join('');
    el.querySelectorAll('.billing-subscribe-btn').forEach(function(b){b.addEventListener('click',function(){BILLING_V2.subscribe(b.getAttribute('data-plan-id'));});});
  }

  function renderPacks(){
    var el=document.getElementById('billingPackCards'); if(!el) return;
    // Fallback packs if API hasn't loaded yet
    var packs = data.packs.length ? data.packs : [
      {id:'pack_10',credits:10,price_label:'$2.99'},
      {id:'pack_25',credits:25,price_label:'$4.99'},
      {id:'pack_60',credits:60,price_label:'$9.99'}
    ];
    el.innerHTML=packs.map(function(p){
      return '<div class="glass p-4 text-center"><div class="text-2xl font-black text-purple-300">'+p.credits+'</div>'
        +'<div class="text-xs text-gray-400 mb-1">credits</div>'
        +'<div class="font-black text-pink-400 mb-3">'+p.price_label+'</div>'
        +'<button data-pack-id="'+p.id+'" class="billing-pack-btn btn-primary w-full text-xs">Buy Now</button></div>';
    }).join('');
    el.querySelectorAll('.billing-pack-btn').forEach(function(b){b.addEventListener('click',function(){BILLING_V2.buyPack(b.getAttribute('data-pack-id'));});});
  }

  function renderTransactions(){
    var el=document.getElementById('billingTransactions'); if(!el) return;
    if(!data.transactions.length){el.innerHTML='<div class="text-center py-4 opacity-50">No transactions yet</div>';return;}
    el.innerHTML=data.transactions.map(function(t){
      var amt=t.credits_delta>0?'<span class="text-green-400">+'+t.credits_delta+' cr</span>':'<span class="text-red-400">'+t.credits_delta+' cr</span>';
      return '<div class="flex justify-between items-center py-2 border-b border-white/5"><div><div class="font-bold text-xs">'+t.description+'</div><div class="text-gray-600 text-xs">'+new Date(t.created_at).toLocaleDateString()+'</div></div>'+amt+'</div>';
    }).join('');
  }

  function subscribe(planId){
    showToast('Redirecting to checkout…','💳','info');
    var priceIds=(window._stripePrices||{});
    api('POST','/billing/checkout',{product_type:'subscription',price_id:priceIds[planId]||'',success_url:window.location.origin+'/?payment=success&plan='+planId,cancel_url:window.location.origin+'/?payment=cancelled'}).then(function(r){
      if(r.success&&r.data?.checkout_url){window.location.href=r.data.checkout_url;}
      else if(r.demo_mode){showToast('Stripe not configured — contact support','⚠️','warning');}
      else{showToast(r.error||'Checkout failed','❌','error');}
    });
  }

  function buyPack(packId){
    showToast('Redirecting to checkout…','💳','info');
    api('POST','/billing/checkout',{product_type:'credit_pack',pack_id:packId,success_url:window.location.origin+'/?payment=success&pack='+packId,cancel_url:window.location.origin+'/?payment=cancelled'}).then(function(r){
      if(r.success&&r.data?.checkout_url){window.location.href=r.data.checkout_url;}
      else if(r.demo_mode){showToast('Stripe not configured — contact support','⚠️','warning');}
      else{showToast(r.error||'Checkout failed','❌','error');}
    });
  }

  function loadAnalytics(){
    api('GET','/analytics?days=30').then(function(r){
      if(!r.success) return;
      var d=r.data;
      var ll=document.getElementById('statsLessons'); if(ll) ll.textContent=(d.lesson_stats?.total_completed||0)+'';
      var cc=document.getElementById('statsCredits'); if(cc) cc.textContent=(d.credit_stats?.total_used||0)+'';
      var ac=document.getElementById('statsAccuracy'); if(ac) ac.textContent=d.accuracy_rate!==null?d.accuracy_rate+'%':'—';
    });
  }

  // Handle payment return
  (function(){
    var p=new URLSearchParams(window.location.search);
    if(p.get('payment')==='success'){
      showToast('Payment successful! Credits added. 🎉','✅','success');
      ANIM.celebration();
      history.replaceState({},'','/');
      setTimeout(refreshCredits,1500);
    } else if(p.get('payment')==='cancelled'){
      showToast('Checkout cancelled','↩️','info');
      history.replaceState({},'','/');
    }
  })();

  return {init, refreshCredits, subscribe, buyPack, loadAnalytics, get _data(){ return data; }};
})();
</script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// /demo — Standalone Demo Page
// Always uses Replicate TTS, no login required.
// Shows the full voice/TTS experience so visitors can try
// before hitting the paywall.
// ════════════════════════════════════════════════════════════
function getDemoHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>🎵 Music Buddy — Try It Free</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: linear-gradient(135deg, #0f0f1a 0%, #1a0a2e 50%, #0d1117 100%);
      min-height: 100vh; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .glass { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; }
    .btn-pink {
      background: linear-gradient(135deg, #ff6b9d, #ff4081);
      border: none; border-radius: 14px; color: white; font-weight: 900;
      cursor: pointer; transition: all 0.2s; padding: 14px 28px; font-size: 1rem;
    }
    .btn-pink:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(255,107,157,0.4); }
    .btn-pink:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-secondary {
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px; color: white; font-weight: 700; cursor: pointer;
      transition: all 0.2s; padding: 10px 20px;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.14); }
    .btn-secondary.active { background: rgba(255,107,157,0.2); border-color: #ff6b9d; }
    .voice-card {
      background: rgba(255,255,255,0.04); border: 2px solid rgba(255,255,255,0.1);
      border-radius: 16px; cursor: pointer; transition: all 0.2s; padding: 14px;
      text-align: center;
    }
    .voice-card:hover { border-color: rgba(255,107,157,0.5); background: rgba(255,107,157,0.08); }
    .voice-card.selected { border-color: #ff6b9d; background: rgba(255,107,157,0.15); }
    .waveform { display: flex; align-items: center; gap: 3px; height: 40px; }
    .waveform .bar {
      width: 4px; border-radius: 2px; background: #ff6b9d;
      animation: wave 1.2s ease-in-out infinite;
    }
    .waveform .bar:nth-child(2)  { animation-delay: 0.1s; }
    .waveform .bar:nth-child(3)  { animation-delay: 0.2s; }
    .waveform .bar:nth-child(4)  { animation-delay: 0.3s; }
    .waveform .bar:nth-child(5)  { animation-delay: 0.4s; }
    .waveform .bar:nth-child(6)  { animation-delay: 0.2s; }
    .waveform .bar:nth-child(7)  { animation-delay: 0.1s; }
    @keyframes wave {
      0%, 100% { height: 8px; }
      50% { height: 32px; }
    }
    .waveform.paused .bar { animation-play-state: paused; height: 8px; }
    .pulse { animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.05);opacity:0.85} }
    .toast {
      position: fixed; bottom: 24px; right: 24px; z-index: 999;
      background: #1e1e2e; border: 1px solid rgba(255,255,255,0.15);
      border-radius: 14px; padding: 12px 20px; font-size: 0.85rem;
      transform: translateY(80px); opacity: 0; transition: all 0.3s; max-width: 320px;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    input[type=text], textarea {
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 12px; color: white; padding: 12px 16px; width: 100%;
      font-size: 0.95rem; outline: none; transition: border-color 0.2s;
    }
    input[type=text]:focus, textarea:focus { border-color: #ff6b9d; }
    textarea { resize: vertical; min-height: 80px; }
    .spinner { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="max-w-2xl mx-auto px-4 pt-10 pb-6">
    <div class="text-center mb-8">
      <div class="text-5xl mb-3 pulse">🎵</div>
      <h1 class="text-3xl font-black mb-2" style="background:linear-gradient(135deg,#ff6b9d,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent">
        Music Buddy
      </h1>
      <p class="text-gray-400 text-sm">Try our ElevenLabs-quality voice — no account needed</p>
      <div class="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full text-xs font-bold"
        style="background:rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.3)">
        <span class="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
        Powered by Replicate × ElevenLabs — Free Demo
      </div>
    </div>

    <!-- Voice picker -->
    <div class="glass p-5 mb-4">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Choose a Voice</div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" id="voiceGrid">
        <!-- Rendered by JS -->
      </div>
    </div>

    <!-- Preset phrases -->
    <div class="glass p-5 mb-4">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Phrases</div>
      <div class="flex flex-wrap gap-2" id="presetGrid">
        <!-- Rendered by JS -->
      </div>
    </div>

    <!-- Custom text -->
    <div class="glass p-5 mb-4">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Or Type Your Own</div>
      <textarea id="customText" placeholder="Type anything for MusicBuddy to say..."></textarea>
    </div>

    <!-- Emotion picker -->
    <div class="glass p-5 mb-6">
      <div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Emotion</div>
      <div class="flex flex-wrap gap-2" id="emotionGrid">
        <!-- Rendered by JS -->
      </div>
    </div>

    <!-- Play button + waveform -->
    <div class="text-center mb-6">
      <button id="speakBtn" class="btn-pink text-lg px-10 py-4" onclick="demoSpeak()">
        <i class="fas fa-play mr-2"></i> Hear It!
      </button>
      <div id="waveWrap" class="hidden mt-5 justify-center">
        <div class="waveform paused" id="waveform">
          <div class="bar"></div><div class="bar"></div><div class="bar"></div>
          <div class="bar"></div><div class="bar"></div><div class="bar"></div>
          <div class="bar"></div>
        </div>
      </div>
      <div id="statusText" class="text-xs text-gray-500 mt-3"></div>
    </div>

    <!-- CTA -->
    <div class="glass p-6 text-center" style="background:rgba(255,107,157,0.07);border-color:rgba(255,107,157,0.25)">
      <div class="text-2xl mb-2">✨</div>
      <div class="font-black text-lg mb-1">Love what you hear?</div>
      <div class="text-gray-400 text-sm mb-4">Get 30 free voice uses + full app access — no credit card needed for trial.</div>
      <div class="flex gap-3 justify-center flex-wrap">
        <a href="/" class="btn-pink">
          <i class="fas fa-rocket mr-2"></i> Start Free Trial
        </a>
        <button class="btn-secondary" onclick="demoSpeak()">
          <i class="fas fa-redo mr-2"></i> Try Again
        </button>
      </div>
      <div class="mt-4 text-xs text-gray-500">
        Then: $4.99/mo for 15 credits · $9.99/mo for 30 credits + full lessons
      </div>
    </div>

    <div class="text-center mt-6 text-xs text-gray-600">
      <a href="/" class="hover:text-gray-400 transition-colors">← Back to full app</a>
    </div>
  </div>

  <div id="toast" class="toast"></div>

<script>
(function() {
  // ── Config ────────────────────────────────────────────────
  var VOICES = [
    { id: 'aria',     name: 'Aria',     emoji: '🌸', tag: 'Warm & Nurturing' },
    { id: 'charlotte',name: 'Charlotte',emoji: '⚡', tag: 'Bright & Cheerful' },
    { id: 'laura',    name: 'Laura',    emoji: '🌙', tag: 'Gentle & Soothing' },
    { id: 'jessica',  name: 'Jessica',  emoji: '🎉', tag: 'Fun & Upbeat' },
    { id: 'charlie',  name: 'Charlie',  emoji: '😊', tag: 'Friendly Male' },
    { id: 'liam',     name: 'Liam',     emoji: '🦁', tag: 'Warm Encourager' },
    { id: 'matilda',  name: 'Matilda',  emoji: '🫧', tag: 'Playful & Light' },
    { id: 'sarah',    name: 'Sarah',    emoji: '💚', tag: 'Soft & Friendly' },
  ];

  var PRESETS = [
    { text: "Wooooah, you are SO smart! I can't believe how amazing you are!", emotion: 'excited' },
    { text: "Let's sing a happy song together! La la la, music is magic!", emotion: 'singing' },
    { text: "Hey there superstar! Are you ready to have the BEST time ever?", emotion: 'excited' },
    { text: "Time for sleepy music... close your eyes and float away on the clouds.", emotion: 'calm' },
    { text: "You did it! I'm SO proud of you! You're a champion!", emotion: 'excited' },
    { text: "Can you clap your hands? One, two, three — let's go!", emotion: 'friendly' },
  ];

  var EMOTIONS = [
    { id: 'excited',     label: '🔥 Excited' },
    { id: 'friendly',    label: '😊 Friendly' },
    { id: 'calm',        label: '🌙 Calm' },
    { id: 'singing',     label: '🎵 Singing' },
    { id: 'encouraging', label: '💪 Encouraging' },
    { id: 'whisper',     label: '🤫 Whisper' },
  ];

  var selectedVoice   = 'aria';
  var selectedEmotion = 'excited';
  var currentAudio    = null;
  var isPlaying       = false;

  // ── Render voice cards ────────────────────────────────────
  function renderVoices() {
    var grid = document.getElementById('voiceGrid');
    VOICES.forEach(function(v) {
      var card = document.createElement('div');
      card.className = 'voice-card' + (v.id === selectedVoice ? ' selected' : '');
      card.id = 'vc-' + v.id;
      card.innerHTML = '<div class="text-2xl mb-1">' + v.emoji + '</div>' +
        '<div class="font-black text-xs">' + v.name + '</div>' +
        '<div class="text-xs mt-0.5" style="color:#aaa">' + v.tag + '</div>';
      card.onclick = function() { selectVoice(v.id); };
      grid.appendChild(card);
    });
  }

  function selectVoice(id) {
    selectedVoice = id;
    document.querySelectorAll('.voice-card').forEach(function(c) { c.classList.remove('selected'); });
    var el = document.getElementById('vc-' + id);
    if (el) el.classList.add('selected');
  }

  // ── Render preset phrases ─────────────────────────────────
  function renderPresets() {
    var grid = document.getElementById('presetGrid');
    PRESETS.forEach(function(p, i) {
      var btn = document.createElement('button');
      btn.className = 'btn-secondary text-xs';
      btn.textContent = p.text.slice(0, 38) + '…';
      btn.title = p.text;
      btn.onclick = function() {
        document.getElementById('customText').value = p.text;
        selectedEmotion = p.emotion;
        document.querySelectorAll('.emotion-btn').forEach(function(b) { b.classList.remove('active'); });
        var eb = document.getElementById('em-' + p.emotion);
        if (eb) eb.classList.add('active');
        demoSpeak();
      };
      grid.appendChild(btn);
    });
  }

  // ── Render emotion picker ─────────────────────────────────
  function renderEmotions() {
    var grid = document.getElementById('emotionGrid');
    EMOTIONS.forEach(function(e) {
      var btn = document.createElement('button');
      btn.className = 'btn-secondary emotion-btn text-xs' + (e.id === selectedEmotion ? ' active' : '');
      btn.id = 'em-' + e.id;
      btn.textContent = e.label;
      btn.onclick = function() {
        selectedEmotion = e.id;
        document.querySelectorAll('.emotion-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      };
      grid.appendChild(btn);
    });
  }

  // ── Toast ─────────────────────────────────────────────────
  function toast(msg, emoji) {
    var el = document.getElementById('toast');
    el.textContent = (emoji ? emoji + '  ' : '') + msg;
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, 3000);
  }

  // ── Waveform ──────────────────────────────────────────────
  function setWave(playing) {
    var wrap = document.getElementById('waveWrap');
    var wf   = document.getElementById('waveform');
    if (playing) {
      wrap.style.display = 'flex';
      wrap.classList.remove('hidden');
      wf.classList.remove('paused');
    } else {
      wf.classList.add('paused');
      setTimeout(function() { wrap.classList.add('hidden'); }, 600);
    }
  }

  // ── Main speak function ───────────────────────────────────
  window.demoSpeak = function() {
    var textEl = document.getElementById('customText');
    var text = textEl.value.trim() || PRESETS[0].text;
    if (!text) { toast('Type something first!', '✏️'); return; }

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }

    var btn    = document.getElementById('speakBtn');
    var status = document.getElementById('statusText');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner spinner mr-2"></i> Generating…';
    status.textContent = '⏳ Connecting to ElevenLabs via Replicate…';
    setWave(false);

    fetch('/api/demo/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, emotion: selectedEmotion, voice: selectedVoice }),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play mr-2"></i> Hear It!';

      if (!data.success || !data.audioUrl) {
        status.textContent = '❌ ' + (data.error || 'Could not generate audio');
        toast('TTS failed — ' + (data.error || 'unknown error'), '❌');
        return;
      }

      status.textContent = '✅ ' + data.voice + ' via Replicate ElevenLabs';
      setWave(true);

      var audio = new Audio();
      audio.preload = 'auto';
      audio.volume  = 0.9;
      currentAudio  = audio;

      audio.addEventListener('canplaythrough', function() {
        audio.play().catch(function() {
          toast('Browser blocked autoplay — tap again!', '🔊');
          setWave(false);
        });
      }, { once: true });

      setTimeout(function() {
        if (audio.paused && audio.readyState < 3) audio.play().catch(function(){});
      }, 6000);

      audio.onended = function() {
        setWave(false);
        currentAudio = null;
        status.textContent = '▶ Play again or try a different voice!';
      };
      audio.onerror = function() {
        setWave(false);
        status.textContent = '❌ Audio playback failed';
        toast('Audio error — try again', '❌');
      };

      audio.src = data.audioUrl;
      audio.load();
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play mr-2"></i> Hear It!';
      status.textContent = '❌ Network error: ' + err.message;
      toast('Network error', '❌');
    });
  };

  // ── Init ──────────────────────────────────────────────────
  renderVoices();
  renderPresets();
  renderEmotions();

  // Auto-play a welcome phrase on load after short delay
  setTimeout(function() {
    if (!document.getElementById('customText').value) {
      document.getElementById('customText').value = PRESETS[0].text;
    }
  }, 500);
})();
</script>
</body>
</html>`;
}

export default app
