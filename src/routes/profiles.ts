// ============================================================
// API Routes - Child Profiles
// UI Layer → API Layer → Database Layer
// ============================================================

import { Hono } from 'hono';
import { DB } from '../lib/db';
import type { Bindings, CreateProfileRequest } from '../types';

const profiles = new Hono<{ Bindings: Bindings }>();

// GET /api/profiles - List all profiles
profiles.get('/', async (c) => {
  try {
    const db = new DB(c.env.DB);
    const children = await db.getProfiles();
    return c.json({ success: true, data: children });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /api/profiles/:id - Get single profile with songs + adaptive data
profiles.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const db = new DB(c.env.DB);
    const child = await db.getProfile(id);
    if (!child) return c.json({ success: false, error: 'Profile not found' }, 404);

    const songs = await db.getFavoriteSongs(id);
    const adaptive = await db.getAdaptiveProfile(id);
    const rules = await db.getParentalRules(id);
    const snippets = await db.getTopSnippets(id, 5);
    const engSummary = await db.getEngagementSummary(id);

    return c.json({
      success: true,
      data: { child, songs, adaptive, rules, snippets, engagement: engSummary }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/profiles - Create profile
profiles.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateProfileRequest>();
    if (!body.name || !body.age) {
      return c.json({ success: false, error: 'name and age are required' }, 400);
    }

    const db = new DB(c.env.DB);
    const id = await db.createProfile({
      name: body.name, age: body.age,
      avatar: body.avatar ?? 'default',
      preferred_style: body.preferred_style ?? 'playful',
      engagement_mode: body.engagement_mode ?? 'auto',
      screen_time_limit: body.screen_time_limit ?? 30,
    });

    // Add favorite songs if provided
    if (body.favorite_songs?.length) {
      for (const song of body.favorite_songs) {
        await db.addFavoriteSong(id, song);
      }
    }

    // Create adaptive profile
    await db.upsertAdaptiveProfile(id, {
      favorite_styles: JSON.stringify({ [body.preferred_style ?? 'playful']: 1 }),
      favorite_tempos: JSON.stringify({ medium: 1 }),
      peak_attention_time: JSON.stringify([]),
      avg_engagement_score: 0,
      total_sessions: 0,
      total_songs_played: 0,
    });

    const child = await db.getProfile(id);
    return c.json({ success: true, data: child }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// PUT /api/profiles/:id - Update profile
profiles.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const db = new DB(c.env.DB);
    const existing = await db.getProfile(id);
    if (!existing) return c.json({ success: false, error: 'Profile not found' }, 404);

    await db.updateProfile(id, {
      name: body.name ?? existing.name,
      age: body.age ?? existing.age,
      avatar: body.avatar ?? existing.avatar,
      preferred_style: body.preferred_style ?? existing.preferred_style,
      engagement_mode: body.engagement_mode ?? existing.engagement_mode,
      screen_time_limit: body.screen_time_limit ?? existing.screen_time_limit,
    });

    const updated = await db.getProfile(id);
    return c.json({ success: true, data: updated });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// DELETE /api/profiles/:id
profiles.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const db = new DB(c.env.DB);
    await db.deleteProfile(id);
    return c.json({ success: true, message: 'Profile deleted' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/profiles/:id/songs - Add favorite song
profiles.post('/:id/songs', async (c) => {
  try {
    const childId = parseInt(c.req.param('id'));
    const body = await c.req.json();
    if (!body.song_title) return c.json({ success: false, error: 'song_title required' }, 400);

    const db = new DB(c.env.DB);
    const songId = await db.addFavoriteSong(childId, body);
    return c.json({ success: true, data: { id: songId } }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { profiles };
