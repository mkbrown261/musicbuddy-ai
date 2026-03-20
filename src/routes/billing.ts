// ============================================================
// Billing Route — Phase 6 (Full Monetization)
// Intent Layer:
//   CreateCheckoutSession, HandlePaymentSuccess, GetUserCredits,
//   AddCredits, DeductCredits, CheckCreditBalance,
//   GetSubscriptionStatus, CancelSubscription
// ============================================================

import { Hono } from 'hono';
import type { Bindings } from '../types';

const billing = new Hono<{ Bindings: Bindings }>();

// ── Tier definitions (single source of truth) ─────────────────
export const TIERS = {
  free:    { name: 'Free',       price: 0,    credits: 3,  monthlyCredits: 0,  trialUses: 5  },
  starter: { name: 'Starter',    price: 499,  credits: 15, monthlyCredits: 15, trialUses: 0  },
  premium: { name: 'Premium',    price: 999,  credits: 30, monthlyCredits: 30, trialUses: 0  },
};

export const CREDIT_PACKS = [
  { id: 'pack_10',  credits: 10, price_cents: 299,  label: '10 Credits',  price_label: '$2.99' },
  { id: 'pack_25',  credits: 25, price_cents: 499,  label: '25 Credits',  price_label: '$4.99' },
  { id: 'pack_60',  credits: 60, price_cents: 999,  label: '60 Credits',  price_label: '$9.99' },
];

// ── Helper: resolve user from auth token or query param ────────
async function resolveUser(c: any): Promise<{ id: string; email: string; subscription_tier: string; credits: number; trial_uses_remaining: number } | null> {
  const db = c.env.DB;
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const row = await db.prepare(
    `SELECT u.id, u.email, u.subscription_tier, u.credits, u.trial_uses_remaining
     FROM auth_sessions s JOIN auth_users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first<{ id: string; email: string; subscription_tier: string; credits: number; trial_uses_remaining: number }>();
  return row || null;
}

// ── Helper: track analytics event ─────────────────────────────
async function trackEvent(db: any, userId: string, childId: number | null, eventType: string, value = 1, metadata = {}) {
  try {
    await db.prepare(
      `INSERT INTO analytics_events (user_id, child_id, event_type, value, metadata) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, childId, eventType, value, JSON.stringify(metadata)).run();
  } catch (_) { /* non-blocking */ }
}

// ── Helper: log transaction ────────────────────────────────────
async function logTransaction(db: any, userId: string, type: string, amountCents: number, creditsDelta: number, description: string, extra: Record<string, any> = {}) {
  await db.prepare(
    `INSERT INTO transactions (user_id, type, amount_cents, credits_delta, description, stripe_payment_intent, stripe_subscription_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    userId, type, amountCents, creditsDelta, description,
    extra.stripe_payment_intent || null,
    extra.stripe_subscription_id || null,
    JSON.stringify(extra.metadata || {})
  ).run();
}

// ═══════════════════════════════════════════════════════════════
// ── GET /status — public config (no auth required) ────────────
// ═══════════════════════════════════════════════════════════════
billing.get('/status', async (c) => {
  const user = await resolveUser(c);
  return c.json({
    success: true,
    data: {
      has_stripe: !!(c.env as any).STRIPE_SECRET_KEY,
      stripe_publishable_key: (c.env as any).STRIPE_PUBLISHABLE_KEY || null,
      tiers: TIERS,
      credit_packs: CREDIT_PACKS,
      user_credits: user?.credits ?? null,
      user_tier: user?.subscription_tier ?? null,
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ── GET /credits — Intent: GetUserCredits ─────────────────────
// ═══════════════════════════════════════════════════════════════
billing.get('/credits', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const db = c.env.DB;

  // Fetch subscription record
  const sub = await db.prepare(
    `SELECT plan_id, status, stripe_subscription_id, current_period_end
     FROM subscriptions WHERE user_id = ?`
  ).bind(user.id).first<any>();

  // Last 5 transactions
  const txns = await db.prepare(
    `SELECT type, credits_delta, description, created_at
     FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`
  ).bind(user.id).all();

  return c.json({
    success: true,
    data: {
      credits:                user.credits,
      subscription_tier:      user.subscription_tier,
      trial_uses_remaining:   user.trial_uses_remaining,
      tier_info:              TIERS[user.subscription_tier as keyof typeof TIERS] || TIERS.free,
      subscription:           sub || null,
      recent_transactions:    txns.results || [],
      credit_packs:           CREDIT_PACKS,
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ── POST /use-credit — Intent: DeductCredits ──────────────────
// ═══════════════════════════════════════════════════════════════
billing.post('/use-credit', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ action: string; child_id?: number; amount?: number }>();
  const { action = 'song_gen', child_id, amount = 1 } = body;
  const db = c.env.DB;

  // Validate sufficient credits
  if (user.credits < amount) {
    await trackEvent(db, user.id, child_id || null, 'upgrade_triggered', 1, { reason: 'no_credits', action });
    return c.json({
      success: false,
      error: 'Insufficient credits',
      data: { credits_remaining: user.credits, needed: amount, upgrade_url: '/billing/upgrade' }
    }, 402);
  }

  // Deduct credits atomically
  const result = await db.prepare(
    `UPDATE auth_users SET credits = credits - ? WHERE id = ? AND credits >= ?`
  ).bind(amount, user.id, amount).run();

  if (result.meta.changes === 0) {
    return c.json({ success: false, error: 'Insufficient credits (concurrent)' }, 402);
  }

  // Log credit usage
  await db.prepare(
    `INSERT INTO credit_usage_log (user_id, child_id, action, credits, metadata) VALUES (?, ?, ?, ?, ?)`
  ).bind(user.id, child_id || null, action, amount, JSON.stringify({ action })).run();

  await logTransaction(db, user.id, 'deduct', 0, -amount, `Used ${amount} credit(s): ${action}`);
  await trackEvent(db, user.id, child_id || null, 'credits_used', amount, { action });

  const updatedUser = await db.prepare(
    'SELECT credits FROM auth_users WHERE id = ?'
  ).bind(user.id).first<{ credits: number }>();

  return c.json({
    success: true,
    data: { credits_remaining: updatedUser?.credits ?? user.credits - amount, deducted: amount }
  });
});

// ═══════════════════════════════════════════════════════════════
// ── POST /checkout — Intent: CreateCheckoutSession ────────────
// Creates a Stripe Checkout session for subscription OR credit pack
// ═══════════════════════════════════════════════════════════════
billing.post('/checkout', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const stripeKey = (c.env as any).STRIPE_SECRET_KEY;
  if (!stripeKey) return c.json({ success: false, error: 'Stripe not configured', demo_mode: true }, 503);

  const body = await c.req.json<{
    product_type: 'subscription' | 'credit_pack';
    price_id?: string;
    pack_id?: string;
    success_url?: string;
    cancel_url?: string;
  }>();

  const { product_type, price_id, pack_id } = body;
  const origin = c.req.header('origin') || 'https://musicbuddy-ai.pages.dev';
  const successUrl = body.success_url || `${origin}/?payment=success`;
  const cancelUrl  = body.cancel_url  || `${origin}/?payment=cancelled`;

  const db = c.env.DB;

  // Ensure or create Stripe customer
  let stripeCustomerId = (await db.prepare(
    'SELECT stripe_customer_id FROM auth_users WHERE id = ?'
  ).bind(user.id).first<{ stripe_customer_id: string }>())?.stripe_customer_id;

  if (!stripeCustomerId) {
    const custRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: user.email, 'metadata[user_id]': user.id }).toString(),
    });
    const cust = await custRes.json() as any;
    if (!custRes.ok) return c.json({ success: false, error: cust?.error?.message || 'Customer creation failed' }, 500);
    stripeCustomerId = cust.id;
    await db.prepare('UPDATE auth_users SET stripe_customer_id = ? WHERE id = ?').bind(stripeCustomerId, user.id).run();
  }

  let lineItems: any[] = [];
  let mode: string;
  let metadata: Record<string, string> = { user_id: user.id };

  if (product_type === 'subscription' && price_id) {
    mode = 'subscription';
    lineItems = [{ price: price_id, quantity: 1 }];
    metadata.product_type = 'subscription';
  } else if (product_type === 'credit_pack' && pack_id) {
    const pack = CREDIT_PACKS.find(p => p.id === pack_id);
    if (!pack) return c.json({ success: false, error: 'Invalid pack_id' }, 400);
    mode = 'payment';
    metadata = { ...metadata, product_type: 'credit_pack', pack_id, credits: String(pack.credits) };

    // Create price on the fly if no price_id (one-time payment)
    if (price_id) {
      lineItems = [{ price: price_id, quantity: 1 }];
    } else {
      lineItems = [{
        price_data: {
          currency: 'usd',
          unit_amount: pack.price_cents,
          product_data: { name: `MusicBuddy AI — ${pack.label}`, description: `${pack.credits} credits for songs and lessons` },
        },
        quantity: 1,
      }];
    }
  } else {
    return c.json({ success: false, error: 'product_type and price_id/pack_id required' }, 400);
  }

  // Build Checkout Session params
  const params: Record<string, string> = {
    customer:     stripeCustomerId,
    mode,
    success_url:  successUrl + '&session_id={CHECKOUT_SESSION_ID}',
    cancel_url:   cancelUrl,
    'metadata[user_id]': user.id,
    'metadata[product_type]': metadata.product_type,
  };

  if (metadata.pack_id)  params['metadata[pack_id]']  = metadata.pack_id;
  if (metadata.credits)  params['metadata[credits]']  = metadata.credits;

  lineItems.forEach((item, i) => {
    if (item.price) {
      params[`line_items[${i}][price]`]    = item.price;
      params[`line_items[${i}][quantity]`] = String(item.quantity);
    } else if (item.price_data) {
      params[`line_items[${i}][price_data][currency]`]                   = item.price_data.currency;
      params[`line_items[${i}][price_data][unit_amount]`]                = String(item.price_data.unit_amount);
      params[`line_items[${i}][price_data][product_data][name]`]         = item.price_data.product_data.name;
      params[`line_items[${i}][price_data][product_data][description]`]  = item.price_data.product_data.description;
      params[`line_items[${i}][quantity]`]                               = String(item.quantity);
    }
  });

  const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  const session = await sessionRes.json() as any;
  if (!sessionRes.ok) return c.json({ success: false, error: session?.error?.message || 'Checkout session failed' }, 500);

  await trackEvent(db, user.id, null, 'checkout_initiated', 1, { product_type, pack_id, mode });

  return c.json({ success: true, data: { checkout_url: session.url, session_id: session.id } });
});

// ═══════════════════════════════════════════════════════════════
// ── POST /webhook/stripe — Intent: HandlePaymentSuccess ────────
// Verifies Stripe signature, processes events, awards credits
// ═══════════════════════════════════════════════════════════════
billing.post('/webhook/stripe', async (c) => {
  const stripeKey        = (c.env as any).STRIPE_SECRET_KEY;
  const webhookSecret    = (c.env as any).STRIPE_WEBHOOK_SECRET;
  const db               = c.env.DB;

  if (!stripeKey) return c.json({ error: 'Not configured' }, 503);

  const rawBody    = await c.req.text();
  const signature  = c.req.header('stripe-signature') || '';

  // ── Signature verification via HMAC-SHA256 ────────────────
  if (webhookSecret && signature) {
    try {
      const sigParts = Object.fromEntries(signature.split(',').map(p => p.split('=')));
      const timestamp = sigParts['t'];
      const sigV1    = sigParts['v1'];
      const payload  = `${timestamp}.${rawBody}`;

      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
      const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

      if (computed !== sigV1) {
        return c.json({ error: 'Invalid signature' }, 400);
      }
    } catch (_) {
      return c.json({ error: 'Signature verification failed' }, 400);
    }
  }

  let event: any;
  try { event = JSON.parse(rawBody); }
  catch (_) { return c.json({ error: 'Invalid JSON' }, 400); }

  // Idempotency guard
  const existing = await db.prepare(
    'SELECT id FROM stripe_webhook_log WHERE stripe_event_id = ?'
  ).bind(event.id).first();
  if (existing) return c.json({ received: true, status: 'already_processed' });

  // Log the event first
  await db.prepare(
    `INSERT INTO stripe_webhook_log (stripe_event_id, event_type, processed) VALUES (?, ?, 0)`
  ).bind(event.id, event.type).run();

  try {
    const obj = event.data?.object;
    const metadata = obj?.metadata || {};
    const userId = metadata.user_id;

    switch (event.type) {

      // ── One-time payment success (credit pack) ────────────
      case 'checkout.session.completed': {
        if (obj.payment_status !== 'paid') break;
        if (metadata.product_type === 'credit_pack') {
          const credits = parseInt(metadata.credits || '0', 10);
          const packId  = metadata.pack_id || 'unknown';
          if (userId && credits > 0) {
            await db.prepare(
              'UPDATE auth_users SET credits = credits + ? WHERE id = ?'
            ).bind(credits, userId).run();
            await logTransaction(db, userId, 'purchase', obj.amount_total || 0, credits,
              `Purchased ${credits} credits (${packId})`,
              { stripe_payment_intent: obj.payment_intent, metadata: { pack_id: packId } }
            );
            await trackEvent(db, userId, null, 'credits_purchased', credits, { pack_id: packId });
          }
        }
        break;
      }

      // ── Subscription created/renewed ──────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const priceId       = obj.items?.data?.[0]?.price?.id || '';
        const priceAmt      = obj.items?.data?.[0]?.price?.unit_amount || 0;
        const periodEnd     = new Date(obj.current_period_end * 1000).toISOString();
        const status        = obj.status; // active | trialing | past_due | canceled

        // Resolve tier from price amount
        let tier = 'starter';
        if (priceAmt >= 999) tier = 'premium';
        else if (priceAmt >= 499) tier = 'starter';

        const monthlyCredits = TIERS[tier as keyof typeof TIERS]?.monthlyCredits || 0;

        // Find user by stripe customer id
        let resolvedUserId = userId;
        if (!resolvedUserId) {
          const u = await db.prepare(
            'SELECT id FROM auth_users WHERE stripe_customer_id = ?'
          ).bind(obj.customer).first<{ id: string }>();
          resolvedUserId = u?.id;
        }

        if (resolvedUserId && status === 'active') {
          // Update subscription table
          await db.prepare(
            `INSERT INTO subscriptions (user_id, plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_end)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               plan_id = excluded.plan_id,
               stripe_subscription_id = excluded.stripe_subscription_id,
               status = excluded.status,
               current_period_end = excluded.current_period_end,
               updated_at = CURRENT_TIMESTAMP`
          ).bind(resolvedUserId, tier, obj.id, obj.customer, status, periodEnd).run();

          // Grant monthly credits + update tier
          await db.prepare(
            `UPDATE auth_users SET subscription_tier = ?, credits = credits + ? WHERE id = ?`
          ).bind(tier, monthlyCredits, resolvedUserId).run();

          await logTransaction(db, resolvedUserId, 'subscription', priceAmt, monthlyCredits,
            `${tier} subscription — ${monthlyCredits} credits granted`,
            { stripe_subscription_id: obj.id }
          );
          await trackEvent(db, resolvedUserId, null, 'subscription_activated', 1, { tier, price_id: priceId });
        }
        break;
      }

      // ── Subscription cancelled ────────────────────────────
      case 'customer.subscription.deleted': {
        let resolvedUserId = userId;
        if (!resolvedUserId) {
          const u = await db.prepare(
            'SELECT id FROM auth_users WHERE stripe_customer_id = ?'
          ).bind(obj.customer).first<{ id: string }>();
          resolvedUserId = u?.id;
        }
        if (resolvedUserId) {
          await db.prepare(
            `UPDATE subscriptions SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
          ).bind(resolvedUserId).run();
          await db.prepare(
            `UPDATE auth_users SET subscription_tier = 'free' WHERE id = ?`
          ).bind(resolvedUserId).run();
          await trackEvent(db, resolvedUserId, null, 'subscription_cancelled', 1, {});
        }
        break;
      }
    }

    // Mark processed
    await db.prepare(
      'UPDATE stripe_webhook_log SET processed = 1 WHERE stripe_event_id = ?'
    ).bind(event.id).run();

    return c.json({ received: true });
  } catch (e: any) {
    await db.prepare(
      'UPDATE stripe_webhook_log SET error = ? WHERE stripe_event_id = ?'
    ).bind(e.message, event.id).run();
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// ── GET /subscription — current subscription status ───────────
// ═══════════════════════════════════════════════════════════════
billing.get('/subscription', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const db = c.env.DB;
  const sub = await db.prepare(
    `SELECT plan_id, status, stripe_subscription_id, current_period_end, created_at
     FROM subscriptions WHERE user_id = ?`
  ).bind(user.id).first<any>();

  return c.json({
    success: true,
    data: {
      subscription_tier: user.subscription_tier,
      credits: user.credits,
      trial_uses_remaining: user.trial_uses_remaining,
      subscription: sub || null,
      tiers: TIERS,
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ── POST /add-credits — admin / manual credit grant ───────────
// ═══════════════════════════════════════════════════════════════
billing.post('/add-credits', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ amount: number; reason?: string }>();
  const { amount, reason = 'manual_grant' } = body;
  if (!amount || amount < 1 || amount > 1000) return c.json({ success: false, error: 'Invalid amount' }, 400);

  const db = c.env.DB;
  await db.prepare('UPDATE auth_users SET credits = credits + ? WHERE id = ?').bind(amount, user.id).run();
  await logTransaction(db, user.id, 'bonus', 0, amount, `Bonus credits: ${reason}`);
  await trackEvent(db, user.id, null, 'credits_purchased', amount, { reason });

  const updated = await db.prepare('SELECT credits FROM auth_users WHERE id = ?').bind(user.id).first<{ credits: number }>();
  return c.json({ success: true, data: { credits: updated?.credits ?? 0 } });
});

export { billing };
