# 🎵 MusicBuddy AI — Children's Interactive Music Companion

An AI-powered, 5-layer adaptive music companion for children ages 0–12, deployed on Cloudflare Pages.

## 🌐 Live URLs
- **Production App**: https://musicbuddy-ai.pages.dev
- **API Health**: https://musicbuddy-ai.pages.dev/api/health
- **GitHub**: https://github.com/mkbrown261/musicbuddy-ai

---

## ✅ Completed Features

### Layer 1 – UI
- Child profile manager (create/edit/delete, avatar, age, music style, screen-time limit)
- Live Companion tab: animated waveform, simulated camera feed with gaze dot & emotion overlays
- Engagement cue buttons (Smile, Laughter, Fixation, Lost Focus)
- Gaze simulation area (click/move to simulate eye tracking)
- AI Chat Bubble with Web Speech API TTS (real voice, free, built into browsers)
- Music Player with progress bar, play/repeat/skip controls
- Auto/Manual/BG Listening modes
- Parental Dashboard: Chart.js engagement doughnut, SVG screen-time ring, recommendations
- Music Library: per-child snippet history with play buttons
- Settings: Suno / Replicate / OpenAI API key entry with validation, wrangler secret instructions

### Layer 2 – API (17 endpoints)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | System health check |
| GET | `/api/profiles` | List all child profiles |
| POST | `/api/profiles` | Create profile + seed favorite songs |
| GET | `/api/profiles/:id` | Get profile with songs + adaptive data |
| PUT | `/api/profiles/:id` | Update profile |
| DELETE | `/api/profiles/:id` | Delete profile (cascades) |
| POST | `/api/profiles/:id/songs` | Add favorite song |
| POST | `/api/sessions/start` | Start session (closes stale sessions) |
| POST | `/api/sessions/:id/stop` | Stop session + update adaptive profile |
| POST | `/api/music/generate` | Generate music (Suno→Replicate→demo) |
| POST | `/api/music/tts` | Text-to-speech (OpenAI→Web Speech) |
| POST | `/api/music/interaction` | Full talk+sing cycle |
| POST | `/api/music/rate` | Rate snippet (updates adaptive learning) |
| GET | `/api/music/snippets/:childId` | Snippet history + top 5 |
| POST | `/api/music/keys/validate` | Validate API keys + report active provider |
| POST | `/api/engagement/event` | Log smile/laughter/fixation/attention_loss |
| POST | `/api/engagement/decide` | FSM engagement decision (stateless edge) |
| GET | `/api/engagement/summary/:childId` | Engagement metrics |
| POST | `/api/engagement/background-detect` | Log detected background song |
| GET | `/api/dashboard/:childId` | Full parental dashboard stats |
| POST | `/api/dashboard/:childId/rules` | Update parental rules |
| GET | `/api/dashboard/:childId/report` | Weekly engagement report |

### Layer 3 – Logic Engine (`src/lib/engine.ts`)
- **Engagement FSM**: talk→sing→talk cycles based on fixation + positive emotion cues
- **40+ conversation templates**: greetings, after-song, joy-response, re-engage, transition
- **Music prompt builder**: `buildMusicPrompt()` creates rich Suno/MusicGen prompts from seed songs, adaptive style, tempo, mood, child age
- **Adaptive learning**: `computeAdaptiveUpdate()` weighted RL that reinforces/diminishes styles and tempos
- **Deduplication**: `generatePromptHash()` + `varyPrompt()` ensures no two identical snippets
- **Auto-cycle guard**: prevents rapid looping (5s cooldown after song ends)

### Layer 4 – Database (Cloudflare D1 SQLite)
**9 tables** with 37-column schema:
- `child_profiles` — name, age, avatar, style, screen_time_limit
- `favorite_songs` — songs with bpm, mood, priority, play_count
- `music_snippets` — generated audio cache with engagement_score, generation_hash
- `sessions` — start/end times, duration tracking
- `engagement_events` — smile/laughter/fixation/attention events with gaze coords
- `interaction_log` — full TTS + song interaction history
- `parental_rules` — screen_time, volume_limit, content_filter rules
- `background_detections` — detected background songs with confidence
- `adaptive_profiles` — JSON weighted style/tempo scores, avg engagement

**Seeded demo data**: Emma (4), Liam (6), Mia (3) with songs, rules, and adaptive profiles.

### Layer 5 – Hosting (Cloudflare Pages + Workers)
- Hono v4 framework on Cloudflare Workers edge runtime
- D1 production database: `webapp-production` (ID: f15556d9-8cbf-4593-a552-465c1cc5e2f3)
- PM2 ecosystem for sandbox development
- CORS + logger middleware
- Security headers

---

## 🔌 API Integration Status

| Service | Status | Setup |
|---------|--------|-------|
| **Web Speech API (TTS)** | ✅ Active (free) | Built into browsers — zero config |
| **Demo Audio Pool** | ✅ Active (free) | 7 royalty-free Pixabay tracks |
| **Replicate/MusicGen** | 🔑 Needs key | `npx wrangler secret put REPLICATE_API_KEY` |
| **OpenAI TTS** | 🔑 Needs key | `npx wrangler secret put OPENAI_API_KEY` |
| **Suno AI** | 🚫 Private API | Not publicly open; requires enterprise access |
| **Vision/Camera** | 🔲 Simulated | Manual gaze simulation; real needs MediaPipe |
| **Audio Detection** | 🔲 Manual entry | Background song entered manually |

---

## ⚡ To Enable Real AI Music Generation

### Option A — Replicate API (Meta MusicGen, **RECOMMENDED**)
```bash
# ~$0.004 per 25-second generation
npx wrangler secret put REPLICATE_API_KEY
# (enter your r8_... token from https://replicate.com/account/api-tokens)

npm run build && npx wrangler pages deploy dist --project-name musicbuddy-ai
```

### Option B — OpenAI TTS (Real Child-Friendly Voice)
```bash
# ~$0.015 per 1K characters (very cheap for short phrases)
npx wrangler secret put OPENAI_API_KEY
# (enter your sk-... key from https://platform.openai.com/api-keys)

npm run build && npx wrangler pages deploy dist --project-name musicbuddy-ai
```

---

## 🧪 System Test

Run the full end-to-end test suite (92 tests):
```bash
python3 test_system.py
# or against a specific URL:
python3 test_system.py https://musicbuddy-ai.pages.dev
```

**Test Score: 100% (92/92)** ✅

---

## 🛠️ Local Development

```bash
npm install
npm run build
npx wrangler d1 migrations apply webapp-production --local
npx wrangler d1 execute webapp-production --local --file=./seed.sql
pm2 start ecosystem.config.cjs
# App at http://localhost:3000
```

---

## 📁 Project Structure

```
webapp/
├── src/
│   ├── index.tsx          # Main Hono app + entire SPA UI (single file)
│   ├── types.ts           # TypeScript types for all 5 layers
│   ├── lib/
│   │   ├── db.ts          # D1 database helper class
│   │   └── engine.ts      # Engagement FSM + music prompt builder + adaptive RL
│   └── routes/
│       ├── profiles.ts    # Child profile CRUD
│       ├── sessions.ts    # Session management
│       ├── engagement.ts  # Engagement events + FSM decide
│       ├── music.ts       # Music generation (Suno/Replicate/TTS/demo)
│       └── dashboard.ts   # Parental dashboard + reports
├── migrations/
│   └── 0001_initial_schema.sql
├── seed.sql               # Demo data (Emma, Liam, Mia)
├── test_system.py         # 92-test end-to-end test suite
├── ecosystem.config.cjs   # PM2 config for sandbox
├── wrangler.jsonc         # Cloudflare Pages + D1 config
└── package.json
```

---

## 🔐 Privacy & Safety

- No camera or microphone requested by default (all opt-in via Settings)
- Vision/gaze simulation is manual — no automatic face detection
- All child data stored in Cloudflare D1 (edge-distributed, GDPR-compliant)
- Parental controls: screen-time limits, volume caps, content filtering
- Adaptive learning operates locally on engagement logs — no external ML calls

---

## 🚀 Deployment

- **Platform**: Cloudflare Pages (edge, global CDN)
- **Status**: ✅ Live
- **Tech Stack**: Hono 4 + TypeScript + Tailwind CSS CDN + Chart.js + Web Speech API
- **Database**: Cloudflare D1 (SQLite at edge)
- **Last Updated**: 2026-03-19
