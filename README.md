# MusicBuddy AI — Full AI Child Platform

## 🌐 Live URLs
- **Production**: https://musicbuddy-ai.pages.dev
- **Demo (no login)**: https://musicbuddy-ai.pages.dev/demo

## 🎯 Platform Overview
A fully modular AI-powered child interaction, learning, and entertainment platform with:
- **Intent Layer architecture** (all logic flows through `IntentRouter`)
- **Tiered TTS** (OpenAI default → ElevenLabs premium → Amazon Polly fallback)
- **Groq behavior engine** (age-adaptive, personality-aware, emotion-driven)
- **Credit-based monetization** with Stripe subscriptions + one-time packs
- **Learning system** with 7 seed lessons + AI lesson generator
- **Analytics** with per-child tracking and parent dashboard
- **Canvas animation system** (confetti, celebration, encouragement)
- **Per-child voice preferences** (ElevenLabs 20 voices + OpenAI 6 voices)

## 💳 Monetization Tiers
| Tier | Price | Credits | Features |
|------|-------|---------|----------|
| Free | $0 | 3 lifetime + 5 trials | Games, basic TTS |
| Starter | $4.99/mo | 15/month | Lessons, AI songs |
| Premium | $9.99/mo | 30/month | Lesson generator, priority TTS |

### Credit Packs
- 10 credits — $2.99
- 25 credits — $4.99
- 60 credits — $9.99

## 🗄️ Database Tables (D1 SQLite)
- `auth_users` — users with `credits`, `subscription_tier`, `stripe_customer_id`
- `transactions` — full credit ledger (purchases, deductions, bonuses)
- `credit_usage_log` — per-action credit audit trail
- `lessons` — lesson catalogue (7 seeded, AI-generatable)
- `lesson_progress` — per-child lesson progress with score
- `analytics_events` — event tracking (lesson_started, correct_answer, etc.)
- `stripe_webhook_log` — idempotent webhook processing
- `subscriptions` — Stripe subscription state
- `tts_voice_preferences` — per-child voice settings with `child_id`
- `child_memory`, `groq_behavior_log`, `engagement_state`, etc.

## ⚙️ API Endpoints

### Spec-compliant shortcuts
- `POST /create-checkout-session` → Stripe Checkout
- `POST /webhook/stripe` → Webhook handler (HMAC-SHA256 verified)
- `GET /credits` → User credits + subscription
- `POST /use-credit` → Deduct credits (atomic)
- `GET /lessons` → Available lessons
- `POST /start-lesson` → Start lesson, returns progress_id
- `POST /submit-answer` → Evaluate answer, trigger animation
- `GET /analytics` → Parent analytics dashboard

### Full API
- `GET /api/billing/credits` — credits, tier, recent transactions
- `POST /api/billing/checkout` — Stripe Checkout session
- `GET /api/billing/subscription` — subscription status
- `GET /api/lessons` — lesson catalogue (filtered by age, topic)
- `GET /api/lessons/:id` — full lesson with steps
- `POST /api/lessons/start` — start lesson
- `POST /api/lessons/answer` — submit answer + EvaluateAnswer
- `POST /api/lessons/generate` — AI lesson generator (Groq, Starter+)
- `POST /api/analytics/track` — TrackEvent intent
- `GET /api/analytics` — parent analytics (30-day default)
- `GET /api/analytics/children` — per-child summary
- `POST /api/demo/tts` — demo TTS (Replicate always, no auth)

## 🔁 Intent Layer Flow
```
User Action → Intent Layer
→ Check credits / subscription (GetUserCredits / CheckCreditBalance)
→ Groq Behavior Engine (GenerateAdaptiveBehavior)
→ Apply age + personality + emotion (ApplyPersonality, UpdateEmotionState)
→ Generate response
→ ResolveTTSProvider → RequestTTS → CacheAudio
→ Play output
→ TrackEvent → TriggerAnimation
→ DeductCredits (if applicable)
```

## 🎓 Learning System
- **7 seed lessons**: Animals, Numbers, Colors, Letters, Shapes, Music, Advanced Math
- **Tier access**: Free (Animals, Numbers, Colors), Starter (Letters, Shapes, Music), Premium (Advanced Math)
- **AI Generator**: POST `/api/lessons/generate` — Groq creates lessons from topic + difficulty + age
- **Step types**: `intro` → `question` (multiple choice) → `reward`
- **Animations**: correct→confetti, complete→full_celebration, wrong→soft_encouragement

## 🔒 Security
- All API keys backend-only (Cloudflare Worker secrets)
- Stripe webhook verified via HMAC-SHA256
- No client-side credit logic
- Atomic DB credit deductions (UPDATE … WHERE credits >= amount)
- Idempotent webhook processing via `stripe_webhook_log`

## 🚀 Deployment
- **Platform**: Cloudflare Pages + D1 SQLite
- **Status**: ✅ Active
- **Stack**: Hono + TypeScript + TailwindCSS CDN + Groq + ElevenLabs/Replicate/OpenAI/Polly TTS
- **Version**: 3.0.0-full-platform

## 🔑 Required Secrets (Cloudflare Pages)
```
STRIPE_SECRET_KEY          — Stripe secret key
STRIPE_PUBLISHABLE_KEY     — Stripe publishable key  
STRIPE_WEBHOOK_SECRET      — Stripe webhook signing secret
OPENAI_API_KEY             — OpenAI TTS
ELEVENLABS_API_KEY         — ElevenLabs premium TTS
REPLICATE_API_KEY          — Replicate (ElevenLabs via API)
GROQ_API_KEY               — Groq behavior engine
AWS_ACCESS_KEY_ID          — Amazon Polly fallback
AWS_SECRET_ACCESS_KEY      — Amazon Polly fallback
AWS_REGION                 — Amazon Polly fallback
```

## 📊 To Do / Next Steps
- Add real Stripe Price IDs to `window._stripePrices` config
- Configure Stripe webhook endpoint in Stripe dashboard: `POST /webhook/stripe`
- Set all secrets via `npx wrangler pages secret put KEY_NAME --project-name musicbuddy-ai`
- Add parent analytics chart (Chart.js daily activity graph in billing tab)
- Add voice-based answer submission in lessons
- Add lesson completion certificate/reward screen
