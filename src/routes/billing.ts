// ============================================================
// Billing Route — Phase 5
// Intent Layer: PurchaseAPIKey, VerifyPayment, InjectKey, CheckKeyStatus
// Stripe integration + key provisioning
// ============================================================

import { Hono } from 'hono';
import type { Bindings } from '../types';

const billing = new Hono<{ Bindings: Bindings }>();

// ── Intent: CheckKeyStatus ────────────────────────────────────
billing.get('/status', async (c) => {
  // In production: check DB for user's subscription status
  // For now: returns public info only (keys never exposed to client)
  return c.json({
    success: true,
    data: {
      has_stripe_configured: !!(c.env as any).STRIPE_SECRET_KEY,
      has_openai: !!(c.env as any).OPENAI_API_KEY,
      has_replicate: !!(c.env as any).REPLICATE_API_KEY,
      has_elevenlabs: !!(c.env as any).ELEVENLABS_API_KEY,
      stripe_publishable_key: (c.env as any).STRIPE_PUBLISHABLE_KEY || null,
    }
  });
});

// ── Intent: PurchaseAPIKey → VerifyPayment → InjectKey ────────
billing.post('/subscribe', async (c) => {
  try {
    const body = await c.req.json<{
      plan_id: string;
      payment_method_id: string;
      stripe_price_id: string;
    }>();

    const stripeKey = (c.env as any).STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return c.json({
        success: false,
        error: 'Payment processing not configured on this server. Use self-service keys.',
        demo_mode: true,
      });
    }

    // ── Intent: VerifyPayment via Stripe ─────────────────
    const stripeRes = await fetch('https://api.stripe.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer_creation': 'always',
        'payment_method': body.payment_method_id,
        'items[0][price]': body.stripe_price_id,
        'payment_behavior': 'default_incomplete',
        'expand[]': 'latest_invoice.payment_intent',
      }).toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json() as { error?: { message?: string } };
      throw new Error(err?.error?.message || 'Stripe error');
    }

    const subscription = await stripeRes.json() as { status: string; id: string };

    if (subscription.status === 'active' || subscription.status === 'trialing') {
      // ── Intent: InjectKey — provision API keys ────────
      // In production: provision from your key pool or use server-side keys
      // Keys are NEVER stored client-side from this flow — injected at runtime only
      return c.json({
        success: true,
        data: {
          subscription_id: subscription.id,
          plan_id: body.plan_id,
          // Return server-managed keys for injection
          // In production: these come from your encrypted key store
          openai_key: body.plan_id !== 'free' ? (c.env as any).OPENAI_API_KEY || null : null,
          replicate_key: body.plan_id !== 'free' ? (c.env as any).REPLICATE_API_KEY || null : null,
          elevenlabs_key: body.plan_id === 'premium' ? (c.env as any).ELEVENLABS_API_KEY || null : null,
        }
      });
    } else {
      throw new Error('Payment not completed: ' + subscription.status);
    }
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 400);
  }
});

// ── Intent: CheckKeyStatus — verify active subscription ───────
billing.get('/verify/:subscriptionId', async (c) => {
  try {
    const stripeKey = (c.env as any).STRIPE_SECRET_KEY;
    if (!stripeKey) return c.json({ success: false, error: 'Not configured' });

    const subId = c.req.param('subscriptionId');
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
      headers: { 'Authorization': `Bearer ${stripeKey}` }
    });
    const sub = await res.json() as { status: string };
    return c.json({
      success: true,
      data: { active: sub.status === 'active' || sub.status === 'trialing', status: sub.status }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { billing };
