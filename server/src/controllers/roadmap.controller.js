// server/src/controllers/roadmap.controller.js

const Role = require('../models/Role.model');
const Roadmap = require('../models/Roadmap.model');
const {
  generateNextWindow,
  estimateFoundationalDuration,
} = require('../utils/scheduler');

const WINDOW_SIZE = 14;        // how many days to generate per batch
const EXTEND_THRESHOLD = 5;    // auto-generate more once fewer than this many upcoming days remain

// ---------------------------------------------------------------------------
// Helper: turn a scheduler "chunk" into a RoadmapTask-shaped object.
// NOTE: taskName/description are placeholders using the chunk's raw outline
// point + practice prompt. Replace this mapping once the LLM task-wording
// step exists — that step should take chunk.point/practicePrompt and produce
// a properly worded taskName/description, everything else here stays the same.
// ---------------------------------------------------------------------------
function chunkToTask(chunk) {
  return {
    id: chunk.key, // "topicId::outlineIndex" — doubles as the unique key the scheduler expects back
    topicId: chunk.topicId,
    track: chunk.track,
    taskName: chunk.point,                 // TODO: replace with LLM-generated wording
    description: chunk.practicePrompt || '', // TODO: replace with LLM-generated wording
    estimatedMinutes: chunk.minutesAllotted,
    status: 'not_started',
  };
}

// ---------------------------------------------------------------------------
// Helper: derive the scheduler's completedChunkMap from a stored Roadmap doc.
// Map<"topicId::idx", dayNumberItWasCompletedOn>
// ---------------------------------------------------------------------------
function buildCompletedChunkMap(roadmap) {
  const map = new Map();
  roadmap.days.forEach(day => {
    if (day.phase !== 'foundational') return;
    (day.tasks || []).forEach(task => {
      if (task.status === 'completed' || task.status === 'verified') {
        map.set(task.id, day.dayNumber);
      }
    });
  });
  return map;
}

// ---------------------------------------------------------------------------
// Helper: how many upcoming (not-yet-completed, not-yet-passed) days does
// this roadmap currently have stored?
// ---------------------------------------------------------------------------
function countUpcomingDays(roadmap) {
  const today = new Date().toISOString().split('T')[0];
  return roadmap.days.filter(d => d.date >= today).length;
}

// ---------------------------------------------------------------------------
// POST /api/v1/roadmap/estimate
// Called during onboarding, BEFORE the roadmap is created — shows the
// student "at this pace, foundational content takes about N weeks."
// ---------------------------------------------------------------------------
async function estimateRoadmap(req, res) {
  try {
    const { targetRoleId, gapTopicIds, hoursPerDay, bufferInterval } = req.body;

    if (!targetRoleId || !Array.isArray(gapTopicIds) || !hoursPerDay) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'targetRoleId, gapTopicIds, and hoursPerDay are required.' },
      });
    }

    const role = await Role.findById(targetRoleId);
    if (!role) {
      return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No role found with that ID.' } });
    }

    const gapTopics = role.topics.filter(t => gapTopicIds.includes(t.id));
    const foundIds = new Set(gapTopics.map(t => t.id));
    const missingIds = gapTopicIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNKNOWN_TOPIC_IDS',
          message: `These topic IDs don't exist on role "${role.name}": ${missingIds.join(', ')}`,
        },
      });
    }
    const estimate = estimateFoundationalDuration({
      gapTopics,
      hoursPerDay,
      bufferInterval: bufferInterval || 0,
    });

    res.status(200).json({ success: true, data: { estimate } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/roadmap/generate
// Creates a new roadmap and generates the FIRST window of days.
// ---------------------------------------------------------------------------
async function generateRoadmap(req, res) {
  try {
    const { userId, targetRoleId, gapTopicIds, hoursPerDay, bufferInterval, daysPerWeek } = req.body;

    if (!userId || !targetRoleId || !Array.isArray(gapTopicIds) || !hoursPerDay) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'userId, targetRoleId, gapTopicIds, and hoursPerDay are required.' },
      });
    }

    const role = await Role.findById(targetRoleId);
    if (!role) {
      return res.status(404).json({ success: false, error: { code: 'ROLE_NOT_FOUND', message: 'No role found with that ID.' } });
    }

    const gapTopics = role.topics.filter(t => gapTopicIds.includes(t.id));
    const foundIds = new Set(gapTopics.map(t => t.id));
    const missingIds = gapTopicIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNKNOWN_TOPIC_IDS',
          message: `These topic IDs don't exist on role "${role.name}": ${missingIds.join(', ')}`,
        },
      });
    }
    const startDate = new Date().toISOString().split('T')[0];

    const { days, phase } = generateNextWindow({
      gapTopics,
      completedChunkMap: new Map(), // brand new roadmap — nothing completed yet
      hoursPerDay,
      bufferInterval: bufferInterval || 0,
      startDayNumber: 1,
      startDate,
      windowSize: WINDOW_SIZE,
    });

    const roadmapDays = days.map(d => ({
      dayNumber: d.dayNumber,
      date: d.date,
      phase: d.phase,
      isBufferDay: d.isBufferDay,
      tasks: d.phase === 'foundational' ? (d.chunks || []).map(chunkToTask) : [],
      practicePlan: d.phase === 'practice' ? d.chunkPlan : undefined,
    }));

    const roadmap = await Roadmap.create({
      userId,
      targetRoleId,
      startDate,
      daysPerWeek: daysPerWeek || 5,
      hoursPerDay,
      totalDays: roadmapDays.length, // will grow as the roadmap auto-extends
      days: roadmapDays,
    });

    res.status(201).json({ success: true, data: { roadmap, currentPhase: phase } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/roadmap/:userId
// Fetches the roadmap, auto-extending it with a new window if the student
// has caught up close to the end of what's currently stored.
// ---------------------------------------------------------------------------
async function getRoadmap(req, res) {
  try {
    const { userId } = req.params;
    const roadmap = await Roadmap.findOne({ userId });

    if (!roadmap) {
      return res.status(404).json({ success: false, error: { code: 'ROADMAP_NOT_FOUND', message: 'No roadmap found for this user.' } });
    }

    if (countUpcomingDays(roadmap) < EXTEND_THRESHOLD) {
      const role = await Role.findById(roadmap.targetRoleId);
      if (role) {
        const gapTopicIds = new Set(
          roadmap.days
            .filter(d => d.phase === 'foundational')
            .flatMap(d => (d.tasks || []).map(t => t.topicId))
        );
        const gapTopics = role.topics.filter(t => gapTopicIds.has(t.id));

        const completedChunkMap = buildCompletedChunkMap(roadmap);
        const lastDay = roadmap.days[roadmap.days.length - 1];
        const nextDate = new Date(lastDay.date);
        nextDate.setDate(nextDate.getDate() + 1);

        const { days } = generateNextWindow({
          gapTopics,
          completedChunkMap,
          hoursPerDay: roadmap.hoursPerDay,
          bufferInterval: roadmap.bufferInterval || 0,
          startDayNumber: lastDay.dayNumber + 1,
          startDate: nextDate.toISOString().split('T')[0],
          windowSize: WINDOW_SIZE,
        });

        const newRoadmapDays = days.map(d => ({
          dayNumber: d.dayNumber,
          date: d.date,
          phase: d.phase,
          isBufferDay: d.isBufferDay,
          tasks: d.phase === 'foundational' ? (d.chunks || []).map(chunkToTask) : [],
          practicePlan: d.phase === 'practice' ? d.chunkPlan : undefined,
        }));

        roadmap.days.push(...newRoadmapDays);
        roadmap.totalDays = roadmap.days.length;
        await roadmap.save();
      }
    }

    res.status(200).json({ success: true, data: { roadmap } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/roadmap/task/:taskId
// Marks a task's status. taskId is the composite "topicId::idx" key.
// ---------------------------------------------------------------------------
async function updateTaskStatus(req, res) {
  try {
    const { taskId } = req.params;
    const { userId, status } = req.body;

    if (!userId || !status) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'userId and status are required.' } });
    }

    const roadmap = await Roadmap.findOne({ userId });
    if (!roadmap) {
      return res.status(404).json({ success: false, error: { code: 'ROADMAP_NOT_FOUND', message: 'No roadmap found for this user.' } });
    }

    let foundTask = null;
    let topicId = null;
    for (const day of roadmap.days) {
      const task = (day.tasks || []).find(t => t.id === taskId);
      if (task) {
        task.status = status;
        foundTask = task;
        topicId = task.topicId;
        break;
      }
    }

    if (!foundTask) {
      return res.status(404).json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'No task found with that ID.' } });
    }

    await roadmap.save();

    // If this completed a "quiz-eligible" topic entirely, the frontend
    // should surface a "Take Quiz" option — checking full-topic completion
    // is Module B's (quiz system's) concern once that module exists; for
    // now we just report whether this specific task was marked done.
    res.status(200).json({ success: true, data: { task: foundTask } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
}

module.exports = {
  estimateRoadmap,
  generateRoadmap,
  getRoadmap,
  updateTaskStatus,
  // exported for testing
  chunkToTask,
  buildCompletedChunkMap,
  countUpcomingDays,
};