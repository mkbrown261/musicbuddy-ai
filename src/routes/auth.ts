// ============================================================
// API Routes - Authentication
// Secure email/password auth using Web Crypto API (SHA-256 + salt)
// Sessions stored in D1 with 7-day expiry
// ============================================================

import { Hono } from 'hono';
import type { Bindings } from '../types';

const auth = new Hono<{ Bindings: Bindings }>();

// ── Crypto helpers (Web Crypto API — works in Cloudflare Workers) ──

async function generateSalt(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── POST /api/auth/register ───────────────────────────────────
auth.post('/register', async (c) => {
  try {
    const body = await c.req.json<{ email: string; name: string; password: string }>();
    const { email, name, password } = body;

    if (!email || !name || !password)
      return c.json({ success: false, error: 'email, name, and password are required' }, 400);
    if (!isValidEmail(email))
      return c.json({ success: false, error: 'Invalid email format' }, 400);
    if (password.length < 6)
      return c.json({ success: false, error: 'Password must be at least 6 characters' }, 400);
    if (name.trim().length < 2)
      return c.json({ success: false, error: 'Name must be at least 2 characters' }, 400);

    const db = c.env.DB;

    // Check if email already exists
    const existing = await db.prepare(
      'SELECT id FROM auth_users WHERE email = ?'
    ).bind(email.toLowerCase().trim()).first();
    if (existing)
      return c.json({ success: false, error: 'An account with this email already exists' }, 409);

    // Hash password with salt
    const salt = await generateSalt();
    const passwordHash = await hashPassword(password, salt);

    // Create user
    const result = await db.prepare(
      `INSERT INTO auth_users (email, name, password_hash, salt) VALUES (?, ?, ?, ?)`
    ).bind(email.toLowerCase().trim(), name.trim(), passwordHash, salt).run();

    const userId = result.meta.last_row_id;

    // Auto-create session (log in immediately after register)
    const token = await generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare(
      `INSERT INTO auth_sessions (user_id, token, expires_at) VALUES (?, ?, ?)`
    ).bind(userId, token, expiresAt).run();

    return c.json({
      success: true,
      data: {
        user: { id: userId, email: email.toLowerCase().trim(), name: name.trim(), role: 'parent' },
        token,
        expires_at: expiresAt,
        message: 'Account created successfully'
      }
    }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json<{ email: string; password: string }>();
    const { email, password } = body;

    if (!email || !password)
      return c.json({ success: false, error: 'email and password are required' }, 400);

    const db = c.env.DB;

    const user = await db.prepare(
      `SELECT id, email, name, role, password_hash, salt, is_active
       FROM auth_users WHERE email = ?`
    ).bind(email.toLowerCase().trim()).first() as any;

    if (!user)
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    if (!user.is_active)
      return c.json({ success: false, error: 'Account is disabled' }, 401);

    // Verify password
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.password_hash)
      return c.json({ success: false, error: 'Invalid email or password' }, 401);

    // Clean up old sessions for this user (keep last 5)
    await db.prepare(
      `DELETE FROM auth_sessions WHERE user_id = ? AND id NOT IN
       (SELECT id FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5)`
    ).bind(user.id, user.id).run();

    // Create new session
    const token = await generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare(
      `INSERT INTO auth_sessions (user_id, token, expires_at) VALUES (?, ?, ?)`
    ).bind(user.id, token, expiresAt).run();

    // Update last login
    await db.prepare(
      `UPDATE auth_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(user.id).run();

    return c.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token,
        expires_at: expiresAt,
        message: 'Login successful'
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
auth.post('/logout', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      await c.env.DB.prepare('DELETE FROM auth_sessions WHERE token = ?').bind(token).run();
    }
    return c.json({ success: true, message: 'Logged out' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
auth.get('/me', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token)
      return c.json({ success: false, error: 'No token provided' }, 401);

    const session = await c.env.DB.prepare(
      `SELECT s.token, s.expires_at, u.id, u.email, u.name, u.role
       FROM auth_sessions s JOIN auth_users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`
    ).bind(token).first() as any;

    if (!session)
      return c.json({ success: false, error: 'Session expired or invalid' }, 401);

    // Fetch their child profiles
    const profiles = await c.env.DB.prepare(
      `SELECT id, name, age, avatar, preferred_style FROM child_profiles
       WHERE owner_id = ? OR owner_id IS NULL ORDER BY id`
    ).bind(session.id).all();

    return c.json({
      success: true,
      data: {
        user: { id: session.id, email: session.email, name: session.name, role: session.role },
        expires_at: session.expires_at,
        profiles: profiles.results ?? []
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── PUT /api/auth/profile ─────────────────────────────────────
auth.put('/profile', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ success: false, error: 'Unauthorized' }, 401);

    const session = await c.env.DB.prepare(
      `SELECT u.id FROM auth_sessions s JOIN auth_users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`
    ).bind(token).first() as any;
    if (!session) return c.json({ success: false, error: 'Unauthorized' }, 401);

    const body = await c.req.json<{ name?: string; current_password?: string; new_password?: string }>();

    if (body.name) {
      await c.env.DB.prepare('UPDATE auth_users SET name = ? WHERE id = ?')
        .bind(body.name.trim(), session.id).run();
    }

    if (body.new_password && body.current_password) {
      const user = await c.env.DB.prepare(
        'SELECT password_hash, salt FROM auth_users WHERE id = ?'
      ).bind(session.id).first() as any;
      const currentHash = await hashPassword(body.current_password, user.salt);
      if (currentHash !== user.password_hash)
        return c.json({ success: false, error: 'Current password is incorrect' }, 400);
      const newSalt = await generateSalt();
      const newHash = await hashPassword(body.new_password, newSalt);
      await c.env.DB.prepare('UPDATE auth_users SET password_hash = ?, salt = ? WHERE id = ?')
        .bind(newHash, newSalt, session.id).run();
    }

    return c.json({ success: true, message: 'Profile updated' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { auth };
