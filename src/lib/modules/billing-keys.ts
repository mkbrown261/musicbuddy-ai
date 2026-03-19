// ============================================================
// MODULE 6: Billing & API Key Provisioning
//            src/lib/modules/billing-keys.ts
// ============================================================
// Intent Layer Intents handled:
//   PURCHASE_API_KEY — initiate payment for a plan
//   VERIFY_PAYMENT   — confirm Stripe/PayPal payment succeeded
//   INJECT_KEY       — provision server-side API keys after payment
//   CHECK_KEY_STATUS — return active key/subscription status
//   PROVISION_KEYS   — batch-provision all keys for a subscription
//
// Security model:
//   • Keys are NEVER exposed to the client
//   • All provider calls are server-side only
//   • Subscription state stored in D1
//   • Keys retrieved from Cloudflare secrets at runtime
//   • Users can also bring their own keys (stored server-side via KV)
// ============================================================

import type { IntentModule, IntentPayload, IntentResult } from '../intent-router';

// ── Plan definitions ──────────────────────────────────────────
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price_monthly: 0,
    price_id_stripe: '',
    features: ['songs_free', 'tts_basic', 'tts_premium_trial', 'camera_basic', 'dashboard', 'mini_games', 'song_library', 'rewards_xp', 'creator_mode'],
    api_providers: [],
    tts_voices: ['shimmer'],
    description: 'Perfect to get started',
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    price_monthly: 4.99,
    price_id_stripe: 'price_basic_monthly',
    features: ['songs_free', 'tts_basic', 'ai_music_gen', 'camera_basic', 'gaze_basic', 'dashboard', 'mini_games', 'song_library', 'ai_lyrics', 'rewards_xp', 'creator_mode'],
    api_providers: ['openai', 'replicate'],
    tts_voices: ['shimmer', 'nova', 'alloy'],
    description: 'AI music generation + expanded voices',
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price_monthly: 9.99,
    price_id_stripe: 'price_premium_monthly',
    features: ['songs_free', 'tts_basic', 'tts_premium_trial', 'elevenlabs_premium', 'ai_music_gen', 'camera_basic', 'gaze_basic', 'dashboard', 'mini_games', 'song_library', 'ai_lyrics', 'rewards_xp', 'creator_mode'],
    api_providers: ['openai', 'replicate', 'elevenlabs', 'suno'],
    tts_voices: ['rachel', 'elli', 'bella', 'charlie', 'shimmer', 'nova'],
    description: 'Everything: ElevenLabs, Suno AI, all voices',
  },
};

// ── DB helpers ────────────────────────────────────────────────
async function getSubscription(db: any, userId: string): Promise<any> {
  return await db.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).first();
}

async function upsertSubscription(db: any, data: {
  user_id: string; plan_id: string; stripe_subscription_id?: string;
  stripe_customer_id?: string; status: string; current_period_end?: string;
}): Promise<void> {
  await db.prepare(
    `INSERT INTO subscriptions
       (user_id, plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_end)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       plan_id = excluded.plan_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       stripe_customer_id = excluded.stripe_customer_id,
       status = excluded.status,
       current_period_end = excluded.current_period_end,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(
    data.user_id, data.plan_id,
    data.stripe_subscription_id ?? null,
    data.stripe_customer_id ?? null,
    data.status,
    data.current_period_end ?? null
  ).run();
}

async function logKeyProvision(db: any, userId: string, provider: string, planId: string): Promise<void> {
  await db.prepare(
    `INSERT INTO key_provision_log (user_id, provider, plan_id) VALUES (?, ?, ?)`
  ).bind(userId, provider, planId).run();
}

// ── Billing & Key Module ──────────────────────────────────────
export class BillingKeysModule implements IntentModule {
  handles = ['PURCHASE_API_KEY', 'VERIFY_PAYMENT', 'INJECT_KEY', 'CHECK_KEY_STATUS', 'PROVISION_KEYS'] as any[];

  async handle(payload: IntentPayload, env: any, db: any): Promise<IntentResult> {
    switch (payload.intent) {

      // ── PURCHASE_API_KEY ────────────────────────────────────
      case 'PURCHASE_API_KEY': {
        const { plan_id, payment_method_id, email } = payload.data as {
          plan_id: string; payment_method_id: string; email?: string;
        };
        const userId = payload.userId ?? 'demo';
        const plan = (PLANS as any)[plan_id];
        const stripeKey = env.STRIPE_SECRET_KEY;

        if (!plan) return { success: false, intent: 'PURCHASE_API_KEY', error: 'Invalid plan' };

        if (plan_id === 'free') {
          await upsertSubscription(db, { user_id: userId, plan_id: 'free', status: 'active' });
          return { success: true, intent: 'PURCHASE_API_KEY', data: { plan, status: 'active', message: 'Free plan activated' } };
        }

        if (!stripeKey) {
          // Demo mode: simulate subscription
          await upsertSubscription(db, { user_id: userId, plan_id, status: 'demo_active' });
          return { success: true, intent: 'PURCHASE_API_KEY',
            data: { plan, status: 'demo_active', demo: true, message: 'Demo mode: Stripe not configured. Plan activated for testing.' } };
        }

        // Create Stripe customer + subscription
        try {
          // Step 1: Create or retrieve customer
          const custRes = await fetch('https://api.stripe.com/v1/customers', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              payment_method: payment_method_id,
              email: email ?? '',
              'invoice_settings[default_payment_method]': payment_method_id,
            }).toString(),
          });
          const customer = await custRes.json() as { id: string; error?: { message: string } };
          if (customer.error) throw new Error(customer.error.message);

          // Step 2: Create subscription
          const subRes = await fetch('https://api.stripe.com/v1/subscriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              customer: customer.id,
              'items[0][price]': plan.price_id_stripe,
              'payment_behavior': 'default_incomplete',
              'expand[]': 'latest_invoice.payment_intent',
            }).toString(),
          });
          const subscription = await subRes.json() as { id: string; status: string; current_period_end: number; latest_invoice?: any; error?: any };
          if (subscription.error) throw new Error(subscription.error.message);

          const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;
          await upsertSubscription(db, {
            user_id: userId, plan_id, stripe_subscription_id: subscription.id,
            stripe_customer_id: customer.id, status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });

          return { success: true, intent: 'PURCHASE_API_KEY',
            data: { plan, subscription_id: subscription.id, client_secret: clientSecret, status: subscription.status } };
        } catch (e: any) {
          return { success: false, intent: 'PURCHASE_API_KEY', error: e.message };
        }
      }

      // ── VERIFY_PAYMENT ──────────────────────────────────────
      case 'VERIFY_PAYMENT': {
        const { subscription_id, payment_intent_id } = payload.data as {
          subscription_id?: string; payment_intent_id?: string;
        };
        const userId = payload.userId ?? 'demo';
        const stripeKey = env.STRIPE_SECRET_KEY;

        if (!stripeKey) {
          // Demo: accept all
          const sub = await getSubscription(db, userId);
          if (sub) {
            await db.prepare('UPDATE subscriptions SET status = ? WHERE user_id = ?').bind('active', userId).run();
          }
          return { success: true, intent: 'VERIFY_PAYMENT', data: { verified: true, demo: true } };
        }

        try {
          let verified = false;
          if (subscription_id) {
            const r = await fetch(`https://api.stripe.com/v1/subscriptions/${subscription_id}`, {
              headers: { 'Authorization': `Bearer ${stripeKey}` }
            });
            const sub = await r.json() as { status: string; current_period_end: number };
            verified = sub.status === 'active' || sub.status === 'trialing';
            if (verified) {
              await db.prepare('UPDATE subscriptions SET status = ?, current_period_end = ? WHERE user_id = ?')
                .bind(sub.status, new Date(sub.current_period_end * 1000).toISOString(), userId).run();
            }
          }
          return { success: true, intent: 'VERIFY_PAYMENT', data: { verified } };
        } catch (e: any) {
          return { success: false, intent: 'VERIFY_PAYMENT', error: e.message };
        }
      }

      // ── INJECT_KEY ──────────────────────────────────────────
      // Server-side only. Returns capability flags, never raw keys.
      case 'INJECT_KEY': {
        const userId = payload.userId ?? 'demo';
        const sub = await getSubscription(db, userId);

        if (!sub || (sub.status !== 'active' && sub.status !== 'trialing' && sub.status !== 'demo_active')) {
          return { success: false, intent: 'INJECT_KEY', error: 'No active subscription', data: { requires_upgrade: true } };
        }

        const plan = (PLANS as any)[sub.plan_id] ?? PLANS.free;

        // Build capability map (never expose raw keys)
        const capabilities = {
          plan_id: plan.id,
          tts_voices: plan.tts_voices,
          has_openai: !!(env.OPENAI_API_KEY) && plan.api_providers.includes('openai'),
          has_replicate: !!(env.REPLICATE_API_KEY) && plan.api_providers.includes('replicate'),
          has_elevenlabs: !!(env.ELEVENLABS_API_KEY) && plan.api_providers.includes('elevenlabs'),
          has_suno: !!(env.SUNO_API_KEY) && plan.api_providers.includes('suno'),
          features: plan.features,
        };

        // Log provision event
        for (const provider of plan.api_providers) {
          await logKeyProvision(db, userId, provider, plan.id);
        }

        return { success: true, intent: 'INJECT_KEY', data: { capabilities, plan } };
      }

      // ── CHECK_KEY_STATUS ────────────────────────────────────
      case 'CHECK_KEY_STATUS': {
        const userId = payload.userId ?? 'demo';
        const sub = await getSubscription(db, userId);
        const plan = sub ? ((PLANS as any)[sub.plan_id] ?? PLANS.free) : PLANS.free;

        return {
          success: true, intent: 'CHECK_KEY_STATUS',
          data: {
            has_subscription: !!sub,
            plan: plan,
            status: sub?.status ?? 'none',
            current_period_end: sub?.current_period_end ?? null,
            server_capabilities: {
              openai: !!(env.OPENAI_API_KEY),
              replicate: !!(env.REPLICATE_API_KEY),
              elevenlabs: !!(env.ELEVENLABS_API_KEY),
              suno: !!(env.SUNO_API_KEY),
              stripe: !!(env.STRIPE_SECRET_KEY),
            },
            stripe_publishable_key: env.STRIPE_PUBLISHABLE_KEY ?? null,
          }
        };
      }

      // ── PROVISION_KEYS ──────────────────────────────────────
      case 'PROVISION_KEYS': {
        const userId = payload.userId ?? 'demo';
        const { plan_id } = payload.data as { plan_id: string };
        const plan = (PLANS as any)[plan_id] ?? PLANS.free;

        // Update subscription
        await upsertSubscription(db, { user_id: userId, plan_id, status: 'active' });

        // Log all providers
        for (const provider of plan.api_providers) {
          await logKeyProvision(db, userId, provider, plan_id);
        }

        return { success: true, intent: 'PROVISION_KEYS',
          data: { provisioned: plan.api_providers, plan_id, message: 'Keys provisioned server-side' } };
      }

      default:
        return { success: false, intent: payload.intent as any, error: 'Unknown intent' };
    }
  }
}
