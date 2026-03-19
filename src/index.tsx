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

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'AI Music Companion for Children',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    layers: {
      ui: 'active',
      api: 'active',
      logic: 'active',
      database: 'active',
      hosting: 'cloudflare-pages'
    }
  })
})

// ── Main UI (served from root) ────────────────────────────────
app.get('/', (c) => {
  return c.html(getMainHTML())
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
  <title>🎵 MusicBuddy AI – Children's Music Companion</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
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
  </style>
</head>
<body class="bg-animated min-h-screen">

<!-- Stars & Music Notes -->
<div class="stars" id="stars"></div>
<div id="musicNotes"></div>

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
        <h1 class="text-xl font-black text-white leading-tight">MusicBuddy AI</h1>
        <p class="text-xs text-purple-300 font-semibold">Interactive Children's Music Companion</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <div id="sessionIndicator" class="hidden items-center gap-2 glass-light px-3 py-1.5 rounded-full text-sm font-bold text-green-400">
        <div class="engagement-dot bg-green-400"></div>
        <span>Live Session</span>
      </div>
      <button onclick="openModal('addProfileModal')" class="btn-primary text-sm">
        <i class="fas fa-plus mr-1"></i> New Profile
      </button>
    </div>
  </header>

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
    <button class="tab-btn whitespace-nowrap" onclick="switchTab('creator')" id="tab-creator">
      <i class="fas fa-wand-magic-sparkles mr-1"></i> Creator
    </button>
    <button class="tab-btn whitespace-nowrap" onclick="switchTab('settings')" id="tab-settings">
      <i class="fas fa-sliders-h mr-1"></i> Settings
    </button>
  </div>

  <!-- ══════════════════ TAB: COMPANION ══════════════════════ -->
  <div id="tab-content-companion" class="tab-content px-4 py-4">
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
            <div id="cameraPlaceholder" class="text-center text-gray-500">
              <i class="fas fa-video text-4xl mb-2 block opacity-30"></i>
              <p class="text-xs">Start a session to enable<br/>live monitoring</p>
            </div>
            <!-- Emotion overlays -->
            <div id="emotionOverlays" class="absolute top-2 left-2 flex flex-wrap gap-1"></div>
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
                <div class="font-black text-lg" id="childNameDisplay">-</div>
                <div class="text-xs text-gray-400" id="childAgeDisplay">Age -</div>
                <div class="text-xs text-purple-300 font-bold" id="childStyleDisplay">-</div>
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
      
      <div class="glass p-6">
        <h3 class="font-black text-lg mb-4 flex items-center gap-2">
          <i class="fas fa-key text-yellow-400"></i> API Configuration
          <span class="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full font-bold">Admin Only</span>
        </h3>
        
        <!-- Pricing overview -->
        <div class="glass-light p-4 rounded-xl mb-5">
          <p class="text-xs font-black text-yellow-300 mb-3 uppercase tracking-wide">💰 Estimated Costs Per Use</p>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between items-center">
              <span class="text-gray-300">🎼 Meta MusicGen (Replicate)</span>
              <span class="text-green-400 font-bold">~$0.007 / song</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-300">🎻 Google Lyria 2 (Replicate)</span>
              <span class="text-green-400 font-bold">~$0.060 / song</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-300">⚡ ACE-Step (Replicate)</span>
              <span class="text-green-400 font-bold">~$0.017 / song</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-300">🗣️ OpenAI TTS (per voice line)</span>
              <span class="text-green-400 font-bold">~$0.001 / phrase</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-300">🌐 Web Speech API (fallback)</span>
              <span class="text-blue-400 font-bold">Free — built-in</span>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-3">A 30-minute session (~15 songs + voice lines) costs approximately <span class="text-white font-bold">$0.12–$1.00</span> depending on model. Web Speech API fallback is always free.</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-sm font-bold text-gray-300 block mb-2">
              🎵 Suno API Key <span class="text-xs text-gray-500">(private access only)</span>
            </label>
            <input type="password" id="sunoKeyInput" placeholder="sk-suno-..." class="text-sm" />
            <p class="text-xs text-gray-500 mt-1">Suno API is not publicly open. Requires private access arrangement. <a href="https://sunoapi.org" target="_blank" class="text-blue-400">sunoapi.org</a></p>
          </div>
          <div>
            <label class="text-sm font-bold text-gray-300 block mb-2">
              🤖 Replicate API Key <span class="text-xs text-green-400 font-bold">(recommended — Meta MusicGen)</span>
            </label>
            <input type="password" id="replicateKeyInput" placeholder="r8_..." class="text-sm" />
            <p class="text-xs text-gray-500 mt-1">Best alternative! Meta MusicGen via Replicate. ~$0.004/req. Get yours at <a href="https://replicate.com" target="_blank" class="text-blue-400">replicate.com</a></p>
          </div>
          <div>
            <label class="text-sm font-bold text-gray-300 block mb-2">
              🗣️ OpenAI API Key <span class="text-xs text-gray-500">(for high-quality TTS speech)</span>
            </label>
            <input type="password" id="openaiKeyInput" placeholder="sk-..." class="text-sm" />
            <p class="text-xs text-gray-500 mt-1">OpenAI TTS (shimmer voice). Falls back to browser Web Speech API for free. Get yours at <a href="https://platform.openai.com" target="_blank" class="text-blue-400">platform.openai.com</a></p>
          </div>
          <button onclick="saveApiKeys()" class="btn-primary w-full">
            <i class="fas fa-save mr-2"></i> Validate & Save API Keys
          </button>
          <div class="glass-light p-4 rounded-xl mt-2">
            <p class="text-xs text-gray-400 font-bold mb-2">⚡ To persist keys for all users (production):</p>
            <code class="text-xs text-green-300 block">npx wrangler secret put REPLICATE_API_KEY</code>
            <code class="text-xs text-green-300 block">npx wrangler secret put OPENAI_API_KEY</code>
            <code class="text-xs text-gray-500 block mt-1"># Then redeploy: npm run build && npx wrangler pages deploy dist --project-name musicbuddy-ai</code>
          </div>
        </div>
      </div>

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
              <option value="0.8">🐢 Slow (for young children)</option>
              <option value="0.9" selected>🚶 Normal</option>
              <option value="1.0">🏃 Fast</option>
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
        </div>
      </div>

      <div class="glass p-6">
        <h3 class="font-black text-lg mb-4 flex items-center gap-2">
          <i class="fas fa-lock text-green-400"></i> Privacy & Safety
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
};

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
    return lines.slice(0, numLines).join('\n');
  },

  // Build timed lyric phrases for beat-synced delivery
  buildBeatSyncedPhrases(lyrics, bpmValue) {
    const bpm = parseInt(bpmValue) || 100;
    const beatDuration = 60 / bpm; // seconds per beat
    const phraseDuration = beatDuration * 4; // 4 beats per phrase
    const lines = lyrics.split('\n').map(l => l.trim()).filter(Boolean);

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
  const text = \`🎵 Check out my MusicBuddy AI song: "\${song.title}"\n\${song.lyrics.split('\n').slice(0,2).join('\n')}\`;
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
  setInterval(spawnNote, 3000);
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
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-content-' + tab).classList.remove('hidden');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'profiles') loadProfiles();
  if (tab === 'dashboard') populateDashboardSelect();
  if (tab === 'library') populateLibrarySelect();
  if (tab === 'settings') loadSystemInfo();
  if (tab === 'creator') initCreatorTab();
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
    const opts = { method, headers: {'Content-Type':'application/json'} };
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
    loadProfiles();
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
  
  updateChildUI();
  switchTab('companion');
  showToast(\`Selected \${r.data.child.name}! 🌟\`, '⭐', 'success');
  document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('profile-' + id)?.classList.add('selected');
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

  document.getElementById('startBtn').classList.add('hidden');
  document.getElementById('stopBtn').classList.remove('hidden');
  document.getElementById('sessionIndicator').style.display = 'flex';
  
  // Start camera simulation
  document.getElementById('scanLine').style.display = 'block';
  document.getElementById('cameraPlaceholder').innerHTML = \`
    <div class="text-center">
      <i class="fas fa-eye text-green-400 text-3xl mb-2 block"></i>
      <p class="text-xs text-green-400 font-bold">Monitoring Active</p>
      <p class="text-xs text-gray-500 mt-1">\${STATE.selectedChild.name} detected</p>
    </div>\`;
  
  document.getElementById('visionStatus').innerHTML = '<i class="fas fa-circle mr-1 text-green-400"></i>Live';
  document.getElementById('visionStatus').className = 'text-xs font-bold px-2 py-1 rounded-full bg-green-900 text-green-300';

  addChatBubble(\`Session started for \${STATE.selectedChild.name}! 🎉\`, 'ai');
  
  showToast(\`Session started! Let's play with \${STATE.selectedChild.name}! 🎵\`, '🎵', 'success');

  // Greet the child
  setTimeout(() => greetChild(), 500);
  
  // Start auto-cycle if in auto mode
  if (STATE.mode === 'auto') startAutoCycle();
}

async function stopSession() {
  if (!STATE.currentSession) return;
  clearInterval(STATE.cycleTimer);
  clearInterval(STATE.progressTimer);
  
  const audio = document.getElementById('audioPlayer');
  audio.pause();
  STATE.isPlaying = false;

  const r = await api('POST', \`/sessions/\${STATE.currentSession.id}/stop\`);
  
  STATE.sessionActive = false;
  STATE.currentSession = null;

  document.getElementById('startBtn').classList.remove('hidden');
  document.getElementById('stopBtn').classList.add('hidden');
  document.getElementById('sessionIndicator').style.display = 'none';
  document.getElementById('scanLine').style.display = 'none';
  document.getElementById('visionStatus').innerHTML = '<i class="fas fa-circle mr-1 text-gray-500"></i>Offline';
  document.getElementById('visionStatus').className = 'text-xs font-bold px-2 py-1 rounded-full bg-gray-700';
  document.getElementById('cameraPlaceholder').innerHTML = \`
    <i class="fas fa-video text-4xl mb-2 block opacity-30"></i>
    <p class="text-xs">Start a session to enable<br/>live monitoring</p>\`;
  document.getElementById('emotionOverlays').innerHTML = '';

  resetPlayer();
  addChatBubble('Great session! See you next time! 👋', 'ai');
  showToast('Session ended. Great engagement! 🌟', '✅', 'success');
  
  updateEngagementUI();
}

async function greetChild() {
  if (!STATE.selectedChild || !STATE.currentSession) return;
  // No emojis — these will be spoken aloud
  const greetings = [
    \`Hi \${STATE.selectedChild.name}! Ready to play and sing some songs today?\`,
    \`Hey there, \${STATE.selectedChild.name}! Let's have some music fun!\`,
    \`Yay, \${STATE.selectedChild.name} is here! Time for music magic!\`
  ];
  const text = greetings[Math.floor(Math.random() * greetings.length)];
  addChatBubble(text + ' 🌟', 'ai'); // emoji only in chat bubble, not spoken
  
  STATE.lastInteraction = 'talk';
  STATE.lastInteractionTime = Date.now();
  updateStateUI('talk', 'greeting');

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
  if (STATE._interactionInProgress) return; // prevent double-fire
  STATE._interactionInProgress = true;

  try {
    // Conversation texts (no emojis — these will be spoken)
    const afterSongTexts = [
      \`You liked that one, huh \${STATE.selectedChild.name}? Let's try another!\`,
      \`Woohoo! That was so fun! Ready for more music?\`,
      \`Great listening, \${STATE.selectedChild.name}! Did that make you want to dance?\`,
      \`Yay! I love that song too! Want to hear another one?\`,
    ];
    const transitionTexts = [
      \`Okay \${STATE.selectedChild.name}, get ready... the music is starting!\`,
      \`Here we go!\`,
      \`Listen carefully, \${STATE.selectedChild.name}! This one is super special!\`,
      \`Ready? One, two, three, let's go!\`,
    ];

    // Step 1: Talk first (after a song or at session start)
    if (STATE.lastInteraction === 'sing' || STATE.lastInteraction === null) {
      const talkText = STATE.lastInteraction === 'sing'
        ? afterSongTexts[Math.floor(Math.random() * afterSongTexts.length)]
        : transitionTexts[0];

      addChatBubble(talkText, 'ai');
      updateStateUI('talk', trigger);
      // AWAIT speech completion before doing anything else
      await speakText(talkText);
    }

    // Step 2: Use preloaded song if available, otherwise generate fresh
    updateStateUI('generating', trigger);

    let snippet;
    if (STATE.nextSnippet && trigger !== 'manual') {
      // Instant — preloaded in background during last song
      snippet = STATE.nextSnippet;
      STATE.nextSnippet = null;
      addChatBubble('Got your next song ready!', 'ai');
    } else {
      addChatBubble('Generating a new song just for you...', 'ai');
      const r = await api('POST', '/music/generate', {
        child_id: STATE.selectedChild.id,
        session_id: STATE.currentSession.id,
        style: STATE.style,
        tempo: STATE.tempo,
        mood: STATE.mood,
        trigger: trigger,
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

    // Step 3: Speak transition cue, then play music AFTER speech ends
    const transText = transitionTexts[Math.floor(Math.random() * transitionTexts.length)];
    addChatBubble(transText, 'ai');
    updateStateUI('talk', 'transition');
    // AWAIT — music only starts once the child hears the cue
    await speakText(transText);

    // Step 4: Now play the music
    playAudio(snippet.audio_url, snippet.title, snippet.style, snippet.duration_seconds);
    addCycleEvent('🎵', 'song', snippet.title);

  } finally {
    STATE._interactionInProgress = false;
  }
}

// ── Audio Player ──────────────────────────────────────────────
function playAudio(url, title, style, duration) {
  // Stop any ongoing TTS speech before music plays
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  // Init Web Audio engine (needs user gesture — playAudio is always triggered by one)
  AUDIO.init();
  AUDIO.resume();

  const audio = document.getElementById('audioPlayer');
  audio.src = url;
  audio.volume = (parseInt(document.getElementById('masterVolume')?.value || 70)) / 100;
  audio.play().catch(() => {
    showToast('Auto-play blocked. Click play button.', '🔊', 'warning');
  });
  
  STATE.isPlaying = true;
  STATE.progressStart = Date.now();
  STATE.progressDuration = (duration || 25) * 1000;
  
  document.getElementById('nowPlayingTitle').textContent = title || 'AI Music Snippet';
  document.getElementById('nowPlayingStyle').textContent = (STYLE_EMOJIS[style]||'🎵') + ' ' + style + ' • AI Generated';
  document.getElementById('nowPlayingEmoji').textContent = STYLE_EMOJIS[style] || '🎵';
  document.getElementById('timeDuration').textContent = \`0:\${String(duration||25).padStart(2,'0')}\`;
  
  updateStateUI('sing', 'playing');

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
  
  // No emojis in spoken text
  const afterTexts = [
    \`Great song, \${STATE.selectedChild?.name || 'friend'}! Did you like that?\`,
    \`Yay! That was so fun! Want to hear another one?\`,
    \`Wow, you are such a great music listener! More?\`,
  ];
  const t = afterTexts[Math.floor(Math.random() * afterTexts.length)];
  addChatBubble(t + ' 😊', 'ai'); // emoji in chat only
  
  // Await speech before doing anything else
  await speakText(t);
  
  addCycleEvent('💬', 'talk', 'Post-song response');
  STATE.lastInteraction = 'talk';
  
  // Auto-trigger next if still active (natural pause after speech finishes)
  if (STATE.sessionActive && STATE.mode === 'auto') {
    await new Promise(r => setTimeout(r, 1200)); // brief beat
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
  STATE.isPlaying = false;
  clearInterval(STATE.progressTimer);
  triggerInteraction('skip');
}

// ── Engagement Cue Handling ────────────────────────────────────
async function sendEngagementCue(type, intensity) {
  if (!STATE.currentSession) { showToast('Start a session to log engagement', '⚠️', 'warning'); return; }

  const r = await api('POST', '/engagement/event', {
    child_id: STATE.selectedChild.id,
    session_id: STATE.currentSession.id,
    event_type: type,
    intensity: intensity,
    duration_ms: 800 + Math.floor(Math.random()*1200),
    gaze_x: STATE.gazeX,
    gaze_y: STATE.gazeY,
    snippet_id: STATE.currentSnippet?.snippet_id || null
  });

  if (!r.success) return;

  // Visual feedback
  const badge = document.createElement('div');
  badge.className = 'emotion-badge';
  const colors = { smile:'bg-yellow-500 bg-opacity-80', laughter:'bg-pink-500 bg-opacity-80',
    fixation:'bg-green-500 bg-opacity-80', attention_loss:'bg-gray-500 bg-opacity-80', boredom:'bg-blue-900 bg-opacity-80' };
  const icons = { smile:'😊', laughter:'😂', fixation:'👀', attention_loss:'😴', boredom:'🥱' };
  badge.className = \`emotion-badge \${colors[type]||'bg-gray-600'}\`;
  badge.innerHTML = \`\${icons[type]||'•'} \${type.replace('_',' ')}\`;
  const overlay = document.getElementById('emotionOverlays');
  overlay.appendChild(badge);
  setTimeout(() => badge.remove(), 3000);

  // Update counters
  if (type === 'smile') {
    STATE.smileCount++;
    document.getElementById('smileCount').textContent = STATE.smileCount;
    
    // Trigger joy response if playing
    if (STATE.isPlaying && STATE.currentSnippet) {
      setTimeout(() => {
        const joyTexts = [
          \`That smile is everything, \${STATE.selectedChild.name}!\`,
          \`You are loving this! Keep smiling!\`,
          \`I love seeing you happy!\`
        ];
        const msg = joyTexts[Math.floor(Math.random() * joyTexts.length)];
        addChatBubble(msg + ' 😍', 'ai');
        // Don't speak joy response mid-song — just show in chat
      }, 500);
    }
  }
  if (type === 'laughter') {
    STATE.laughCount++;
    document.getElementById('laughCount').textContent = STATE.laughCount;
    const laughMsg = \`Haha! You are laughing! That makes me so happy too!\`;
    addChatBubble(laughMsg + ' 😂🎵', 'ai');
    if (!STATE.isPlaying) speakText(laughMsg);
    // Boost engagement score
    STATE.engScore = Math.min(100, STATE.engScore + 15);
    updateEngagementScoreUI();
  }
  if (type === 'fixation') {
    document.getElementById('fixationTime').textContent = Math.floor(Math.random()*8+2) + 's';
    STATE.engScore = Math.min(100, STATE.engScore + 8);
    updateEngagementScoreUI();
  }
  if (type === 'attention_loss' && STATE.sessionActive && !STATE.isPlaying) {
    setTimeout(async () => {
      const reengageTexts = [
        \`Hey \${STATE.selectedChild.name}! I have got something special!\`,
        \`Want to hear a really fun song?\`,
      ];
      const msg = reengageTexts[Math.floor(Math.random() * reengageTexts.length)];
      addChatBubble(msg + ' 🎵', 'ai');
      await speakText(msg);
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
  dot.style.left = (STATE.gazeX * 100) + '%';
  dot.style.top = (STATE.gazeY * 100) + '%';
  
  // Update camera gaze indicator
  const camDot = document.getElementById('gazeIndicator');
  const cam = document.getElementById('cameraFeed');
  if (STATE.sessionActive) {
    camDot.style.display = 'block';
    camDot.style.left = (STATE.gazeX * 100) + '%';
    camDot.style.top = (STATE.gazeY * 100) + '%';
  }
}

function sendGazeCue(e) {
  sendEngagementCue('fixation', 0.7 + Math.random() * 0.3);
}

// ── Background listening ──────────────────────────────────────
async function detectBackground() {
  if (!STATE.selectedChild || !STATE.currentSession) {
    showToast('Start a session first!', '⚠️', 'warning'); return;
  }
  const song = document.getElementById('bgSongInput').value.trim();
  if (!song) { showToast('Enter a song name first', '⚠️', 'warning'); return; }
  
  const r = await api('POST', '/engagement/background-detect', {
    child_id: STATE.selectedChild.id,
    session_id: STATE.currentSession.id,
    detected_song: song,
    confidence: 0.85
  });
  
  if (r.success) {
    STATE.bgSong = song;
    document.getElementById('bgDetected').classList.remove('hidden');
    document.getElementById('bgDetectedName').textContent = \`"\${song}" will be used as seed\`;
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

// ── TTS / Chat ────────────────────────────────────────────────
// speakText: strips emojis, applies expression engine, then speaks
// Returns a Promise that resolves when speech is DONE
async function speakText(text) {
  const cleanText = stripEmojisAndSymbols(text);
  if (!cleanText) return;

  // Apply expression engine for more human, energetic delivery
  const expressiveText = EXPRESSOR.express(cleanText);

  const openaiKey = localStorage.getItem('mb_openai_key');
  
  // Try OpenAI TTS if key available and session active
  if (openaiKey && STATE.currentSession && STATE.selectedChild) {
    try {
      const r = await api('POST', '/music/tts', {
        child_id: STATE.selectedChild.id,
        session_id: STATE.currentSession.id,
        text: expressiveText,
        trigger: 'speak'
      });
      if (r.success && r.data?.audio_url && !r.data.demo_mode) {
        // Duck any background music while talking
        const bgAudio = document.getElementById('audioPlayer');
        if (STATE.isPlaying) bgAudio.volume = Math.max(0.1, bgAudio.volume * 0.3);
        
        return new Promise((resolve) => {
          const ttsAudio = new Audio(r.data.audio_url);
          ttsAudio.volume = (parseInt(document.getElementById('masterVolume')?.value || 70)) / 100;
          ttsAudio.onended = () => {
            if (STATE.isPlaying) bgAudio.volume = (parseInt(document.getElementById('masterVolume')?.value || 70)) / 100;
            resolve();
          };
          ttsAudio.onerror = () => resolve();
          ttsAudio.play().catch(() => resolve());
        });
      }
    } catch (e) {
      // Fall through to Web Speech API
    }
  }
  
  // Fallback: Web Speech API (built into browser, zero cost, works everywhere)
  if (!('speechSynthesis' in window)) return;

  // Cancel any current utterance
  window.speechSynthesis.cancel();

  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(expressiveText);
    // Energy-based rate: high energy = slightly faster
    const baseRate = parseFloat(document.getElementById('ttsSpeed')?.value || 0.9);
    const energyBoost = STATE.energyLevel === 'high' ? 0.07 : STATE.energyLevel === 'low' ? -0.05 : 0;
    utter.rate = Math.max(0.7, Math.min(1.3, baseRate + energyBoost));
    utter.pitch = STATE.energyLevel === 'high' ? 1.35 : STATE.energyLevel === 'low' ? 1.05 : 1.2;
    utter.volume = (parseInt(document.getElementById('masterVolume')?.value || 70)) / 100;
    
    // Try to pick a warm, friendly voice
    const voices = window.speechSynthesis.getVoices();
    const friendly = voices.find(v => 
      v.name.includes('Samantha') || 
      v.name.includes('Karen') ||
      v.name.includes('Moira') ||
      v.name.includes('Google UK English Female') ||
      (v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
    ) || voices.find(v => v.lang.startsWith('en'));
    if (friendly) utter.voice = friendly;

    utter.onend = () => resolve();
    utter.onerror = () => resolve();

    // Chromium bug: speechSynthesis sometimes stalls — watchdog
    window.speechSynthesis.speak(utter);
    const watchdog = setTimeout(() => {
      window.speechSynthesis.cancel();
      resolve();
    }, (cleanText.length / 10 * 1000) + 4000); // rough upper bound
    utter.onend = () => { clearTimeout(watchdog); resolve(); };
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

  // Engagement chart
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

async function init() {
  // Load voices for TTS
  if ('speechSynthesis' in window) {
    speechSynthesis.getVoices();
    // Some browsers load voices async
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
  
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
    document.getElementById('nextActionIn').textContent = remaining + 's';
  }, 1000);
}

window.addEventListener('load', init);
</script>
</body>
</html>`;
}

export default app
