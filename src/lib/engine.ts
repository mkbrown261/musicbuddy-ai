// ============================================================
// Logic Layer - Engagement Decision Engine
// Determines when to talk, sing, wait, or repeat based on
// child engagement cues, timing, and adaptive preferences
// ============================================================

import type { EngagementEvent, MusicSnippet, InteractionDecision, AdaptiveProfile } from '../types';

interface EngagementState {
  recentEvents: EngagementEvent[];
  lastInteractionType: 'talk' | 'sing' | 'wait' | null;
  lastInteractionTime: number;
  consecutiveSongs: number;
  currentSnippetId: number | null;
  sessionStartTime: number;
  talkSingCycle: number;
}

// Conversation templates for TTS - natural, parent-like (NO emojis — these are spoken aloud)
const CONVERSATION_TEMPLATES = {
  greeting: [
    "Hi {name}! Ready to play and sing some songs today?",
    "Hey there, {name}! Let's have some fun with music!",
    "Hello {name}! I have some super fun songs just for you!",
    "Yay, {name} is here! Let's make some music magic together!",
  ],
  after_song: [
    "You liked that one, huh {name}? Let's try another!",
    "Woohoo! That was so fun, wasn't it {name}? Ready for more?",
    "Great listening, {name}! Did that make you want to dance?",
    "Yay! I love that song too, {name}! Want to hear it again?",
    "Oh {name}, you are such a great music fan! Here comes another one!",
  ],
  during_attention: [
    "Ooh, you are really listening carefully, {name}! I love that!",
    "{name}, your ears are working so well today!",
    "I can tell you love music, {name}! You are so focused!",
  ],
  attention_lost: [
    "Hey {name}, I have got something even more fun! Listen...",
    "Psst, {name}! Want to hear a really silly song?",
    "Oh {name}! I almost forgot — I have your favorite kind of song!",
    "{name}, wake up those dancing feet! Let's try something new!",
  ],
  joy_response: [
    "Haha, {name}! I can see you are loving this! Keep smiling!",
    "Look at that smile, {name}! You are making me happy too!",
    "Your smile is the best thing ever, {name}! More music coming!",
    "Yay {name}! I knew you would like that! Let's keep going!",
  ],
  repeat_request: [
    "Oh you want that again, {name}? Coming right up!",
    "One more time just for you, {name}!",
    "I heard you, {name}! Let's play it again!",
  ],
  transition: [
    "Okay {name}, get ready... the music is starting!",
    "Here we go {name}!",
    "Listen carefully, {name}! This one is super special!",
    "Ready, {name}? One, two, three, let's go!",
  ],
  screen_time_warning: [
    "{name}, we have been playing for a while! Let's finish with one more song, okay?",
    "Time is flying by, {name}! One last song for today!",
  ]
};

export function getConversationText(
  type: keyof typeof CONVERSATION_TEMPLATES,
  childName: string
): string {
  const templates = CONVERSATION_TEMPLATES[type];
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace(/\{name\}/g, childName);
}

// ── Music Prompt Builder ──────────────────────────────────────
export function buildMusicPrompt(params: {
  seedSongs: string[];
  style: string;
  tempo: string;
  mood: string;
  childAge: number;
  backgroundSong?: string;
  engagementLevel?: number;
}): string {
  const { seedSongs, style, tempo, mood, childAge, backgroundSong, engagementLevel = 0.5 } = params;
  
  const ageDescriptor = childAge <= 3 ? 'very young toddler' 
                      : childAge <= 5 ? 'preschool child'
                      : 'elementary school child';

  const energyAdjust = engagementLevel > 0.7 ? 'energetic and exciting'
                     : engagementLevel < 0.3 ? 'gentle and re-engaging'
                     : 'playful and fun';

  const seedRef = backgroundSong
    ? `inspired by the song "${backgroundSong}" currently playing`
    : seedSongs.length > 0
      ? `inspired by songs like: ${seedSongs.slice(0, 3).join(', ')}`
      : 'in a classic nursery rhyme style';

  const styleMap: Record<string, string> = {
    playful: 'bright, bouncy, whimsical',
    upbeat: 'lively, catchy, rhythmic',
    lullaby: 'soft, soothing, melodic',
    classical: 'gentle orchestral, graceful',
    energetic: 'fast-paced, exciting, danceable',
    calm: 'peaceful, flowing, tender',
  };

  const tempoMap: Record<string, string> = {
    slow: '60-80 BPM',
    medium: '85-110 BPM',
    fast: '115-140 BPM',
  };

  return [
    `Create a ${tempo === 'slow' ? '20' : '25'}-second children's music snippet ${seedRef}.`,
    `Style: ${styleMap[style] ?? style}, ${energyAdjust}.`,
    `Tempo: approximately ${tempoMap[tempo] ?? '90 BPM'}.`,
    `Mood: ${mood}.`,
    `Designed for a ${ageDescriptor}.`,
    `Include simple, playful melodies with light percussion and warm tones.`,
    `Make it feel familiar yet unique — do not reproduce the original song exactly.`,
    `Keep it short, captivating, and joyful to maintain a child's attention.`,
  ].join(' ');
}

// ── Engagement Decision Engine ────────────────────────────────
export class EngagementEngine {
  private state: EngagementState;
  private TALK_DURATION_MS = 4000;   // ~4 seconds of conversation
  private SONG_DURATION_MS = 25000;  // ~25 seconds song snippet
  private MIN_CYCLE_GAP_MS = 2000;   // minimum pause between interactions

  constructor() {
    this.state = {
      recentEvents: [],
      lastInteractionType: null,
      lastInteractionTime: 0,
      consecutiveSongs: 0,
      currentSnippetId: null,
      sessionStartTime: Date.now(),
      talkSingCycle: 0
    };
  }

  addEvent(event: EngagementEvent): void {
    this.state.recentEvents.push(event);
    // Keep only last 20 events
    if (this.state.recentEvents.length > 20) {
      this.state.recentEvents = this.state.recentEvents.slice(-20);
    }
  }

  updateInteraction(type: 'talk' | 'sing', snippetId?: number): void {
    this.state.lastInteractionType = type;
    this.state.lastInteractionTime = Date.now();
    if (type === 'sing') {
      this.state.consecutiveSongs++;
      this.state.currentSnippetId = snippetId ?? null;
    } else {
      this.state.consecutiveSongs = 0;
    }
    this.state.talkSingCycle++;
  }

  private getRecentEngagement(windowMs: number = 10000): {
    hasSmile: boolean;
    hasLaughter: boolean;
    hasFixation: boolean;
    hasAttentionLoss: boolean;
    avgIntensity: number;
    dominantEvent: string | null;
  } {
    const now = Date.now();
    const recent = this.state.recentEvents.filter(e => {
      const eventTime = new Date(e.timestamp).getTime();
      return (now - eventTime) < windowMs;
    });

    if (recent.length === 0) {
      return {
        hasSmile: false, hasLaughter: false,
        hasFixation: false, hasAttentionLoss: false,
        avgIntensity: 0, dominantEvent: null
      };
    }

    const counts: Record<string, number> = {};
    let totalIntensity = 0;
    recent.forEach(e => {
      counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
      totalIntensity += e.intensity ?? 0.5;
    });

    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      hasSmile: (counts['smile'] ?? 0) > 0,
      hasLaughter: (counts['laughter'] ?? 0) > 0,
      hasFixation: (counts['fixation'] ?? 0) > 0,
      hasAttentionLoss: (counts['attention_loss'] ?? 0) > 0,
      avgIntensity: totalIntensity / recent.length,
      dominantEvent: dominant
    };
  }

  private timeSinceLastInteraction(): number {
    return Date.now() - this.state.lastInteractionTime;
  }

  private isSessionStart(): boolean {
    return this.state.lastInteractionType === null;
  }

  decide(childName: string, childAge: number, screenTimeMinutes: number, screenTimeLimit: number): InteractionDecision {
    // ── Safety: screen time limit reached ──────────────────
    if (screenTimeMinutes >= screenTimeLimit * 0.9) {
      return {
        action: 'talk',
        tts_text: getConversationText('screen_time_warning', childName),
        reason: 'Screen time limit approaching'
      };
    }

    // ── Session start: greet the child ─────────────────────
    if (this.isSessionStart()) {
      return {
        action: 'talk',
        tts_text: getConversationText('greeting', childName),
        reason: 'Session start greeting'
      };
    }

    const timeSinceLast = this.timeSinceLastInteraction();
    if (timeSinceLast < this.MIN_CYCLE_GAP_MS) {
      return { action: 'wait', reason: 'Too soon since last interaction' };
    }

    const eng = this.getRecentEngagement(8000);

    // ── Just finished talking → transition to song ─────────
    if (this.state.lastInteractionType === 'talk') {
      if (timeSinceLast >= this.TALK_DURATION_MS) {
        return {
          action: 'sing',
          tts_text: getConversationText('transition', childName),
          reason: 'Natural talk→sing cycle transition'
        };
      }
      return { action: 'wait', reason: 'Waiting for talk to complete' };
    }

    // ── Just finished singing → respond and decide ─────────
    if (this.state.lastInteractionType === 'sing') {
      if (timeSinceLast < this.SONG_DURATION_MS) {
        return { action: 'wait', reason: 'Song still playing' };
      }

      // High joy response → repeat or expand
      if (eng.hasLaughter && eng.avgIntensity > 0.7) {
        if (this.state.consecutiveSongs < 2) {
          return {
            action: 'talk',
            tts_text: getConversationText('joy_response', childName),
            reason: 'Child showing high joy — positive feedback loop'
          };
        }
      }

      // Attention lost → re-engage with talk
      if (eng.hasAttentionLoss) {
        return {
          action: 'talk',
          tts_text: getConversationText('attention_lost', childName),
          reason: 'Attention loss detected — re-engaging'
        };
      }

      // Normal cycle: after song → talk
      return {
        action: 'talk',
        tts_text: eng.hasSmile
          ? getConversationText('joy_response', childName)
          : getConversationText('after_song', childName),
        reason: 'Natural sing→talk cycle'
      };
    }

    // ── Idle state: check for engagement cues ─────────────
    if (eng.hasFixation || eng.hasSmile) {
      return {
        action: 'sing',
        tts_text: getConversationText('transition', childName),
        reason: 'Engagement detected — triggering music snippet'
      };
    }

    if (timeSinceLast > 10000) {
      return {
        action: 'talk',
        tts_text: getConversationText('attention_lost', childName),
        reason: 'Idle too long — re-engaging with conversation'
      };
    }

    return { action: 'wait', reason: 'Awaiting engagement cue' };
  }

  getCurrentState(): EngagementState {
    return { ...this.state };
  }
}

// ── Adaptive Learning Engine ──────────────────────────────────
export function computeAdaptiveUpdate(
  profile: AdaptiveProfile | null,
  newStyle: string,
  newTempo: string,
  engagementScore: number
): Partial<AdaptiveProfile> {
  const favStyles: Record<string, number> = profile?.favorite_styles
    ? JSON.parse(profile.favorite_styles) : {};
  const favTempos: Record<string, number> = profile?.favorite_tempos
    ? JSON.parse(profile.favorite_tempos) : {};

  // Weighted update: reinforce or diminish based on engagement
  const weight = engagementScore > 0.6 ? 1.2 : engagementScore > 0.3 ? 1.0 : 0.8;
  favStyles[newStyle] = ((favStyles[newStyle] ?? 0) + weight);
  favTempos[newTempo] = ((favTempos[newTempo] ?? 0) + weight);

  const prevScore = profile?.avg_engagement_score ?? 0;
  const totalSessions = (profile?.total_sessions ?? 0) + 1;
  const newAvg = ((prevScore * (totalSessions - 1)) + engagementScore) / totalSessions;

  return {
    favorite_styles: JSON.stringify(favStyles),
    favorite_tempos: JSON.stringify(favTempos),
    avg_engagement_score: parseFloat(newAvg.toFixed(3)),
    total_sessions: totalSessions,
    total_songs_played: (profile?.total_songs_played ?? 0) + 1,
  };
}

export function getBestStyleFromProfile(profile: AdaptiveProfile | null, fallback: string): string {
  if (!profile?.favorite_styles) return fallback;
  try {
    const styles: Record<string, number> = JSON.parse(profile.favorite_styles);
    const best = Object.entries(styles).sort((a, b) => b[1] - a[1])[0];
    return best?.[0] ?? fallback;
  } catch { return fallback; }
}

export function getBestTempoFromProfile(profile: AdaptiveProfile | null, fallback: string): string {
  if (!profile?.favorite_tempos) return fallback;
  try {
    const tempos: Record<string, number> = JSON.parse(profile.favorite_tempos);
    const best = Object.entries(tempos).sort((a, b) => b[1] - a[1])[0];
    return best?.[0] ?? fallback;
  } catch { return fallback; }
}

// ── Unique snippet hash ───────────────────────────────────────
export function generatePromptHash(prompt: string, childId: number): string {
  // Simple hash for dedup — not cryptographic
  let h = childId * 31;
  for (let i = 0; i < prompt.length; i++) {
    h = (Math.imul(31, h) + prompt.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0') + '_' + Date.now().toString(36);
}

// ── Variation algorithm ───────────────────────────────────────
export function varyPrompt(original: string, attempt: number): string {
  const variations = [
    ' Add a playful rhythm change.',
    ' Include a fun key modulation.',
    ' Add cheerful animal sound effects.',
    ' Make the melody slightly more bouncy.',
    ' Include a surprise percussion break.',
  ];
  return original + (variations[attempt % variations.length] ?? '');
}
