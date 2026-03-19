// ============================================================
// Groq Behavior Engine — Prompt Builder
// src/lib/groq/prompt-builder.ts
// ============================================================
// Constructs system + user prompts optimised for Groq LLaMA.
// The prompt forces Groq to return structured JSON behavior
// instructions, not free-form text.
// ============================================================

import type { ContextState, EngagementMetrics, BehaviorMode } from './types';

// ── System prompt — never changes per request ─────────────────
export const SYSTEM_PROMPT = `You are MusicBuddy, an AI children's music host (like Ms. Rachel or Gracie's Corner). You are warm, energetic, expressive, and deeply engaging for children aged 2-8.

Your job is to decide the NEXT ACTION for the host, then write the exact speech text.

ALWAYS return valid JSON matching this exact schema:
{
  "mode": "sing" | "talk" | "encourage" | "pause" | "celebrate" | "reengage",
  "tone": "excited" | "warm" | "playful" | "soothing" | "encouraging" | "celebratory" | "curious" | "gentle",
  "text": "<exact words to speak — warm, expressive, children's host style>",
  "follow_up": "encourage_participation" | "sing_along" | "wait_for_response" | "play_next_song" | "start_minigame" | "celebrate_achievement" | "gentle_redirect" | "ask_question" | null,
  "timing": "immediate" | "after_song" | "delayed",
  "sing_along": "<if mode=sing: short phrase/lyric to sing>" | null,
  "question": "<if asking child something interactive>" | null
}

RULES:
- text must be 1-3 sentences MAX, natural and childlike
- For toddlers (age <3): VERY simple, lots of repetition, 1 sentence only
- For preschool (3-5): simple, warm, 1-2 sentences  
- For early school (6+): slightly more complex, 2-3 sentences
- NEVER be robotic — always sound like a live, caring host
- If child is disengaged: gently reengage with excitement
- After 3+ songs without talking: switch to talk/encourage mode
- React to smiles and laughs with celebration
- Always encourage participation — never just perform TO the child
- Include child's name occasionally for connection`;

// ── Build user prompt from current state ──────────────────────
export function buildUserPrompt(
  ctx: ContextState,
  eng: EngagementMetrics,
  forceMode?: BehaviorMode
): string {

  const ageGroup = ctx.childAge < 3 ? 'toddler' : ctx.childAge < 6 ? 'preschool' : 'early school';

  const engSummary = [
    eng.smileCount > 0 && `${eng.smileCount} smiles`,
    eng.laughCount > 0 && `${eng.laughCount} laughs`,
    eng.attentionLoss > 1 && `looked away ${eng.attentionLoss} times`,
    eng.voiceDetected && 'child has been vocal',
    !eng.gazeOnScreen && 'child not looking at screen',
    eng.dominantEvent && `most common: ${eng.dominantEvent}`,
  ].filter(Boolean).join(', ') || 'neutral engagement';

  const recentEvts = eng.recentEvents?.slice(-3).join(', ') || 'none';

  const modeInstruction = forceMode
    ? `FORCED MODE: You MUST use mode="${forceMode}".`
    : `Choose the best mode based on context.`;

  return `Current state:
- Child: ${ctx.childName}, age ${ctx.childAge} (${ageGroup})
- Preferred style: ${ctx.preferredStyle}
- Energy level: ${ctx.energyLevel}
- Current mode: ${ctx.currentMode}, last mode: ${ctx.lastMode || 'none'}
- Session: ${Math.round(ctx.sessionDuration)} min, ${ctx.songCount} songs played, ${ctx.talkCount} talks
- Consecutive songs without talk: ${ctx.consecutiveSongs}
- Trigger: ${ctx.trigger}

Engagement this session:
- ${engSummary}
- Recent events: ${recentEvts}
- Intensity score: ${Math.round(eng.intensity * 100)}%

${modeInstruction}

If consecutive songs >= 3: prefer "talk" or "encourage" mode.
If child looks away / low intensity: use "reengage" mode.
If high smiles+laughs: use "celebrate" then "encourage_participation".

Respond with JSON only. No markdown. No explanation.`;
}

// ── Deterministic fallback (no API needed) ────────────────────
// Used when Groq is unavailable or key not configured.
export function getFallbackBehavior(
  ctx: ContextState,
  eng: EngagementMetrics,
  forceMode?: BehaviorMode
): import('./types').BehaviorResponse {

  const name = ctx.childName;
  const age  = ctx.childAge;

  // Choose mode
  let mode: BehaviorMode = forceMode ?? 'talk';
  if (!forceMode) {
    if (ctx.consecutiveSongs >= 3)         mode = 'encourage';
    else if (!eng.gazeOnScreen)             mode = 'reengage';
    else if (eng.smileCount + eng.laughCount > 3) mode = 'celebrate';
    else if (ctx.trigger === 'song_ended') mode = 'encourage';
    else if (ctx.trigger === 'auto')       mode = 'sing';
    else                                   mode = 'talk';
  }

  // Age-appropriate text bank
  const textBank: Record<BehaviorMode, string[]> = {
    sing: [
      age < 3
        ? `La la la! Sing with me, ${name}!`
        : `Let's sing together, ${name}! Ready? La la la! 🎶`,
      `Come on, ${name}! Let's make some music! Do re mi fa sol! 🎵`,
    ],
    talk: [
      age < 3
        ? `Hi ${name}! Music time! 🎵`
        : `Hey ${name}! Are you ready for some amazing music? Let's go! 🎉`,
      `Wow, ${name}! You are doing so great today! I love making music with you! 🌟`,
    ],
    encourage: [
      `You are SO amazing, ${name}! Keep going! You've got this! 💪✨`,
      age < 3 ? `Yay ${name}! Yay!` : `Incredible job, ${name}! I knew you could do it! 🎊`,
    ],
    pause: [
      `Shhh... listen! Can you hear the music, ${name}? 🎵`,
      `Your turn, ${name}! What do YOU want to do? 🌟`,
    ],
    celebrate: [
      `HOORAY! That was AMAZING, ${name}! 🎉🎊✨`,
      age < 3 ? `Yay yay yay! ${name}!` : `WOW! You are a SUPERSTAR, ${name}! 🌟🌟🌟`,
    ],
    reengage: [
      age < 3
        ? `${name}! ${name}! Look! Music! 🎵`
        : `Hey ${name}! Come back! We have something SO fun coming up! 🎵✨`,
      `Psst, ${name}... I have a special surprise for you! 👀🎵`,
    ],
  };

  const texts = textBank[mode];
  const text = texts[Math.floor(Math.random() * texts.length)];

  const followUpMap: Record<BehaviorMode, import('./types').FollowUpAction> = {
    sing:       'sing_along',
    talk:       'wait_for_response',
    encourage:  'encourage_participation',
    pause:      'wait_for_response',
    celebrate:  'celebrate_achievement',
    reengage:   'gentle_redirect',
  };

  const toneMap: Record<BehaviorMode, import('./types').BehaviorTone> = {
    sing:       'playful',
    talk:       'warm',
    encourage:  'encouraging',
    pause:      'curious',
    celebrate:  'celebratory',
    reengage:   'gentle',
  };

  return {
    mode,
    tone:      toneMap[mode],
    text,
    followUp:  followUpMap[mode],
    timing:    'immediate',
    fromCache: false,
  };
}
