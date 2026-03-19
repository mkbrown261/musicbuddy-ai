// ============================================================
// Ambient Music Engine — src/lib/music/ambient.ts
// ============================================================
// PHASE 2: MusicBuddy "Alive System"
//
// Maps detected emotion/vibe → background music track
// The frontend layers this (low volume, looping) under voice audio.
//
// Architecture:
//   EmotionEngine detects → musicVibe → AMBIENT_MUSIC.getTrack(vibe)
//   → frontend sets <audio id="ambientPlayer"> src + plays at 15% volume
//
// Tracks are served from /static/audio/ambient/ (public folder)
// OR from external CDN if no local tracks available.
//
// We use royalty-free tracks. Frontend gracefully handles
// 404s by silently failing (ambient is enhancement, not core).
// ============================================================

import type { MusicVibe } from '../emotion/engine';

// ── Track definition ──────────────────────────────────────────
export interface AmbientTrack {
  id:          string;
  vibe:        MusicVibe;
  filename:    string;    // file in /static/audio/ambient/
  label:       string;    // human-readable
  tempo:       'slow' | 'medium' | 'fast';
  volume:      number;    // recommended 0–1 (frontend default: 0.15)
  loop:        boolean;
  fadeMs:      number;    // crossfade / fade-in ms
  description: string;
}

// ── Track library ─────────────────────────────────────────────
// These filenames map to /static/audio/ambient/<filename>
// If a file doesn't exist the frontend silently skips it.
export const AMBIENT_TRACKS: Record<MusicVibe, AmbientTrack> = {
  upbeat: {
    id:          'upbeat-kids',
    vibe:        'upbeat',
    filename:    'happy-upbeat.mp3',
    label:       'Happy Upbeat',
    tempo:       'fast',
    volume:      0.12,
    loop:        true,
    fadeMs:      800,
    description: 'Bright, bouncy kids music for excited/singing moments',
  },
  playful: {
    id:          'playful-fun',
    vibe:        'playful',
    filename:    'fun-kids-loop.mp3',
    label:       'Fun Kids Loop',
    tempo:       'medium',
    volume:      0.12,
    loop:        true,
    fadeMs:      600,
    description: 'Light playful music for happy/curious moments',
  },
  soothing: {
    id:          'soft-piano',
    vibe:        'soothing',
    filename:    'soft-piano.mp3',
    label:       'Soft Piano',
    tempo:       'slow',
    volume:      0.10,
    loop:        true,
    fadeMs:      1500,
    description: 'Gentle piano for calm/lullaby/sleepy moments',
  },
  warm: {
    id:          'warm-ambient',
    vibe:        'warm',
    filename:    'warm-ambient.mp3',
    label:       'Warm Ambient',
    tempo:       'slow',
    volume:      0.10,
    loop:        true,
    fadeMs:      1200,
    description: 'Warm comforting ambient for sad/comfort moments',
  },
  celebratory: {
    id:          'celebration',
    vibe:        'celebratory',
    filename:    'celebration-fanfare.mp3',
    label:       'Celebration!',
    tempo:       'fast',
    volume:      0.18,
    loop:        false,         // play once then stop
    fadeMs:      300,
    description: 'Short fanfare for level-up / milestone moments',
  },
  none: {
    id:          'silence',
    vibe:        'none',
    filename:    '',
    label:       'Silence',
    tempo:       'slow',
    volume:      0,
    loop:        false,
    fadeMs:      0,
    description: 'No ambient music',
  },
};

// ── API ───────────────────────────────────────────────────────

/** Get the ambient track config for a given music vibe */
export function getAmbientTrack(vibe: MusicVibe): AmbientTrack {
  return AMBIENT_TRACKS[vibe] ?? AMBIENT_TRACKS['playful'];
}

/** Get track URL path for serving from /static/ */
export function getTrackUrl(vibe: MusicVibe): string | null {
  const track = getAmbientTrack(vibe);
  if (!track.filename) return null;
  return `/static/audio/ambient/${track.filename}`;
}

/** Serialise to a minimal payload for the API response */
export interface AmbientMusicPayload {
  vibe:     MusicVibe;
  trackUrl: string | null;
  volume:   number;
  loop:     boolean;
  fadeMs:   number;
  label:    string;
}

export function buildAmbientPayload(vibe: MusicVibe): AmbientMusicPayload {
  const track = getAmbientTrack(vibe);
  return {
    vibe,
    trackUrl: track.filename ? `/static/audio/ambient/${track.filename}` : null,
    volume:   track.volume,
    loop:     track.loop,
    fadeMs:   track.fadeMs,
    label:    track.label,
  };
}
