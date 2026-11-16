// server/src/controllers/roadmap.controller.js

const mongoose = require('mongoose');
const Role = require('../models/Role.model');
const Roadmap = require('../models/Roadmap.model');
const { callLLM } = require('../services/llm.service');
const { assertSelf } = require('../middleware/security.middleware');
const { safeMessage } = require('../utils/safeError');
const {
  generateNextWindow,
  estimateFoundationalDuration,
  buildProgressMaps,
} = require('../utils/scheduler');

const WINDOW_SIZE = 14;
const EXTEND_THRESHOLD = 5;

function todayString() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// One LLM call per day, wording all of that day's chunks together.
// ---------------------------------------------------------------------------
async function generateTaskWordingForDay(chunks) {
  const wordingMap = new Map();
  if (!chunks || chunks.length === 0) return wordingMap;

  const system = `You write short, engaging daily study tasks for a student's learning roadmap, based on the given subtopics. For each subtopic, write a concise "taskName" (a short imperative title, under 12 words) and a "description" (1-2 sentences). If a subtopic's type is "practical", the description must incorporate the given practice prompt as a concrete action. If "conceptual", phrase the description as a focused review/study task. Respond with ONLY valid JSON in this exact shape: {"tasks": [{"key": "...", "taskName": "...", "description": "..."}]} — exactly one entry per input subtopic, preserving the given "key" value exactly so it can be matched back.`;

  const prompt = `Today's subtopics:\n${JSON.stringify(
    chunks.map(c => ({
      key: c.key, topicName: c.topicName, point: c.point,
      type: c.type, practicePrompt: c.practicePrompt, minutesAllotted: c.minutesAllotted,
    })), null, 2
  )}`;

  try {
    const raw = await callLLM({ system, prompt, mockKind: 'dailyTasks' });
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.tasks)) {
      parsed.tasks.forEach(t => {
        if (t.key) wordingMap.set(t.key, { taskName: t.taskName, description: t.description });
      });
    }
  } catch (err) {
    console.warn('[roadmap.controller] Task-wording LLM call failed or returned malformed JSON — falling back to raw outline text for this day.', err.message);
  }

  return wordingMap;
}

function buildTaskFromChunk(chunk, wordingMap) {
  const worded = wordingMap.get(chunk.key);
  return {
    id: chunk.key,
    topicId: chunk.topicId,
    track: chunk.track,
    taskName: (worded && worded.taskName) || chunk.point,
    description: (worded && worded.description) || chunk.practicePrompt || '',
    estimatedMinutes: chunk.minutesAllotted,
    status: 'not_started',
  };
}

async function buildTasksForDay(day) {
  if (day.phase !== 'foundational' || day.isBufferDay || !day.chunks || day.chunks.length === 0) {
    return [];
  }
  const wordingMap = await generateTaskWordingForDay(day.chunks);
  return day.chunks.map(c => buildTaskFromChunk(c, wordingMap));
}

async function buildRoadmapDays(schedulerDays) {
  return Promise.all(
    schedulerDays.map(async d => ({
      dayNumber: d.dayNumber,
      date: d.date,
      phase: d.phase,
      isBufferDay: d.isBufferDay,
      tasks: await buildTasksForDay(d),
      practicePlan: d.phase === 'practice' ? d.chunkPlan : undefined,
    }))
  );
}

// ---------------------------------------------------------------------------
// Split a roadmap's days into PAST (immutable history, date < today) and
// NON-PAST (today + future — the only days ever recomputed/discarded).
// ---------------------------------------------------------------------------
function splitPastAndFuture(days, today) {
  const past = days.filter(d => d.date < today);
  const nonPast = days.filter(d => d.date >= today);
  return { past, nonPast };
}

// ---------------------------------------------------------------------------
// Rollover trigger: true if any PAST day has a foundational, non-buffer task
// that was never completed — meaning today-forward needs to be recomputed so
// that task reappears rather than being silently lost.
// ---------------------------------------------------------------------------
function hasIncompletePastTask(pastDays) {
  return pastDays.some(day =>
    day.phase === 'foundational' &&
    !day.isBufferDay &&
    (day.tasks || []).some(t => t.status !== 'completed' && t.status !== 'verified')
  );
}

// ---------------------------------------------------------------------------
// POST /api/v1/roadmap/estimate
// ---------------------------------------------------------------------------

// ── Input validation shared by estimate + generate ───────────────────────────
// Limits keep a single request from asking the AI to write an absurd roadmap.
const LIMITS = { maxHoursPerDay: 16, maxBufferInterval: 30, maxGapTopics: 300 };

function validatePlanInput(body) {
  const { targetRoleId, gapTopicIds, hoursPerDay, daysPerWeek, bufferInterval } = body;

  if (typeof targetRoleId !== 'string' || !targetRoleId) {
    return 'targetRoleId is required.';
  }
  if (!Array.isArray(gapTopicIds) || gapTopicIds.length > LIMITS.maxGapTopics ||
      !gapTopicIds.every((id) => typeof id === 'string')) {
    return 'gapTopicIds must be an array of topic id strings.';
  }
  if (typeof hoursPerDay !== 'number' || !(hoursPerDay > 0) || hoursPerDay > LIMITS.maxHoursPerDay) {
    return `hoursPerDay must be a number greater than 0 and at most ${LIMITS.maxHoursPerDay}.`;
  }
  if (daysPerWeek !== undefined &&
      !(Number.isInteger(daysPerWeek) && daysPerWeek >= 1 && daysPerWeek <= 7)) {
    return 'daysPerWeek must be a whole number from 1 to 7.';
  }
  if (bufferInterval !== undefined &&
      !(Number.isInteger(bufferInterval) && bufferInterval >= 0 && bufferInterval <= LIMITS.maxBufferInterval)) {
    return `bufferInterval must be a whole number from 0 to ${LIMITS.maxBufferInterval}.`;
  }
  return null;
}

const USER_SETTABLE_STATUSES = ['not_started', 'in_progress', 'completed'];

async function estimateRoadmap(req, res) {
  try {
    const { targetRoleId, gapTopicIds, hoursPerDay, daysPerWeek, bufferInterval } = req.body;

    const problem = validatePlanInput(req.body);
    if (problem) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: problem } });
    }

    const role = mongoose.isValidObjectId(targetRoleId) ? await Role.findById(targetRoleId) : null;
    if (!role) {
      return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No role found with that ID.' } });
    }

    const gapTopics = role.topics.filter(t => gapTopicIds.includes(t.id));
    const foundIds = new Set(gapTopics.map(t => t.id));
    const missingIds = gapTopicIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      return res.status(400).json({ success: false, error: { code: 'UNKNOWN_TOPIC_IDS', message: `These topic IDs don't exist on role "${role.name}": ${missingIds.join(', ')}` } });
    }

    const estimate = estimateFoundationalDuration({ gapTopics, hoursPerDay, daysPerWeek: daysPerWeek || 5, bufferInterval: bufferInterval || 0 });
    res.status(200).json({ success: true, data: { estimate } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/roadmap/generate
// ---------------------------------------------------------------------------
async function generateRoadmap(req, res) {
  try {
    const { targetRoleId, gapTopicIds, hoursPerDay, bufferInterval, daysPerWeek, replace } = req.body;
    const userId = req.user.userId; // always the logged-in user
    if (!assertSelf(req, res, req.body.userId)) return;

    const problem = validatePlanInput(req.body);
    if (problem) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: problem } });
    }

    // One roadmap per user. Replacing needs an explicit `replace: true` so a
    // double-click or retry can never silently create (or wipe) a roadmap.
    const existing = await Roadmap.exists({ userId });
    if (existing && replace !== true) {
      return res.status(409).json({
        success: false,
        error: { code: 'ROADMAP_EXISTS', message: 'You already have a roadmap. Confirm to replace it with a new one.' },
      });
    }

    const role = mongoose.isValidObjectId(targetRoleId) ? await Role.findById(targetRoleId) : null;
    if (!role) {
      return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No role found with that ID.' } });
    }

    const gapTopics = role.topics.filter(t => gapTopicIds.includes(t.id));
    const foundIds = new Set(gapTopics.map(t => t.id));
    const missingIds = gapTopicIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      return res.status(400).json({ success: false, error: { code: 'UNKNOWN_TOPIC_IDS', message: `These topic IDs don't exist on role "${role.name}": ${missingIds.join(', ')}` } });
    }

    const startDate = todayString();

    const { days, phase } = generateNextWindow({
      gapTopics,
      completedChunkMap: new Map(),
      hoursPerDay,
      daysPerWeek: daysPerWeek || 5,
      bufferInterval: bufferInterval || 0,
      startDayNumber: 1,
      startDate,
      windowSize: WINDOW_SIZE,
    });

    const roadmapDays = await buildRoadmapDays(days);

    if (existing) await Roadmap.deleteMany({ userId }); // only reached after the new days were built successfully

    const roadmap = await Roadmap.create({
      userId,
      targetRoleId,
      gapTopicIds, // persisted now — future regeneration reads this instead of guessing from stored tasks
      startDate,
      daysPerWeek: daysPerWeek || 5,
      hoursPerDay,
      bufferInterval: bufferInterval || 0, // was missing from the schema before — now actually saved
      totalDays: roadmapDays.length,
      days: roadmapDays,
    });

    res.status(201).json({ success: true, data: { roadmap, currentPhase: phase } });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: { code: 'ROADMAP_EXISTS', message: 'You already have a roadmap.' },
      });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/roadmap/:userId
//
// Past days (date < today) are NEVER touched — permanent history.
// Non-past days (date >= today) are recomputed ONLY when needed:
//   - ROLLOVER: a past day has an incomplete task -> discard all non-past
//     days and regenerate from today using real completion data (the
//     incomplete task naturally reappears first).
//   - EXTEND: no rollover needed, but running low on stored future days ->
//     append more after the last stored day, same as before.
//   - Otherwise: return as-is. No LLM calls, no writes — the fast path for
//     the common case of just checking in on an already-current roadmap.
// ---------------------------------------------------------------------------
async function getRoadmap(req, res) {
  try {
    const { userId } = req.params;
    if (!assertSelf(req, res, userId)) return;

    const roadmap = await Roadmap.findOne({ userId: req.user.userId });

    if (!roadmap) {
      return res.status(404).json({ success: false, error: { code: 'ROADMAP_NOT_FOUND', message: 'No roadmap found for this user.' } });
    }

    const today = todayString();
    const { past, nonPast } = splitPastAndFuture(roadmap.days, today);

    if (hasIncompletePastTask(past)) {
      // ROLLOVER: rebuild everything from today forward
      const role = await Role.findById(roadmap.targetRoleId);
      if (role) {
        const gapTopics = role.topics.filter(t => roadmap.gapTopicIds.includes(t.id));
        const { completedChunkMap, remainingMinutesMap } = buildProgressMaps(roadmap.days, gapTopics); // built from ALL days, including the about-to-be-discarded ones, so anything genuinely done stays done — and partial progress (item 4) carries forward too
        const lastPastDayNumber = past.length > 0 ? past[past.length - 1].dayNumber : 0;

        const { days } = generateNextWindow({
          gapTopics,
          completedChunkMap,
          remainingMinutesMap,
          hoursPerDay: roadmap.hoursPerDay,
          daysPerWeek: roadmap.daysPerWeek || 5,
          bufferInterval: roadmap.bufferInterval || 0,
          startDayNumber: lastPastDayNumber + 1,
          startDate: today,
          windowSize: WINDOW_SIZE,
        });

        const newDays = await buildRoadmapDays(days);
        roadmap.days = [...past, ...newDays];
        roadmap.totalDays = roadmap.days.length;
        await roadmap.save();
      }
    } else {
      // No rollover needed — just check if we're running low on upcoming days
      const upcomingCount = nonPast.length;
      if (upcomingCount < EXTEND_THRESHOLD) {
        const role = await Role.findById(roadmap.targetRoleId);
        if (role) {
          const gapTopics = role.topics.filter(t => roadmap.gapTopicIds.includes(t.id));
          const { completedChunkMap, remainingMinutesMap } = buildProgressMaps(roadmap.days, gapTopics);
          const lastDay = roadmap.days[roadmap.days.length - 1];
          const nextDate = new Date(lastDay.date);
          nextDate.setDate(nextDate.getDate() + 1);

          const { days } = generateNextWindow({
            gapTopics,
            completedChunkMap,
            remainingMinutesMap,
            hoursPerDay: roadmap.hoursPerDay,
            daysPerWeek: roadmap.daysPerWeek || 5,
            bufferInterval: roadmap.bufferInterval || 0,
            startDayNumber: lastDay.dayNumber + 1,
            startDate: nextDate.toISOString().split('T')[0],
            windowSize: WINDOW_SIZE,
          });

          const newDays = await buildRoadmapDays(days);
          roadmap.days.push(...newDays);
          roadmap.totalDays = roadmap.days.length;
          await roadmap.save();
        }
      }
      // else: fast path, nothing to do
    }

    res.status(200).json({ success: true, data: { roadmap } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/roadmap/task/:taskId
// ---------------------------------------------------------------------------
async function updateTaskStatus(req, res) {
  try {
    const { taskId } = req.params;
    const { status, dayNumber } = req.body;
    const userId = req.user.userId; // always the logged-in user
    if (!assertSelf(req, res, req.body.userId)) return;

    if (!status) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'status is required.' } });
    }
    // 'verified' is set only by the quiz system, never by the student.
    if (!USER_SETTABLE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: `status must be one of: ${USER_SETTABLE_STATUSES.join(', ')}.` },
      });
    }

    const roadmap = await Roadmap.findOne({ userId });
    if (!roadmap) {
      return res.status(404).json({ success: false, error: { code: 'ROADMAP_NOT_FOUND', message: 'No roadmap found for this user.' } });
    }

    // The same task id can appear on two days (a long lesson split over days),
    // so the client may name the day it means.
    let foundTask = null;
    for (const day of roadmap.days) {
      if (dayNumber !== undefined && day.dayNumber !== Number(dayNumber)) continue;
      const task = (day.tasks || []).find((t) => t.id === taskId);
      if (task) {
        foundTask = task;
        break;
      }
    }

    if (!foundTask) {
      return res.status(404).json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'No task found with that ID.' } });
    }
    if (foundTask.status === 'verified') {
      return res.status(409).json({
        success: false,
        error: { code: 'TASK_VERIFIED', message: 'This task is quiz-verified and can no longer be changed.' },
      });
    }

    foundTask.status = status;
    await roadmap.save();

    res.status(200).json({ success: true, data: { task: foundTask } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
}

module.exports = {
  estimateRoadmap,
  generateRoadmap,
  getRoadmap,
  updateTaskStatus,
  // exported for testing
  splitPastAndFuture,
  hasIncompletePastTask,
  buildTaskFromChunk,
  generateTaskWordingForDay,
};