// ============================================================
// Lessons Route — Learning System
// Intent Layer: GetAvailableLessons, StartLesson,
//               SubmitAnswer, EvaluateAnswer, GenerateLesson
//
// Auth rules:
//  - GET  /lessons           → public (no auth needed)
//  - GET  /lessons/:id       → public for free lessons; locked for paid
//  - POST /lessons/start     → auth required for paid lessons only
//                              free lessons work for demo/guest users
//  - POST /lessons/answer    → same as start
//  - POST /lessons/generate  → paid subscription required
// ============================================================

import { Hono } from 'hono';
import type { Bindings } from '../types';

const lessons = new Hono<{ Bindings: Bindings }>();

// ── Tier access map ───────────────────────────────────────────
const TIER_LEVEL: Record<string, number> = { free: 0, starter: 1, premium: 2 };

// ── Helper: resolve user — returns null for guests, never throws ──
async function resolveUser(c: any) {
  const db  = c.env.DB;
  if (!db) return null;
  const tok = (c.req.header('Authorization') || '').replace('Bearer ', '').trim();
  if (!tok) return null;
  try {
    return await db.prepare(
      `SELECT u.id, u.email, u.subscription_tier, u.credits, u.trial_uses_remaining
       FROM auth_sessions s JOIN auth_users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).bind(tok).first<{ id: string; email: string; subscription_tier: string; credits: number; trial_uses_remaining: number }>();
  } catch (_) { return null; }
}

// ── Helper: safe user ID for DB (guest gets string 'guest') ──
function userId(user: any) { return user ? String(user.id) : 'guest'; }

// ── Helper: tier level for a user (guests = free) ────────────
function userTierLevel(user: any) {
  return TIER_LEVEL[user?.subscription_tier || 'free'] ?? 0;
}

// ── Helper: track analytics (non-blocking, best-effort) ──────
async function track(db: any, uid: string, childId: number | null, event: string, value = 1, meta: object = {}) {
  try {
    await db.prepare(
      `INSERT INTO analytics_events (user_id, child_id, event_type, value, metadata) VALUES (?, ?, ?, ?, ?)`
    ).bind(uid, childId, event, value, JSON.stringify(meta)).run();
  } catch (_) { /* non-blocking */ }
}

// ── Feedback text ─────────────────────────────────────────────
const CORRECT_PHRASES = [
  '✅ Amazing! That\'s right!',
  '✅ Yes! You\'re so smart!',
  '✅ Correct! Great job!',
  '✅ Woohoo! You got it!',
  '✅ Brilliant! Spot on!',
];
const WRONG_PHRASES = [
  '❌ Not quite — but great try!',
  '❌ Almost! Keep going!',
  '❌ Oops! Let\'s try the next one!',
];

// ─────────────────────────────────────────────────────────────
// GET /api/lessons
// Intent: GetAvailableLessons — public, no auth needed
// ─────────────────────────────────────────────────────────────
lessons.get('/', async (c) => {
  const user = await resolveUser(c);
  const db   = c.env.DB;
  if (!db) return c.json({ success: false, error: 'Database unavailable' }, 503);

  const age     = parseInt(c.req.query('age') || '5', 10);
  const topic   = c.req.query('topic') || null;
  const childId = parseInt(c.req.query('child_id') || '0', 10) || null;
  const tierLvl = userTierLevel(user);

  let query = `SELECT id, title, topic, age_min, age_max, difficulty, tier_required,
                      thumbnail_emoji, reward_type,
                      json_array_length(steps) as step_count
               FROM lessons
               WHERE age_min <= ? AND age_max >= ?`;
  const params: any[] = [age, age];

  if (topic) { query += ' AND topic = ?'; params.push(topic); }
  query += ' ORDER BY tier_required ASC, difficulty ASC';

  const rows = await db.prepare(query).bind(...params).all();
  const allLessons = (rows.results || []).map((l: any) => ({
    ...l,
    locked:  TIER_LEVEL[l.tier_required] > tierLvl,
    is_free: l.tier_required === 'free',
  }));

  // Progress for authenticated users only
  let progressMap: Record<number, any> = {};
  if (childId && user) {
    try {
      const prog = await db.prepare(
        `SELECT lesson_id, status, score FROM lesson_progress WHERE child_id = ? AND user_id = ?`
      ).bind(childId, String(user.id)).all();
      for (const p of (prog.results || [])) progressMap[(p as any).lesson_id] = p;
    } catch (_) {}
  }

  return c.json({
    success: true,
    data: {
      lessons:   allLessons.map((l: any) => ({ ...l, progress: progressMap[l.id] || null })),
      total:     allLessons.length,
      user_tier: user?.subscription_tier || 'free',
      topics:    ['animals', 'numbers', 'colors', 'letters', 'shapes', 'music'],
    }
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/lessons/:id  — full lesson with steps
// Public for free lessons; requires auth for paid
// ─────────────────────────────────────────────────────────────
lessons.get('/:id', async (c) => {
  const user   = await resolveUser(c);
  const db     = c.env.DB;
  if (!db) return c.json({ success: false, error: 'Database unavailable' }, 503);

  const id = parseInt(c.req.param('id'), 10);
  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ?').bind(id).first<any>();
  if (!lesson) return c.json({ success: false, error: 'Lesson not found' }, 404);

  const tierLvl = userTierLevel(user);
  const locked  = TIER_LEVEL[lesson.tier_required] > tierLvl;

  if (locked) {
    return c.json({
      success: false,
      error:   'This lesson requires ' + lesson.tier_required + ' plan',
      locked:  true,
      data:    { lesson_id: id, title: lesson.title, tier_required: lesson.tier_required },
    }, 403);
  }

  return c.json({
    success: true,
    data: { ...lesson, steps: JSON.parse(lesson.steps || '[]'), locked: false }
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/lessons/start
// Free lessons: no auth needed (guest user)
// Paid lessons: auth + matching tier required
// ─────────────────────────────────────────────────────────────
lessons.post('/start', async (c) => {
  const user = await resolveUser(c);
  const db   = c.env.DB;
  if (!db) return c.json({ success: false, error: 'Database unavailable' }, 503);

  const body = await c.req.json<{ lesson_id: number; child_id?: number }>().catch(() => ({})) as any;
  const lesson_id = Number(body?.lesson_id);
  const child_id  = Number(body?.child_id) || null;

  if (!lesson_id) return c.json({ success: false, error: 'lesson_id required' }, 400);

  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ?').bind(lesson_id).first<any>();
  if (!lesson) return c.json({ success: false, error: 'Lesson not found' }, 404);

  // Check tier access — paid lessons need auth
  const tierLvl = userTierLevel(user);
  if (TIER_LEVEL[lesson.tier_required] > tierLvl) {
    if (!user) {
      return c.json({ success: false, error: 'Please sign in to access this lesson', locked: true, needs_login: true }, 401);
    }
    await track(db, userId(user), child_id, 'upgrade_triggered', 1, { reason: 'lesson_locked', lesson_id });
    return c.json({ success: false, error: 'Upgrade to ' + lesson.tier_required + ' to unlock this lesson', locked: true }, 403);
  }

  const steps = JSON.parse(lesson.steps || '[]');
  const uid   = userId(user);

  // Create progress record (skip for pure guest with no child)
  let progressId: number | null = null;
  if (user && child_id) {
    try {
      const result = await db.prepare(
        `INSERT INTO lesson_progress (user_id, child_id, lesson_id, status, current_step)
         VALUES (?, ?, ?, 'started', 0)`
      ).bind(uid, child_id, lesson_id).run();
      progressId = result.meta.last_row_id as number;
      await track(db, uid, child_id, 'lesson_started', 1, { lesson_id, title: lesson.title });
    } catch (_) { /* progress tracking non-blocking */ }
  }

  return c.json({
    success: true,
    data: {
      progress_id:  progressId,
      lesson_id,
      title:        lesson.title,
      topic:        lesson.topic,
      thumbnail_emoji: lesson.thumbnail_emoji,
      step_count:   steps.length,
      current_step: 0,
      steps,                    // send all steps upfront for smooth flow
      first_step:   steps[0] || null,
      reward_type:  lesson.reward_type,
    }
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/lessons/answer
// Free lessons: no auth needed
// Paid lessons: auth required (enforced at start, not here)
// ─────────────────────────────────────────────────────────────
lessons.post('/answer', async (c) => {
  const user = await resolveUser(c);
  const db   = c.env.DB;
  if (!db) return c.json({ success: false, error: 'Database unavailable' }, 503);

  const body = await c.req.json<{
    progress_id?: number;
    lesson_id:    number;
    child_id?:    number;
    step_index:   number;
    answer:       string;
  }>().catch(() => ({})) as any;

  const { progress_id, lesson_id, child_id, step_index, answer } = body;
  if (!lesson_id || step_index === undefined || !answer) {
    return c.json({ success: false, error: 'lesson_id, step_index, answer required' }, 400);
  }

  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ?').bind(lesson_id).first<any>();
  if (!lesson) return c.json({ success: false, error: 'Lesson not found' }, 404);

  const steps: any[]  = JSON.parse(lesson.steps || '[]');
  const step          = steps[step_index];
  if (!step) return c.json({ success: false, error: 'Step not found' }, 404);

  // Evaluate answer
  const correct    = step.type === 'reward' ? true
    : (step.correct || '').trim().toLowerCase() === (answer || '').trim().toLowerCase();
  const isLastStep = step_index >= steps.length - 1;
  const nextIdx    = isLastStep ? step_index : step_index + 1;

  // Update progress record if we have one
  if (progress_id && user) {
    try {
      const field = correct ? 'correct_count = correct_count + 1' : 'incorrect_count = incorrect_count + 1';
      await db.prepare(
        `UPDATE lesson_progress SET ${field}, current_step = ? WHERE id = ? AND user_id = ?`
      ).bind(nextIdx, progress_id, String(user.id)).run();

      if (isLastStep) {
        const prog = await db.prepare(
          'SELECT correct_count, incorrect_count FROM lesson_progress WHERE id = ?'
        ).bind(progress_id).first<{ correct_count: number; incorrect_count: number }>();
        const total = (prog?.correct_count || 0) + (prog?.incorrect_count || 0);
        const score = total > 0 ? Math.round((prog?.correct_count || 0) / total * 100) : 100;
        await db.prepare(
          `UPDATE lesson_progress SET status='completed', score=?, completed_at=CURRENT_TIMESTAMP WHERE id=?`
        ).bind(score, progress_id).run();
        await track(db, userId(user), child_id || null, 'lesson_completed', score, { lesson_id, score });
      }
    } catch (_) { /* non-blocking */ }
  }

  // Track event (best-effort)
  if (user) {
    await track(db, userId(user), child_id || null,
      correct ? 'correct_answer' : 'incorrect_answer', 1,
      { lesson_id, step_index, answer, correct_answer: step.correct });
  }

  // Build rich feedback
  const feedbackText = correct
    ? (isLastStep
        ? '🏆 You finished the lesson! Amazing work!'
        : CORRECT_PHRASES[Math.floor(Math.random() * CORRECT_PHRASES.length)])
    : (WRONG_PHRASES[Math.floor(Math.random() * WRONG_PHRASES.length)] + (step.correct ? ` The answer is "${step.correct}"` : ''));

  const animation = isLastStep ? 'full_celebration'
    : correct ? 'confetti_burst' : 'soft_encouragement';

  return c.json({
    success: true,
    data: {
      correct,
      correct_answer:  step.correct || null,
      animation,
      feedback_text:   feedbackText,
      next_step:       isLastStep ? null : steps[nextIdx],
      next_step_index: nextIdx,
      is_complete:     isLastStep,
      emotion_hint:    correct ? 'excited' : 'encouraging',
    }
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/lessons/generate  — Groq-powered lesson gen
// Requires paid subscription
// ─────────────────────────────────────────────────────────────
lessons.post('/generate', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Sign in to generate lessons', needs_login: true }, 401);
  if ((TIER_LEVEL[user.subscription_tier] ?? 0) < 1) {
    return c.json({ success: false, error: 'Lesson generation requires Starter or Premium plan', locked: true }, 403);
  }

  const db = c.env.DB;
  if (!db) return c.json({ success: false, error: 'Database unavailable' }, 503);

  const body = await c.req.json<{ age_group?: string; topic?: string; difficulty?: string; child_id?: number }>()
    .catch(() => ({})) as any;
  const { age_group = '4-6', topic = 'animals', difficulty = 'easy', child_id } = body;
  const groqKey = (c.env as any).GROQ_API_KEY;

  if (!groqKey) return c.json({ success: false, error: 'Lesson generation not available' }, 503);

  const prompt = `You are a children's lesson designer. Create a fun, interactive 5-step lesson for ages ${age_group} about "${topic}" at ${difficulty} difficulty.
Return ONLY valid JSON in this exact format, no other text:
{
  "title": "short fun title",
  "topic": "${topic}",
  "age_min": <number>,
  "age_max": <number>,
  "difficulty": "${difficulty}",
  "tier_required": "starter",
  "thumbnail_emoji": "<single emoji>",
  "reward_type": "confetti",
  "steps": [
    {"type":"intro","text":"exciting welcome text for the child","emoji":"🎉"},
    {"type":"question","text":"question text?","correct":"answer","options":["answer","wrong1","wrong2","wrong3"],"emoji":"<emoji>"},
    {"type":"question","text":"question text?","correct":"answer","options":["answer","wrong1","wrong2","wrong3"],"emoji":"<emoji>"},
    {"type":"question","text":"question text?","correct":"answer","options":["answer","wrong1","wrong2","wrong3"],"emoji":"<emoji>"},
    {"type":"reward","text":"amazing celebration message for completing the lesson","emoji":"🏆"}
  ]
}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1200,
      }),
    });

    const groqData = await groqRes.json() as any;
    const content  = groqData.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const lessonData = JSON.parse(jsonMatch[0]);

    // Shuffle options so correct answer isn't always first
    if (lessonData.steps) {
      lessonData.steps = lessonData.steps.map((s: any) => {
        if (s.type === 'question' && s.options) {
          s.options = s.options.sort(() => Math.random() - 0.5);
        }
        return s;
      });
    }

    const result = await db.prepare(
      `INSERT INTO lessons (title, topic, age_min, age_max, difficulty, tier_required, thumbnail_emoji, reward_type, steps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      lessonData.title, lessonData.topic,
      lessonData.age_min || 4, lessonData.age_max || 8,
      lessonData.difficulty, lessonData.tier_required || 'starter',
      lessonData.thumbnail_emoji || '📚', lessonData.reward_type || 'confetti',
      JSON.stringify(lessonData.steps)
    ).run();

    await track(db, String(user.id), child_id || null, 'lesson_generated', 1, { topic, difficulty, age_group });

    return c.json({
      success: true,
      data: { ...lessonData, id: result.meta.last_row_id, steps: lessonData.steps }
    });
  } catch (e: any) {
    return c.json({ success: false, error: 'Generation failed: ' + e.message }, 500);
  }
});

export { lessons };
