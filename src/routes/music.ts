// ============================================================
// API Routes - Music Generation
// API Layer: integrates with Suno AI (or mock) for music
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

// ── Suno/Sodo API Integration ─────────────────────────────────
async function callMusicAPI(
  prompt: string,
  apiKey: string | undefined,
  style: string,
  childAge: number
): Promise<{ audio_url: string; title: string; duration: number }> {
  
  // If Suno API key is available, call real API
  if (apiKey && apiKey !== 'demo') {
    try {
      // Suno API v4 endpoint
      const response = await fetch('https://api.sunoapi.org/api/v1/suno/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          prompt: prompt,
          tags: `children, ${style}, age ${childAge}, playful, instrumental`,
          title: `AI Kids Song ${Date.now()}`,
          make_instrumental: false,
          wait_audio: false,
        })
      });

      if (response.ok) {
        const data = await response.json() as any;
        const audioId = data?.data?.[0]?.id ?? data?.id;
        if (audioId) {
          // Poll for completion
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
                title: song.title ?? 'AI Kids Song',
                duration: song.duration ?? 25
              };
            }
          }
        }
      }
    } catch (err) {
      console.error('Suno API error:', err);
    }
  }

  // Fallback: Use OpenAI TTS to generate a hummed melody description
  // (production substitute when music API unavailable)
  // Return a simulated audio URL for demo mode
  const demoSongs = [
    'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
    'https://cdn.pixabay.com/download/audio/2021/11/13/audio_cb11e5c0b5.mp3',
    'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3',
    'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3',
    'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946f1ca2c5.mp3',
  ];
  
  const idx = Math.abs(prompt.length + childAge) % demoSongs.length;
  return {
    audio_url: demoSongs[idx],
    title: `Playful Song for ${style} mood`,
    duration: 25
  };
}

// ── TTS Integration ───────────────────────────────────────────
async function callTTS(
  text: string,
  childName: string,
  apiKey: string | undefined
): Promise<string | null> {
  if (!apiKey || apiKey === 'demo') return null;
  
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'shimmer', // Warm, friendly female voice
        speed: 0.9,       // Slightly slower for children
        response_format: 'mp3'
      })
    });

    if (response.ok) {
      // In production, upload to R2 and return URL
      // For demo, return placeholder
      return null;
    }
  } catch (err) {
    console.error('TTS error:', err);
  }
  return null;
}

// POST /api/music/generate - Generate a music snippet
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

    // Call music API (or fallback demo)
    const apiKey = (c.env as any).SUNO_API_KEY;
    const result = await callMusicAPI(prompt, apiKey, style, child.age);

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
        demo_mode: !apiKey || apiKey === 'demo'
      }
    }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/music/tts - Generate TTS speech
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
    const audioUrl = await callTTS(text, child.name, apiKey);

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
        audio_url: audioUrl,
        demo_mode: !audioUrl,
        message: audioUrl ? 'TTS audio generated' : 'TTS demo mode - display text only'
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// POST /api/music/interaction - Full interaction cycle (talk + sing)
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

    const apiKey = (c.env as any).SUNO_API_KEY;
    const result = await callMusicAPI(prompt, apiKey, style, child.age);

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
        demo_mode: !apiKey || apiKey === 'demo'
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /api/music/snippets/:childId - Get snippet history
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

// POST /api/music/rate - Rate a snippet (engagement feedback)
music.post('/rate', async (c) => {
  try {
    const body = await c.req.json<{
      snippet_id: number; child_id: number; session_id: number; score: number;
    }>();
    const db = new DB(c.env.DB);
    await db.updateSnippetEngagement(body.snippet_id, body.score);

    // Adaptive profile update
    const snippets = await db.getSnippetsByChild(body.child_id, 1);
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

export { music };
