// ============================================================
// Lessons Route — Learning System
// Intent Layer: GetAvailableLessons, StartLesson,
//               SubmitAnswer, EvaluateAnswer, GenerateLesson
// ============================================================

import { Hono } from 'hono';
import type { Bindings } from '../types';

const lessons = new Hono<{ Bindings: Bindings }>();

// ── Tier access map ───────────────────────────────────────────
const TIER_LEVEL: Record<string, number> = { free: 0, starter: 1, premium: 2 };
const LESSON_TIER_LEVEL: Record<string, number> = { free: 0, starter: 1, premium: 2 };

// ── Helper: resolve user from token ──────────────────────────
async function resolveUser(c: any) {
  const db  = c.env.DB;
  const tok = (c.req.header('Authorization') || '').replace('Bearer ', '').trim();
  if (!tok) return null;
  return db.prepare(
    `SELECT u.id, u.email, u.subscription_tier, u.credits
     FROM auth_sessions s JOIN auth_users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(tok).first<{ id: string; email: string; subscription_tier: string; credits: number }>();
}

// ── Helper: track analytics ───────────────────────────────────
async function track(db: any, userId: string, childId: number | null, event: string, value = 1, meta: object = {}) {
  try {
    await db.prepare(
      `INSERT INTO analytics_events (user_id, child_id, event_type, value, metadata) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, childId, event, value, JSON.stringify(meta)).run();
  } catch (_) { /* non-blocking */ }
}

// ─────────────────────────────────────────────────────────────
// GET /api/lessons
// Intent: GetAvailableLessons
// Query: ?age=5&topic=animals&child_id=1
// ─────────────────────────────────────────────────────────────
lessons.get('/', async (c) => {
  const user = await resolveUser(c);
  const db   = c.env.DB;

  const age      = parseInt(c.req.query('age') || '5', 10);
  const topic    = c.req.query('topic') || null;
  const childId  = parseInt(c.req.query('child_id') || '0', 10) || null;

  const userTier    = user?.subscription_tier || 'free';
  const tierLevel   = TIER_LEVEL[userTier] ?? 0;

  let query = `SELECT id, title, topic, age_min, age_max, difficulty, tier_required,
                      thumbnail_emoji, reward_type,
                      json_array_length(steps) as step_count
               FROM lessons
               WHERE age_min <= ? AND age_max >= ?`;
  const params: any[] = [age, age];

  if (topic) {
    query += ' AND topic = ?';
    params.push(topic);
  }

  query += ' ORDER BY tier_required ASC, difficulty ASC';

  const rows = await db.prepare(query).bind(...params).all();
  const allLessons = rows.results || [];

  // Mark locked status based on user tier
  const enriched = allLessons.map((l: any) => ({
    ...l,
    locked:   LESSON_TIER_LEVEL[l.tier_required] > tierLevel,
    is_free:  l.tier_required === 'free',
  }));

  // Fetch progress for this child if given
  let progressMap: Record<number, any> = {};
  if (childId && user) {
    const prog = await db.prepare(
      `SELECT lesson_id, status, score, correct_count, incorrect_count
       FROM lesson_progress WHERE child_id = ? AND user_id = ?`
    ).bind(childId, user.id).all();
    for (const p of (prog.results || [])) {
      progressMap[(p as any).lesson_id] = p;
    }
  }

  const withProgress = enriched.map((l: any) => ({
    ...l,
    progress: progressMap[l.id] || null,
  }));

  return c.json({
    success: true,
    data: {
      lessons:     withProgress,
      total:       withProgress.length,
      user_tier:   userTier,
      topics:      ['animals', 'numbers', 'colors', 'letters', 'shapes', 'music'],
    }
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/lessons/:id
// Intent: GetLesson (full steps)
// ─────────────────────────────────────────────────────────────
lessons.get('/:id', async (c) => {
  const user    = await resolveUser(c);
  const db      = c.env.DB;
  const id      = parseInt(c.req.param('id'), 10);

  const lesson = await db.prepare(
    'SELECT * FROM lessons WHERE id = ?'
  ).bind(id).first<any>();

  if (!lesson) return c.json({ success: false, error: 'Lesson not found' }, 404);

  const userTier  = user?.subscription_tier || 'free';
  const tierLevel = TIER_LEVEL[userTier] ?? 0;
  const locked    = LESSON_TIER_LEVEL[lesson.tier_required] > tierLevel;

  if (locked) {
    return c.json({
      success: false,
      error:   'This lesson requires a higher subscription tier',
      data: {
        lesson_id:     id,
        title:         lesson.title,
        tier_required: lesson.tier_required,
        locked:        true,
        upgrade_url:   '/?tab=billing',
      }
    }, 403);
  }

  return c.json({
    success: true,
    data: {
      ...lesson,
      steps:  JSON.parse(lesson.steps || '[]'),
      locked: false,
    }
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/start-lesson
// Intent: StartLesson
// Body: { lesson_id, child_id }
// ─────────────────────────────────────────────────────────────
lessons.post('/start', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ lesson_id: number; child_id: number }>();
  const { lesson_id, child_id } = body;
  if (!lesson_id || !child_id) return c.json({ success: false, error: 'lesson_id and child_id required' }, 400);

  const db = c.env.DB;

  // Load lesson
  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ?').bind(lesson_id).first<any>();
  if (!lesson) return c.json({ success: false, error: 'Lesson not found' }, 404);

  // Check tier access
  const tierLevel = TIER_LEVEL[user.subscription_tier] ?? 0;
  if (LESSON_TIER_LEVEL[lesson.tier_required] > tierLevel) {
    await track(db, user.id, child_id, 'upgrade_triggered', 1, { reason: 'lesson_locked', lesson_id });
    return c.json({ success: false, error: 'Lesson locked — upgrade required', locked: true }, 403);
  }

  // Create progress record
  const result = await db.prepare(
    `INSERT INTO lesson_progress (user_id, child_id, lesson_id, status, current_step)
     VALUES (?, ?, ?, 'started', 0)`
  ).bind(user.id, child_id, lesson_id).run();

  const progressId = result.meta.last_row_id;
  const steps = JSON.parse(lesson.steps || '[]');

  await track(db, user.id, child_id, 'lesson_started', 1, { lesson_id, title: lesson.title });

  return c.json({
    success: true,
    data: {
      progress_id:  progressId,
      lesson_id,
      title:        lesson.title,
      topic:        lesson.topic,
      step_count:   steps.length,
      current_step: 0,
      first_step:   steps[0] || null,
      reward_type:  lesson.reward_type,
    }
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/submit-answer
// Intent: SubmitAnswer → EvaluateAnswer
// Body: { progress_id, lesson_id, child_id, step_index, answer }
// ─────────────────────────────────────────────────────────────
lessons.post('/answer', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const body = await c.req.json<{
    progress_id: number;
    lesson_id:   number;
    child_id:    number;
    step_index:  number;
    answer:      string;
  }>();
  const { progress_id, lesson_id, child_id, step_index, answer } = body;
  if (!lesson_id || step_index === undefined || !answer) {
    return c.json({ success: false, error: 'lesson_id, step_index, answer required' }, 400);
  }

  const db = c.env.DB;
  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ?').bind(lesson_id).first<any>();
  if (!lesson) return c.json({ success: false, error: 'Lesson not found' }, 404);

  const steps: any[] = JSON.parse(lesson.steps || '[]');
  const step = steps[step_index];
  if (!step) return c.json({ success: false, error: 'Step not found' }, 404);

  // ── Intent: EvaluateAnswer ────────────────────────────────
  const correct = step.type === 'reward'
    ? true
    : (step.correct || '').trim().toLowerCase() === answer.trim().toLowerCase();

  const isLastStep   = step_index >= steps.length - 1;
  const nextStep     = isLastStep ? null : steps[step_index + 1];
  const nextStepIdx  = isLastStep ? step_index : step_index + 1;

  // Update progress
  if (progress_id) {
    const updateFields = correct
      ? `correct_count = correct_count + 1, current_step = ?`
      : `incorrect_count = incorrect_count + 1, current_step = ?`;

    await db.prepare(
      `UPDATE lesson_progress SET ${updateFields} WHERE id = ? AND user_id = ?`
    ).bind(nextStepIdx, progress_id, user.id).run();

    if (isLastStep) {
      // Calculate final score
      const prog = await db.prepare(
        'SELECT correct_count, incorrect_count FROM lesson_progress WHERE id = ?'
      ).bind(progress_id).first<{ correct_count: number; incorrect_count: number }>();
      const total   = (prog?.correct_count || 0) + (prog?.incorrect_count || 0);
      const score   = total > 0 ? Math.round((prog?.correct_count || 0) / total * 100) : 100;

      await db.prepare(
        `UPDATE lesson_progress SET status = 'completed', score = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(score, progress_id).run();

      await track(db, user.id, child_id, 'lesson_completed', score, { lesson_id, score });
    }
  }

  // Track answer event
  await track(db, user.id, child_id, correct ? 'correct_answer' : 'incorrect_answer', 1, {
    lesson_id, step_index, answer, correct_answer: step.correct
  });

  // ── Determine animation intent ─────────────────────────────
  let animationType = correct
    ? (isLastStep ? 'celebration' : 'confetti_burst')
    : 'soft_encouragement';

  if (isLastStep) animationType = 'full_celebration';

  return c.json({
    success: true,
    data: {
      correct,
      correct_answer:  step.correct || null,
      animation:       animationType,    // Intent: TriggerAnimation
      feedback_text:   correct
        ? (isLastStep ? '🏆 PERFECT! You finished the lesson!' : '✅ Correct! Amazing!')
        : `❌ Not quite — the answer was "${step.correct}"`,
      next_step:       nextStep,
      next_step_index: nextStepIdx,
      is_complete:     isLastStep,
      emotion_hint:    correct ? 'excited' : 'encouraging',
    }
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/lessons/generate
// Intent: GenerateLesson (Groq-powered)
// Body: { age_group, topic, difficulty, child_id }
// ─────────────────────────────────────────────────────────────
lessons.post('/generate', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
  if (user.subscription_tier === 'free') {
    return c.json({ success: false, error: 'Lesson generation requires a paid subscription', locked: true }, 403);
  }

  const body = await c.req.json<{ age_group?: string; topic?: string; difficulty?: string; child_id?: number }>();
  const { age_group = '4-6', topic = 'animals', difficulty = 'easy', child_id } = body;
  const groqKey = (c.env as any).GROQ_API_KEY;

  if (!groqKey) {
    return c.json({ success: false, error: 'Lesson generation not available (Groq not configured)' }, 503);
  }

  const prompt = `You are a children's lesson designer. Create a fun, interactive lesson for ages ${age_group} about "${topic}" at ${difficulty} difficulty.

Return ONLY valid JSON in this exact format:
{
  "title": "lesson title",
  "topic": "${topic}",
  "age_min": <number>,
  "age_max": <number>,
  "difficulty": "${difficulty}",
  "tier_required": "starter",
  "thumbnail_emoji": "<emoji>",
  "reward_type": "confetti",
  "steps": [
    {"type": "intro", "text": "welcome text", "emoji": "🎉"},
    {"type": "question", "text": "question?", "correct": "correct answer", "options": ["opt1","opt2","opt3","opt4"], "emoji": "🔤"},
    {"type": "question", "text": "question2?", "correct": "correct answer2", "options": ["opt1","opt2","opt3","opt4"], "emoji": "🔤"},
    {"type": "question", "text": "question3?", "correct": "correct answer3", "options": ["opt1","opt2","opt3","opt4"], "emoji": "🔤"},
    {"type": "reward", "text": "celebration message", "emoji": "🏆"}
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
        max_tokens: 1000,
      }),
    });

    const groqData = await groqRes.json() as any;
    const content  = groqData.choices?.[0]?.message?.content || '';

    // Parse JSON from Groq response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Groq response');

    const lessonData = JSON.parse(jsonMatch[0]);

    const db = c.env.DB;
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

    await track(db, user.id, child_id || null, 'lesson_generated', 1, { topic, difficulty, age_group });

    return c.json({
      success: true,
      data: {
        ...lessonData,
        id:    result.meta.last_row_id,
        steps: lessonData.steps,
      }
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

export { lessons };
