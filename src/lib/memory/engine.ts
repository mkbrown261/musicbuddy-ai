// ============================================================
// Memory Engine — src/lib/memory/engine.ts
// ============================================================
// PHASE 2: MusicBuddy "Alive System"
//
// This is the "magic" layer — MusicBuddy remembers the child
// across sessions: name, favorite style, last emotion, 
// interaction count, and anything notable they said.
//
// Backed by D1 (child_memory table) + adaptive_profiles.
// Falls back gracefully if DB is unavailable.
//
// Used by:
//   - Groq prompt builder (personalizes every response)
//   - Emotion engine (last emotion informs current decision)
//   - TTS orchestrator (voice config preference)
// ============================================================

import type { EmotionLabel } from '../emotion/engine';

// ── Memory record ─────────────────────────────────────────────
export interface ChildMemory {
  childId:          number;
  name:             string;
  age:              number;
  favoriteStyle:    string;          // 'playful' | 'upbeat' | 'lullaby' etc.
  lastEmotion:      EmotionLabel | null;
  dominantEmotion:  EmotionLabel | null;  // most frequent across sessions
  interactionCount: number;          // total speak interactions
  sessionCount:     number;
  favoritePhrases:  string[];        // things child said that got high engagement
  milestonesReached: string[];       // 'first_song', 'five_sessions', etc.
  energyPattern:    'morning_high' | 'evening_calm' | 'consistent' | 'unknown';
  lastSeen:         string;          // ISO timestamp
  notes:            string;          // free-text notes from memory updates
}

// ── Default empty memory ──────────────────────────────────────
function defaultMemory(childId: number, name = 'friend', age = 5): ChildMemory {
  return {
    childId,
    name,
    age,
    favoriteStyle:     'playful',
    lastEmotion:       null,
    dominantEmotion:   null,
    interactionCount:  0,
    sessionCount:      0,
    favoritePhrases:   [],
    milestonesReached: [],
    energyPattern:     'unknown',
    lastSeen:          new Date().toISOString(),
    notes:             '',
  };
}

// ── Get child memory from D1 ──────────────────────────────────
export async function getChildMemory(
  db: D1Database,
  childId: number,
): Promise<ChildMemory> {
  try {
    // 1. Try child_memory table
    const memRow = await db
      .prepare('SELECT * FROM child_memory WHERE child_id = ? LIMIT 1')
      .bind(childId)
      .first<any>();

    // 2. Always also read child_profiles for name/age/style
    const profile = await db
      .prepare('SELECT name, age, preferred_style FROM child_profiles WHERE id = ? LIMIT 1')
      .bind(childId)
      .first<any>();

    // 3. Also read adaptive_profiles for session/style data
    const adaptive = await db
      .prepare('SELECT * FROM adaptive_profiles WHERE child_id = ? LIMIT 1')
      .bind(childId)
      .first<any>();

    const name          = profile?.name          ?? 'friend';
    const age           = profile?.age           ?? 5;
    const favoriteStyle = adaptive?.favorite_styles
      ? getBestStyle(adaptive.favorite_styles)
      : (profile?.preferred_style ?? 'playful');

    if (!memRow) {
      // First time — build from profile data
      return {
        ...defaultMemory(childId, name, age),
        favoriteStyle,
        sessionCount: adaptive?.total_sessions ?? 0,
      };
    }

    return {
      childId,
      name,
      age,
      favoriteStyle,
      lastEmotion:       (memRow.last_emotion    as EmotionLabel) ?? null,
      dominantEmotion:   (memRow.dominant_emotion as EmotionLabel) ?? null,
      interactionCount:  memRow.interaction_count ?? 0,
      sessionCount:      adaptive?.total_sessions ?? memRow.session_count ?? 0,
      favoritePhrases:   safeParseJSON(memRow.favorite_phrases, []),
      milestonesReached: safeParseJSON(memRow.milestones, []),
      energyPattern:     memRow.energy_pattern   ?? 'unknown',
      lastSeen:          memRow.updated_at        ?? new Date().toISOString(),
      notes:             memRow.notes             ?? '',
    };
  } catch (e) {
    // Never crash — return safe defaults
    return defaultMemory(childId);
  }
}

// ── Update child memory ───────────────────────────────────────
export interface MemoryUpdate {
  lastEmotion?:       EmotionLabel;
  favoritePhrase?:    string;       // a phrase that got high engagement
  milestone?:         string;       // achievement to record
  interactionCount?:  number;       // increment by this amount (default 1)
  notes?:             string;       // append notes
}

export async function updateChildMemory(
  db: D1Database,
  childId: number,
  update: MemoryUpdate,
): Promise<void> {
  try {
    const existing = await db
      .prepare('SELECT * FROM child_memory WHERE child_id = ? LIMIT 1')
      .bind(childId)
      .first<any>();

    const now = new Date().toISOString();

    // Compute new dominant emotion
    const emotionCounts: Record<string, number> = safeParseJSON(
      existing?.emotion_counts, {}
    );
    if (update.lastEmotion) {
      emotionCounts[update.lastEmotion] = (emotionCounts[update.lastEmotion] ?? 0) + 1;
    }
    const dominant = Object.entries(emotionCounts)
      .sort(([,a],[,b]) => b - a)[0]?.[0] ?? null;

    // Merge favorite phrases (keep last 10)
    const phrases: string[] = safeParseJSON(existing?.favorite_phrases, []);
    if (update.favoritePhrase && !phrases.includes(update.favoritePhrase)) {
      phrases.unshift(update.favoritePhrase);
      if (phrases.length > 10) phrases.pop();
    }

    // Merge milestones
    const milestones: string[] = safeParseJSON(existing?.milestones, []);
    if (update.milestone && !milestones.includes(update.milestone)) {
      milestones.push(update.milestone);
    }

    const interactions = (existing?.interaction_count ?? 0) + (update.interactionCount ?? 1);
    const notes = update.notes
      ? ((existing?.notes ?? '') + '\n' + update.notes).trim().slice(0, 500)
      : (existing?.notes ?? '');

    if (!existing) {
      // INSERT
      await db.prepare(`
        INSERT INTO child_memory
          (child_id, last_emotion, dominant_emotion, emotion_counts,
           interaction_count, favorite_phrases, milestones, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        childId,
        update.lastEmotion ?? null,
        dominant,
        JSON.stringify(emotionCounts),
        interactions,
        JSON.stringify(phrases),
        JSON.stringify(milestones),
        notes,
        now,
      ).run();
    } else {
      // UPDATE
      await db.prepare(`
        UPDATE child_memory SET
          last_emotion      = ?,
          dominant_emotion  = ?,
          emotion_counts    = ?,
          interaction_count = ?,
          favorite_phrases  = ?,
          milestones        = ?,
          notes             = ?,
          updated_at        = ?
        WHERE child_id = ?
      `).bind(
        update.lastEmotion ?? existing.last_emotion,
        dominant,
        JSON.stringify(emotionCounts),
        interactions,
        JSON.stringify(phrases),
        JSON.stringify(milestones),
        notes,
        now,
        childId,
      ).run();
    }
  } catch (e) {
    // Never crash — memory updates are best-effort
    console.error('[MemoryEngine] updateChildMemory error:', e);
  }
}

// ── Build personalized Groq system prompt from memory ─────────
// This is the magic — Groq sees the child's history and tailors
// every single response to that specific child.
export function buildPersonalizedPrompt(
  basePrompt: string,
  memory: ChildMemory,
  currentEmotion: EmotionLabel | null,
): string {
  const { name, age, favoriteStyle, lastEmotion, dominantEmotion,
          interactionCount, sessionCount, milestonesReached, favoritePhrases } = memory;

  const isNewUser   = sessionCount === 0 && interactionCount < 3;
  const isRegular   = sessionCount >= 5;
  const milestone   = milestonesReached[milestonesReached.length - 1] ?? null;
  const knownPhrases= favoritePhrases.slice(0, 3).join(', ') || 'none yet';

  const memoryBlock = `
═══════════════════════════════════════
CHILD MEMORY (use this to personalize)
═══════════════════════════════════════
Name:              ${name}
Age:               ${age}
Favorite Style:    ${favoriteStyle}
Last Emotion:      ${lastEmotion ?? 'unknown — first or recent interaction'}
Dominant Emotion:  ${dominantEmotion ?? 'not yet established'}
Sessions:          ${sessionCount} (${isNewUser ? 'NEW USER — be extra warm and welcoming' : isRegular ? 'REGULAR — treat like an old friend!' : 'getting to know them'})
Total Interactions:${interactionCount}
Favorite Phrases:  ${knownPhrases}
Latest Milestone:  ${milestone ?? 'none yet — celebrate their first win!'}
Current Emotion:   ${currentEmotion ?? 'unknown'}

PERSONALIZATION RULES:
${isNewUser ? `- This child is NEW! Be especially warm, simple, and welcoming.
- Use their name (${name}) often to make them feel seen.
- Keep sentences SHORT and SIMPLE.` : ''}
${isRegular ? `- ${name} is a REGULAR! Reference their love of ${favoriteStyle} music.
- You can be playful and reference past fun together.` : ''}
${dominantEmotion === 'comfort' ? `- ${name} often feels sad or needs comfort. Be extra gentle and supportive.` : ''}
${dominantEmotion === 'excited' ? `- ${name} is naturally energetic! Match their energy!` : ''}
${currentEmotion === 'calm' ? `- Child seems calm/sleepy right now — speak softly, use slower pacing.` : ''}
${currentEmotion === 'comfort' ? `- Child may be sad or frustrated. Lead with empathy before fun.` : ''}
${currentEmotion === 'excited' ? `- Child is EXCITED! Be big, loud, and celebratory!` : ''}
═══════════════════════════════════════`;

  return basePrompt + '\n' + memoryBlock;
}

// ── Check and award milestones ────────────────────────────────
export function checkMilestones(memory: ChildMemory): string | null {
  const { interactionCount, sessionCount, milestonesReached } = memory;

  const milestones: Array<{ id: string; check: () => boolean; label: string }> = [
    { id: 'first_hello',      check: () => interactionCount >= 1,   label: 'First Hello!' },
    { id: 'five_chats',       check: () => interactionCount >= 5,   label: '5 Chats!' },
    { id: 'first_session',    check: () => sessionCount >= 1,       label: 'First Session!' },
    { id: 'five_sessions',    check: () => sessionCount >= 5,       label: '5 Sessions!' },
    { id: 'twenty_sessions',  check: () => sessionCount >= 20,      label: '20 Sessions — Super Fan!' },
    { id: 'fifty_chats',      check: () => interactionCount >= 50,  label: '50 Chats — Amazing!' },
  ];

  for (const m of milestones) {
    if (m.check() && !milestonesReached.includes(m.id)) {
      return m.id;
    }
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────
function safeParseJSON<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function getBestStyle(favStylesJson: string): string {
  try {
    const obj: Record<string, number> = JSON.parse(favStylesJson);
    return Object.entries(obj).sort(([,a],[,b]) => b - a)[0]?.[0] ?? 'playful';
  } catch { return 'playful'; }
}
