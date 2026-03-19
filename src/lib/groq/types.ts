// ============================================================
// Groq Behavior Engine — Cognitive Layer
// src/lib/groq/types.ts
// ============================================================
// All types for the real-time AI decision engine.
// Groq does NOT generate audio — it generates structured
// behavior instructions that the TTS system then executes.
// ============================================================

// ── Behavior Modes ────────────────────────────────────────────
export type BehaviorMode =
  | 'sing'         // Sing WITH the child, rhythmic, melodic phrasing
  | 'talk'         // Warm conversational host voice
  | 'encourage'    // "You can do it!" high-energy praise
  | 'pause'        // Wait for child response / interaction
  | 'celebrate'    // Big reward moment, celebratory
  | 'reengage';    // Child drifted — gently pull them back

// ── Emotional Tone ────────────────────────────────────────────
export type BehaviorTone =
  | 'excited'
  | 'warm'
  | 'playful'
  | 'soothing'
  | 'encouraging'
  | 'celebratory'
  | 'curious'
  | 'gentle';

// ── Follow-up Actions ─────────────────────────────────────────
export type FollowUpAction =
  | 'encourage_participation'
  | 'sing_along'
  | 'wait_for_response'
  | 'play_next_song'
  | 'start_minigame'
  | 'celebrate_achievement'
  | 'gentle_redirect'
  | 'ask_question'
  | null;

// ── Engagement Metrics (from camera/mic) ─────────────────────
export interface EngagementMetrics {
  smileCount:     number;    // smiles this session
  laughCount:     number;    // laughs this session
  attentionLoss:  number;    // times looked away
  intensity:      number;    // 0–1 engagement score
  voiceDetected:  boolean;   // child has been vocal
  gazeOnScreen:   boolean;   // child looking at screen
  dominantEvent?: string;    // most frequent event
  recentEvents?:  string[];  // last 5 events
}

// ── Context State ─────────────────────────────────────────────
export interface ContextState {
  childName:      string;
  childAge:       number;
  ageGroup:       'toddler' | 'preschool' | 'early_school';  // <3, 3-5, 6+
  preferredStyle: string;
  energyLevel:    'low' | 'medium' | 'high';
  currentMode:    BehaviorMode;
  lastMode?:      BehaviorMode;
  sessionDuration: number;    // minutes
  songCount:      number;
  talkCount:      number;
  lastInteraction: string;    // ISO timestamp
  consecutiveSongs: number;   // songs played without talk break
  trigger:        string;     // what triggered this decision
}

// ── Groq Behavior Response ────────────────────────────────────
export interface BehaviorResponse {
  mode:       BehaviorMode;
  tone:       BehaviorTone;
  text:       string;          // the actual speech text for TTS
  followUp:   FollowUpAction;
  timing:     'immediate' | 'after_song' | 'delayed';
  singAlong?: string;          // if mode=sing: lyrics/phrase to sing
  question?:  string;          // interactive question for child
  cacheKey?:  string;
  fromCache:  boolean;
  latencyMs?: number;
  groqModel?: string;
}

// ── Behavior Request ──────────────────────────────────────────
export interface BehaviorRequest {
  userId:      string;
  childId?:    number;
  sessionId?:  number;
  context:     ContextState;
  engagement:  EngagementMetrics;
  forceMode?:  BehaviorMode;    // override Groq with a specific mode
  skipCache?:  boolean;
}
