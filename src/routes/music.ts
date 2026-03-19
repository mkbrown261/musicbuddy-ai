// ============================================================
// API Routes - Music Generation
// API Layer: integrates with Suno AI, Replicate (MusicGen),
//            or OpenAI TTS for real audio generation
// Logic Layer: prompt building, caching, variation
// ============================================================

import { Hono } from 'hono';
import { DB } from '../lib/db';
import {
  buildMusicPrompt, generatePromptHash, varyPrompt,
  getBestStyleFromProfile, getBestTempoFromProfile, computeAdaptiveUpdate
} from '../lib/engine';
import type { Bindings, MusicGenRequest } from '../types';

const music = new Hono<{ Bindings: Bindings }>();

// ── Demo audio pool (royalty-free, Pixabay) ───────────────────
const DEMO_SONGS = [
  { url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3', title: 'Playful Kids Melody', duration: 30 },
  { url: 'https://cdn.pixabay.com/download/audio/2021/11/13/audio_cb11e5c0b5.mp3', title: 'Happy Children Tune', duration: 28 },
  { url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3', title: 'Bubbly Music Box', duration: 25 },
  { url: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3', title: 'Cheerful Nursery Rhyme', duration: 27 },
  { url: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946f1ca2c5.mp3', title: 'Fun Adventure Theme', duration: 26 },
  { url: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3', title: 'Lullaby Dream', duration: 30 },
  { url: 'https://cdn.pixabay.com/download/audio/2021/10/25/audio_5e66bd4f95.mp3', title: 'Upbeat Dance Time', duration: 25 },
];

// ── Suno API Integration ─────────────────────────────────────
async function callSunoAPI(
  prompt: string,
  apiKey: string,
  style: string,
  childAge: number
): Promise<{ audio_url: string; title: string; duration: number } | null> {
  try {
    const response = await fetch('https://api.sunoapi.org/api/v1/suno/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt: prompt,
        tags: `children, ${style}, age ${childAge}, playful, instrumental`,
        title: `MusicBuddy AI Song ${Date.now()}`,
        make_instrumental: false,
        wait_audio: false,
      })
    });

    if (!response.ok) return null;
    const data = await response.json() as any;
    const audioId = data?.data?.[0]?.id ?? data?.id;
    if (!audioId) return null;

    // Poll for completion (max 30s)
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await fetch(`https://api.sunoapi.org/api/v1/suno/get?ids=${audioId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const pollData = await poll.json() as any;
      const song = pollData?.data?.[0];
      if (song?.status === 'complete' && song?.audio_url) {
        return {
          audio_url: song.audio_url,
          title: song.title ?? 'MusicBuddy AI Song',
          duration: song.duration ?? 25
        };
      }
    }
    return null;
  } catch (err) {
    console.error('Suno API error:', err);
    return null;
  }
}

// ── Replicate (Meta MusicGen) Integration ────────────────────
// Real AI music generation via Replicate API
// Model: meta/musicgen — generates 20-30 second audio from text prompts
async function callReplicateAPI(
  prompt: string,
  apiKey: string,
  duration: number = 25
): Promise<{ audio_url: string; title: string; duration: number } | null> {
  try {
    // Start prediction
    const response = await fetch('https://api.replicate.com/v1/models/meta/musicgen/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        input: {
          prompt: prompt,
          model_version: 'stereo-melody-large',
          output_format: 'mp3',
          normalization_strategy: 'peak',
          duration: Math.min(30, Math.max(20, duration)),
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Replicate API error:', err);
      return null;
    }

    const prediction = await response.json() as any;
    
    // If completed immediately (Prefer: wait)
    if (prediction.status === 'succeeded' && prediction.output) {
      const audioUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      return {
        audio_url: audioUrl,
        title: 'AI Generated Music',
        duration: duration
      };
    }

    // Poll for completion
    const predId = prediction.id;
    if (!predId) return null;

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
        headers: { 'Authorization': `Token ${apiKey}` }
      });
      const pollData = await poll.json() as any;
      if (pollData.status === 'succeeded' && pollData.output) {
        const audioUrl = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        return { audio_url: audioUrl, title: 'AI Generated Music', duration: duration };
      }
      if (pollData.status === 'failed') return null;
    }
    return null;
  } catch (err) {
    console.error('Replicate API error:', err);
    return null;
  }
}

// ── Unified Music Generation ──────────────────────────────────
async function callMusicAPI(
  prompt: string,
  env: Bindings & Record<string, string | undefined>,
  style: string,
  childAge: number
): Promise<{ audio_url: string; title: string; duration: number; provider: string }> {
  
  const sunoKey = env.SUNO_API_KEY;
  const replicateKey = env.REPLICATE_API_KEY;

  // 1. Try Suno if key available
  if (sunoKey && sunoKey !== 'demo') {
    const result = await callSunoAPI(prompt, sunoKey, style, childAge);
    if (result) return { ...result, provider: 'suno' };
  }

  // 2. Try Replicate/MusicGen if key available
  if (replicateKey && replicateKey !== 'demo') {
    const result = await callReplicateAPI(prompt, replicateKey, 25);
    if (result) return { ...result, provider: 'replicate' };
  }

  // 3. Fallback: demo audio pool (deterministic by prompt hash + age)
  const idx = Math.abs(prompt.length * 7 + childAge * 13) % DEMO_SONGS.length;
  const demo = DEMO_SONGS[idx];
  return {
    audio_url: demo.url,
    title: `${style.charAt(0).toUpperCase() + style.slice(1)} Song for Kids`,
    duration: demo.duration,
    provider: 'demo'
  };
}

// ── TTS Integration ───────────────────────────────────────────
// Uses OpenAI TTS API, returns base64 data URL for direct playback
async function callTTS(
  text: string,
  childName: string,
  apiKey: string | undefined
): Promise<{ audio_url: string | null; provider: string }> {
  if (!apiKey || apiKey === 'demo') {
    return { audio_url: null, provider: 'demo' };
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text.slice(0, 4096), // OpenAI limit
        voice: 'shimmer',   // Warm, friendly female voice
        speed: 0.9,         // Slightly slower for children
        response_format: 'mp3'
      })
    });

    if (response.ok) {
      // Return audio as base64 data URL for direct playback
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      return {
        audio_url: `data:audio/mp3;base64,${base64}`,
        provider: 'openai'
      };
    } else {
      const err = await response.text();
      console.error('TTS API error:', response.status, err);
    }
  } catch (err) {
    console.error('TTS error:', err);
  }
  return { audio_url: null, provider: 'demo' };
}

// ── POST /api/music/generate - Generate a music snippet ───────
music.post('/generate', async (c) => {
  try {
    const body = await c.req.json<MusicGenRequest>();
    const { child_id, session_id } = body;
    if (!child_id || !session_id) {
      return c.json({ success: false, error: 'child_id and session_id required' }, 400);
    }

    const db = new DB(c.env.DB);
    const child = await db.getProfile(child_id);
    if (!child) return c.json({ success: false, error: 'Child not found' }, 404);

    const adaptive = await db.getAdaptiveProfile(child_id);
    const favSongs = await db.getFavoriteSongs(child_id);

    // Build style/tempo from adaptive profile or defaults
    const style = body.style ?? getBestStyleFromProfile(adaptive, child.preferred_style);
    const tempo = body.tempo ?? getBestTempoFromProfile(adaptive, 'medium');
    const mood = body.mood ?? 'happy';

    // Seed songs: background detected + favorites
    const seedSongs = [
      ...(body.seed_songs ?? []),
      ...(body.background_song ? [body.background_song] : []),
      ...favSongs.slice(0, 3).map(s => s.song_title)
    ].filter(Boolean).slice(0, 5);

    // Build prompt
    let prompt = buildMusicPrompt({
      seedSongs,
      style,
      tempo,
      mood,
      childAge: child.age,
      backgroundSong: body.background_song,
      engagementLevel: 0.7
    });

    // Check for duplicate hash (variation algorithm)
    let hash = generatePromptHash(prompt, child_id);
    let attempt = 0;
    while (await db.snippetHashExists(hash) && attempt < 5) {
      attempt++;
      prompt = varyPrompt(prompt, attempt);
      hash = generatePromptHash(prompt, child_id);
    }

    // Call music API (Suno → Replicate → demo fallback)
    const result = await callMusicAPI(prompt, c.env as any, style, child.age);

    // Save snippet to DB
    const snippetId = await db.saveSnippet({
      child_id,
      source_song: seedSongs[0] ?? null,
      style,
      tempo,
      duration_seconds: result.duration,
      prompt_used: prompt,
      audio_url: result.audio_url,
      generation_hash: hash,
      engagement_score: 0.0,
    });

    // Log interaction
    await db.logInteraction({
      session_id, child_id,
      interaction_type: 'song',
      content: result.title,
      snippet_id: snippetId,
      trigger: body.trigger ?? 'auto',
      duration_ms: result.duration * 1000
    });

    // Increment play counts for seed songs
    for (const favSong of favSongs.slice(0, 2)) {
      await db.incrementSongPlayCount(favSong.id);
    }

    return c.json({
      success: true,
      data: {
        snippet_id: snippetId,
        audio_url: result.audio_url,
        title: result.title,
        duration_seconds: result.duration,
        style, tempo, mood, prompt,
        provider: result.provider,
        demo_mode: result.provider === 'demo'
      }
    }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── POST /api/music/tts - Generate TTS speech ─────────────────
music.post('/tts', async (c) => {
  try {
    const body = await c.req.json<{
      child_id: number; session_id: number;
      text: string; trigger?: string;
    }>();
    const { child_id, session_id, text } = body;
    if (!child_id || !session_id || !text) {
      return c.json({ success: false, error: 'child_id, session_id, text required' }, 400);
    }

    const db = new DB(c.env.DB);
    const child = await db.getProfile(child_id);
    if (!child) return c.json({ success: false, error: 'Child not found' }, 404);

    const apiKey = (c.env as any).OPENAI_API_KEY;
    const ttsResult = await callTTS(text, child.name, apiKey);

    await db.logInteraction({
      session_id, child_id,
      interaction_type: 'conversation',
      content: text,
      trigger: body.trigger ?? 'auto',
    });

    return c.json({
      success: true,
      data: {
        text,
        audio_url: ttsResult.audio_url,
        provider: ttsResult.provider,
        demo_mode: ttsResult.provider === 'demo',
        message: ttsResult.audio_url ? 'TTS audio generated' : 'TTS demo mode - using Web Speech API'
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── POST /api/music/interaction - Full talk + sing cycle ───────
music.post('/interaction', async (c) => {
  try {
    const body = await c.req.json<{
      child_id: number; session_id: number;
      trigger?: string; background_song?: string;
      last_engagement_score?: number;
    }>();
    const { child_id, session_id } = body;
    if (!child_id || !session_id) {
      return c.json({ success: false, error: 'child_id and session_id required' }, 400);
    }

    const db = new DB(c.env.DB);
    const child = await db.getProfile(child_id);
    if (!child) return c.json({ success: false, error: 'Child not found' }, 404);

    const adaptive = await db.getAdaptiveProfile(child_id);
    const favSongs = await db.getFavoriteSongs(child_id);
    const { getConversationText } = await import('../lib/engine');

    // Use adaptive profile for style/tempo (with proper fallbacks)
    const style = getBestStyleFromProfile(adaptive, child.preferred_style);
    const tempo = getBestTempoFromProfile(adaptive, 'medium');

    // Generate TTS transition text
    const ttsText = getConversationText('transition', child.name);

    // Generate music snippet
    const seedSongs = favSongs.slice(0, 3).map(s => s.song_title);
    let prompt = buildMusicPrompt({
      seedSongs, style, tempo, mood: 'happy',
      childAge: child.age,
      backgroundSong: body.background_song,
      engagementLevel: body.last_engagement_score ?? 0.6
    });

    let hash = generatePromptHash(prompt, child_id);
    let attempt = 0;
    while (await db.snippetHashExists(hash) && attempt < 5) {
      attempt++;
      prompt = varyPrompt(prompt, attempt);
      hash = generatePromptHash(prompt, child_id);
    }

    const result = await callMusicAPI(prompt, c.env as any, style, child.age);

    const snippetId = await db.saveSnippet({
      child_id, source_song: seedSongs[0] ?? null,
      style, tempo, duration_seconds: result.duration,
      prompt_used: prompt, audio_url: result.audio_url,
      generation_hash: hash, engagement_score: 0.0,
    });

    await db.logInteraction({
      session_id, child_id, interaction_type: 'song',
      content: result.title, snippet_id: snippetId,
      trigger: body.trigger ?? 'auto', duration_ms: result.duration * 1000
    });

    return c.json({
      success: true,
      data: {
        tts_text: ttsText,
        snippet_id: snippetId,
        audio_url: result.audio_url,
        title: result.title,
        duration_seconds: result.duration,
        style, tempo,
        provider: result.provider,
        demo_mode: result.provider === 'demo'
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── GET /api/music/snippets/:childId - Get snippet history ─────
music.get('/snippets/:childId', async (c) => {
  try {
    const childId = parseInt(c.req.param('childId'));
    const db = new DB(c.env.DB);
    const snippets = await db.getSnippetsByChild(childId, 20);
    const top = await db.getTopSnippets(childId, 5);
    return c.json({ success: true, data: { snippets, top_snippets: top } });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── POST /api/music/rate - Rate a snippet ─────────────────────
music.post('/rate', async (c) => {
  try {
    const body = await c.req.json<{
      snippet_id: number; child_id: number; session_id: number; score: number;
    }>();
    const db = new DB(c.env.DB);
    await db.updateSnippetEngagement(body.snippet_id, body.score);

    // Adaptive profile update
    const snippets = await db.getSnippetsByChild(body.child_id, 10);
    const snippet = snippets.find(s => s.id === body.snippet_id);
    if (snippet) {
      const adaptive = await db.getAdaptiveProfile(body.child_id);
      const update = computeAdaptiveUpdate(adaptive, snippet.style, snippet.tempo, body.score);
      await db.upsertAdaptiveProfile(body.child_id, update);
    }

    return c.json({ success: true, message: 'Rating saved' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ── POST /api/music/keys/validate ────────────────────────────
// Validates API keys and returns the active provider.
// NOTE: For Cloudflare Pages, use wrangler secrets for persistence.
music.post('/keys/validate', async (c) => {
  try {
    const body = await c.req.json<{
      suno_key?: string;
      replicate_key?: string;
      openai_key?: string;
    }>().catch(() => ({}));
    
    const results: Record<string, string> = {};
    
    // Validate Replicate key (lightweight check)
    if (body.replicate_key) {
      try {
        const r = await fetch('https://api.replicate.com/v1/account', {
          headers: { 'Authorization': `Token ${body.replicate_key}` }
        });
        results.replicate = r.status === 200 ? 'valid' : `invalid (${r.status})`;
      } catch { results.replicate = 'error'; }
    }
    
    // Validate OpenAI key (lightweight check)
    if (body.openai_key) {
      try {
        const r = await fetch('https://api.openai.com/v1/models?limit=1', {
          headers: { 'Authorization': `Bearer ${body.openai_key}` }
        });
        results.openai = r.status === 200 ? 'valid' : `invalid (${r.status})`;
      } catch { results.openai = 'error'; }
    }

    // Check server-side secrets (set via wrangler)
    const envAny = c.env as any;
    const activeProvider = envAny.REPLICATE_API_KEY ? 'replicate' :
                          envAny.SUNO_API_KEY ? 'suno' : 'demo';

    return c.json({
      success: true,
      data: {
        validation: results,
        active_provider: activeProvider,
        server_secrets: {
          replicate: !!envAny.REPLICATE_API_KEY,
          suno: !!envAny.SUNO_API_KEY,
          openai: !!envAny.OPENAI_API_KEY,
        },
        message: Object.keys(results).length > 0
          ? 'Keys validated client-side. To persist server-side: run wrangler secret put.'
          : 'No keys provided. Server using: ' + activeProvider
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { music };
