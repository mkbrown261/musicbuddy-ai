// ============================================================
// Type definitions for all 5 layers
// ============================================================

export type Bindings = {
  DB: D1Database;
  OPENAI_API_KEY:      string;
  SUNO_API_KEY:        string;
  GROK_API_KEY:        string;
  REPLICATE_API_KEY:   string;
  ELEVENLABS_API_KEY:  string;
  STRIPE_SECRET_KEY:   string;
  STRIPE_PUBLISHABLE_KEY: string;
  // Amazon Polly (TTS fallback)
  AWS_ACCESS_KEY_ID:     string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION:            string;
};

// ── Database Models ──────────────────────────────────────────

export interface ChildProfile {
  id: number;
  name: string;
  age: number;
  avatar: string;
  preferred_style: string;
  engagement_mode: string;
  screen_time_limit: number;
  created_at: string;
  updated_at: string;
}

export interface FavoriteSong {
  id: number;
  child_id: number;
  song_title: string;
  artist: string | null;
  genre: string | null;
  bpm: number | null;
  mood: string;
  priority: number;
  play_count: number;
  created_at: string;
}

export interface MusicSnippet {
  id: number;
  child_id: number;
  source_song: string | null;
  style: string;
  tempo: string;
  duration_seconds: number;
  prompt_used: string | null;
  audio_url: string | null;
  generation_hash: string | null;
  engagement_score: number;
  play_count: number;
  created_at: string;
}

export interface Session {
  id: number;
  child_id: number;
  started_at: string;
  ended_at: string | null;
  total_duration_seconds: number;
  session_mode: string;
  notes: string | null;
}

export interface EngagementEvent {
  id: number;
  session_id: number;
  child_id: number;
  event_type: string;
  intensity: number;
  duration_ms: number;
  snippet_id: number | null;
  gaze_x: number | null;
  gaze_y: number | null;
  timestamp: string;
}

export interface InteractionLog {
  id: number;
  session_id: number;
  child_id: number;
  interaction_type: string;
  content: string | null;
  snippet_id: number | null;
  trigger: string | null;
  duration_ms: number;
  timestamp: string;
}

export interface AdaptiveProfile {
  id: number;
  child_id: number;
  favorite_styles: string;
  favorite_tempos: string;
  peak_attention_time: string;
  avg_engagement_score: number;
  total_sessions: number;
  total_songs_played: number;
  last_updated: string;
}

export interface BackgroundDetection {
  id: number;
  child_id: number;
  session_id: number | null;
  detected_song: string | null;
  detected_artist: string | null;
  detected_genre: string | null;
  confidence: number;
  used_as_seed: number;
  detected_at: string;
}

// ── API Request/Response Types ───────────────────────────────

export interface CreateProfileRequest {
  name: string;
  age: number;
  avatar?: string;
  preferred_style?: string;
  engagement_mode?: string;
  screen_time_limit?: number;
  favorite_songs?: Array<{
    song_title: string;
    artist?: string;
    genre?: string;
    bpm?: number;
    mood?: string;
    priority?: number;
  }>;
}

export interface EngagementCue {
  child_id: number;
  session_id: number;
  event_type: 'smile' | 'laughter' | 'fixation' | 'attention_loss' | 'boredom';
  intensity: number;
  duration_ms?: number;
  gaze_x?: number;
  gaze_y?: number;
  snippet_id?: number;
}

export interface MusicGenRequest {
  child_id: number;
  session_id: number;
  seed_songs?: string[];
  style?: string;
  tempo?: string;
  mood?: string;
  trigger?: string;
  background_song?: string;
}

export interface TTSRequest {
  child_id: number;
  session_id: number;
  text: string;
  voice?: string;
  emotion?: string;
}

export interface InteractionDecision {
  action: 'talk' | 'sing' | 'wait' | 'repeat';
  tts_text?: string;
  music_prompt?: string;
  snippet_id?: number;
  reason: string;
}

export interface DashboardStats {
  child: ChildProfile;
  current_session: Session | null;
  today_sessions: number;
  total_time_today_minutes: number;
  engagement_summary: {
    smile_count: number;
    laughter_count: number;
    avg_fixation_ms: number;
    engagement_score: number;
  };
  recent_snippets: MusicSnippet[];
  adaptive_profile: AdaptiveProfile | null;
}
