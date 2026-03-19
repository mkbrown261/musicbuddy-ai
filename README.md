# 🎵 MusicBuddy AI — Interactive Children's Music Companion

> A fully adaptive, AI-driven music and play companion for children, featuring live engagement monitoring, AI music generation, natural speech, parental controls, and a 5-layer cloud-edge architecture.

---

## 🌐 Live URL

**App:** https://3000-idbremwyohql3eun9mv08-8f57ffe2.sandbox.novita.ai  
**Health:** https://3000-idbremwyohql3eun9mv08-8f57ffe2.sandbox.novita.ai/api/health  
**Platform:** Cloudflare Pages (Edge) via Hono + D1 SQLite

---

## 🏗️ Architecture — 5 Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — UI LAYER                                             │
│  React-like SPA (vanilla JS + Tailwind CSS CDN)                 │
│  • Child profile management with avatar & style selection       │
│  • Live camera feed with gaze/emotion overlays                 │
│  • Waveform music player with progress tracking                 │
│  • Parental dashboard with charts + screen time ring           │
│  • Interaction timeline & engagement state machine display      │
│  • TTS chat bubble area with real-time responses                │
│  • Music library with snippet history                           │
│  • Settings: API keys, audio, privacy controls                  │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2 — API LAYER                                            │
│  Hono REST API (Cloudflare Workers edge runtime)                │
│  • /api/profiles      — CRUD child profiles + songs            │
│  • /api/sessions      — Start/stop play sessions               │
│  • /api/engagement    — Log events, decisions, bg detection     │
│  • /api/music         — Generate snippets, TTS, rate songs      │
│  • /api/dashboard     — Dashboard stats + parental rules        │
│  • /api/health        — System health check                     │
│  Integrations:                                                  │
│    - Suno API → AI music generation (20–30s snippets)          │
│    - OpenAI TTS → Natural child-directed speech                 │
│    - Web Speech API → Browser-native TTS fallback              │
│    - Pixabay CDN → Demo audio (no API key required)            │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 — LOGIC LAYER                                          │
│  src/lib/engine.ts                                              │
│  • EngagementEngine — talk/sing/wait/repeat decision FSM       │
│  • buildMusicPrompt() — constructs Suno API prompts            │
│  • computeAdaptiveUpdate() — reinforcement learning profile    │
│  • getConversationText() — 40+ parent-like phrase templates     │
│  • generatePromptHash() + varyPrompt() — dedup + variation     │
│  • getBestStyle/Tempo() — adaptive profile-driven selection     │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4 — DATABASE LAYER                                       │
│  Cloudflare D1 (SQLite) — 9 tables                             │
│  • child_profiles     — name, age, avatar, style, limits       │
│  • favorite_songs     — seeded reference songs per child       │
│  • music_snippets     — generated song cache + engagement       │
│  • sessions           — play session tracking                   │
│  • engagement_events  — smiles, laughter, fixation, gaze       │
│  • interaction_log    — full talk/sing event history           │
│  • parental_rules     — screen time, volume, content rules     │
│  • background_detections — detected ambient songs              │
│  • adaptive_profiles  — learning state per child               │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 5 — HOSTING LAYER                                        │
│  Cloudflare Pages + PM2 (dev sandbox)                          │
│  • Edge deployment via wrangler pages deploy                   │
│  • Local dev: PM2 + wrangler pages dev --d1 --local            │
│  • CORS enabled for all API routes                              │
│  • Privacy: no external data sharing, encrypted at rest         │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Completed Features

### UI Layer
- [x] Child profile creation (name, age, avatar, style, screen limit)
- [x] Animated dashboard with glassmorphism cards
- [x] Live camera feed simulation with gaze indicator & emotion overlays
- [x] Music waveform player with progress bar
- [x] Engagement cue buttons (smile, laughter, fixation, attention loss)
- [x] Gaze simulation area (click/hover to simulate fixation)
- [x] TTS chat bubble area with natural parent-like phrases
- [x] Interaction state machine display (current action, cycle phase)
- [x] Interaction timeline (visual event log)
- [x] Background listening input (seed song detection)
- [x] Music style + tempo + mood selectors
- [x] Parental dashboard with Chart.js doughnut chart
- [x] Screen time ring (animated SVG progress ring)
- [x] AI recommendations panel
- [x] Favorite styles bar charts from adaptive learning
- [x] Song library grid with play/rating
- [x] Parental rules editor (screen time, volume)
- [x] Settings: API keys, audio, privacy, system info
- [x] Toast notifications + modal dialogs
- [x] Stars + floating music notes background animation

### API Layer
- [x] GET/POST/PUT/DELETE /api/profiles
- [x] POST /api/sessions/start + /stop
- [x] POST /api/engagement/event (log emotion cues)
- [x] POST /api/engagement/decide (FSM decision)
- [x] POST /api/engagement/background-detect
- [x] GET  /api/engagement/summary/:childId
- [x] POST /api/music/generate (Suno + demo fallback)
- [x] POST /api/music/tts (OpenAI TTS)
- [x] POST /api/music/interaction (full cycle)
- [x] POST /api/music/rate (engagement feedback)
- [x] GET  /api/music/snippets/:childId
- [x] GET  /api/dashboard/:childId (full stats)
- [x] POST /api/dashboard/:childId/rules
- [x] GET  /api/dashboard/:childId/report

### Logic Layer
- [x] Engagement decision engine (talk/sing/wait/repeat FSM)
- [x] Natural conversation text with 40+ child-friendly templates
- [x] Music prompt builder (seed songs + style + tempo + age)
- [x] Adaptive profile update (reinforcement-weighted learning)
- [x] Prompt hash deduplication + variation algorithm
- [x] Background song detection → seed injection

### Database Layer
- [x] 9 D1 tables with migrations + seed data
- [x] 3 demo child profiles (Emma/Liam/Mia) with songs
- [x] Full cascade deletes, foreign keys, indexes
- [x] Engagement score accumulation per snippet

---

## 🔌 API Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| **Suno AI** | AI music snippet generation (20–30s) | Optional (demo fallback included) |
| **OpenAI TTS** | Natural speech synthesis | Optional (Web Speech API fallback) |
| **Web Speech API** | Browser TTS fallback | ✅ Built-in |
| **Pixabay CDN** | Demo audio files | ✅ Built-in |

### To enable real AI music generation:
1. Go to **Settings** tab in the app
2. Enter your Suno API key (from [sunoapi.org](https://sunoapi.org))
3. Enter your OpenAI API key (for TTS)
4. For production: add as Cloudflare secrets via `wrangler pages secret put`

---

## 📱 How to Use

### 1. Create a Child Profile
- Click **"New Profile"** in the top right
- Enter child's name, age, avatar, preferred music style
- Add their favorite songs (up to 5)
- Set screen time limit

### 2. Start a Companion Session
- Go to **Companion** tab
- Select the child (click their profile card or use "Select" button)
- Click **▶ Start** to begin the session
- The AI will greet the child and start the talk→sing cycle

### 3. Simulate Engagement (Demo Mode)
- Click the **😊 Smile / 😂 Laughter / 👀 Fixation / 😴 Lost Focus** buttons to simulate vision input
- Move/click the gaze area to simulate eye tracking
- The system responds in real-time with joy responses and song triggers

### 4. Generate Music
- Click the **✨ magic wand** button to manually trigger a song
- Or set mode to **🤖 Auto** for fully automatic cycling
- Use **Background Listening** to seed a detected song

### 5. Monitor as Parent
- Go to **Dashboard** tab and select the child
- View smiles, laughs, sessions, screen time, favorite styles
- Adjust parental rules (screen time limit, volume)
- Check **Library** tab for all generated songs + engagement scores

---

## 🗂️ Project Structure

```
webapp/
├── src/
│   ├── index.tsx           # Main app + full SPA UI (88KB)
│   ├── types.ts            # TypeScript types for all 5 layers
│   ├── lib/
│   │   ├── db.ts           # Database helper (D1 queries)
│   │   └── engine.ts       # Logic layer (FSM, prompts, adaptive AI)
│   └── routes/
│       ├── profiles.ts     # Child profile CRUD
│       ├── sessions.ts     # Session management
│       ├── engagement.ts   # Engagement event processing
│       ├── music.ts        # Music generation + TTS
│       └── dashboard.ts    # Parental dashboard
├── migrations/
│   └── 0001_initial_schema.sql   # 9-table D1 schema
├── seed.sql                # Demo profiles + songs
├── ecosystem.config.cjs    # PM2 config
├── wrangler.jsonc          # Cloudflare config + D1 binding
├── vite.config.ts          # Vite + Hono build config
├── package.json
└── tsconfig.json
```

---

## 🚀 Development Commands

```bash
# Build
npm run build

# Start dev server (with D1 local database)
npm run dev:d1

# Database operations
npm run db:migrate:local    # Apply migrations locally
npm run db:seed             # Insert demo data
npm run db:reset            # Reset + re-seed local DB

# PM2 management
npm run start               # Start with PM2
pm2 logs musicbuddy --nostream
pm2 restart musicbuddy

# Deploy to Cloudflare Pages
npm run deploy:prod
```

---

## 📊 Data Flow

```
Child Engagement → Vision API → EngagementEngine.decide()
                                    ↓
                         talk? → TTS text → Web Speech API
                         sing? → buildMusicPrompt() → Suno API
                                    ↓
                         Audio stream → Player → Child hears
                                    ↓
                    Engagement logged → D1 → adaptive_profiles updated
                                    ↓
                    Next cycle triggered (auto mode, 30s interval)
```

---

## 🔒 Privacy & Safety

- All session data stored locally in Cloudflare D1 (your account only)
- No video/audio transmitted externally without explicit API configuration
- Camera monitoring is opt-in (Settings → Privacy)
- Child-safe content filtering via parental rules
- Screen time enforcement with configurable limits

---

## 🗺️ Roadmap (Future Features)

- [ ] Real WebRTC camera integration for live gaze tracking (MediaPipe)
- [ ] Actual Suno/Udio API webhook polling for audio delivery
- [ ] Waveform visualization from actual audio data (Web Audio API)
- [ ] Multi-device sync (parent phone + child tablet)
- [ ] Weekly PDF engagement report export
- [ ] Voice fingerprinting to identify which child is present

---

**Deployment:** Cloudflare Pages (Edge) | **DB:** Cloudflare D1 SQLite | **Build:** Vite + Hono | **Last Updated:** 2026-03-19
