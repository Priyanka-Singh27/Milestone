// server/src/utils/scheduler.js
//
// DESIGN NOTE (read this before modifying):
// This scheduler does NOT pre-generate an entire roadmap up front. It always
// computes "what's next" from the student's REAL completion state (which
// chunks are actually marked complete in the database). This means:
//   - Call generateNextWindow() to get the next N days whenever the student
//     opens their roadmap page (or on a schedule, e.g. nightly).
//   - If a chunk scheduled for a past day was never marked complete, it will
//     simply still be present in the queue next time you call this — no
//     special "rollover" logic needed. The timeline naturally shifts later.
//   - "Days already shown to the student" are just whatever a past call to
//     this function returned — they are not separately persisted as an
//     immutable plan; only actual TASK COMPLETION is the source of truth.

const MIN_MINUTES_PER_TRACK = 20; // a track needs at least this much daily time to be worth activating
const MAX_TRACK_CAP = 4;          // even with lots of time, cap variety at 4 parallel tracks

// ---------------------------------------------------------------------------
// Adaptive active-track count (replaces the old fixed cap of 3)
// ---------------------------------------------------------------------------
function computeActiveTrackCount(availableTrackCount, dailyMinutes) {
  const byTime = Math.floor(dailyMinutes / MIN_MINUTES_PER_TRACK);
  return Math.max(1, Math.min(availableTrackCount, byTime, MAX_TRACK_CAP));
}

// ---------------------------------------------------------------------------
// Order topics within a single track by prerequisite dependency
// (simple topological sort; assumes no circular dependencies)
// ---------------------------------------------------------------------------
function orderByPrerequisites(topics) {
  const ordered = [];
  const remaining = [...topics];
  const scheduledIds = new Set();
  const allIdsInSet = new Set(topics.map(t => t.id));

  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex(topic =>
      topic.prerequisiteTopicIds.every(
        id => scheduledIds.has(id) || !allIdsInSet.has(id)
      )
    );
    const index = nextIndex === -1 ? 0 : nextIndex;
    const topic = remaining.splice(index, 1)[0];
    scheduledIds.add(topic.id);
    ordered.push(topic);
  }

  return ordered;
}

// ---------------------------------------------------------------------------
// Build per-track queues of NOT-YET-COMPLETED subtopic chunks, given the
// real completion state. completedChunkMap: Map<"topicId::pointIndex", dayNumber>
// (dayNumber = which day it was actually completed on — needed for the
// strict one-day-gap prerequisite rule).
// ---------------------------------------------------------------------------
function buildTrackQueues(gapTopics, completedChunkMap) {
  const trackGroups = {};
  gapTopics.forEach(topic => {
    if (!trackGroups[topic.track]) trackGroups[topic.track] = [];
    trackGroups[topic.track].push(topic);
  });

  const trackQueues = {};
  Object.entries(trackGroups).forEach(([track, topics]) => {
    const ordered = orderByPrerequisites(topics);
    const queue = [];
    ordered.forEach(topic => {
      topic.outline.forEach((point, idx) => {
        const key = `${topic.id}::${idx}`;
        if (completedChunkMap.has(key)) return; // already done — leave it out
        queue.push({
          key,
          topicId: topic.id,
          topicName: topic.name,
          track: topic.track,
          point: point.point,
          type: point.type,
          practicePrompt: point.practicePrompt,
          minutes: point.estimatedMinutes,
        });
      });
    });
    trackQueues[track] = queue;
  });

  return trackQueues;
}

// ---------------------------------------------------------------------------
// A topic is "complete as of day D" if every one of its chunks has a
// completion day STRICTLY EARLIER than D (the strict one-day-gap rule).
// ---------------------------------------------------------------------------
function isTopicUnlockedAsOf(topicId, currentDayNumber, allTopicsById, completedChunkMap) {
  const topic = allTopicsById.get(topicId);
  if (!topic) return true;

  return topic.prerequisiteTopicIds.every(prereqId => {
    const prereqTopic = allTopicsById.get(prereqId);
    if (!prereqTopic) return true; // prerequisite outside this gap set — treat as already satisfied
    return prereqTopic.outline.every((_, idx) => {
      const key = `${prereqId}::${idx}`;
      const completedOnDay = completedChunkMap.get(key);
      return completedOnDay !== undefined && completedOnDay < currentDayNumber;
    });
  });
}

// ---------------------------------------------------------------------------
// Generate the next window of FOUNDATIONAL days, starting from a given day
// number/date, using only chunks not yet completed. Stops early if the
// foundational content runs out within the window.
// Returns { days, foundationalComplete } — foundationalComplete is true if
// every track's queue emptied out (caller should switch to practice mode).
// ---------------------------------------------------------------------------
function generateFoundationalWindow({
  gapTopics,
  completedChunkMap,
  hoursPerDay,
  bufferInterval, // number of study days between buffer days; 0/null disables
  startDayNumber,
  startDate,
  windowSize = 14,
}) {
  const allTopicsById = new Map(gapTopics.map(t => [t.id, t]));
  const trackQueues = buildTrackQueues(gapTopics, completedChunkMap);
  const trackNames = Object.keys(trackQueues);

  // A LOCAL working copy of completion state, used only for unlocking
  // prerequisites WITHIN this single generation call. As chunks get
  // scheduled (not necessarily actually completed by the student yet), we
  // provisionally mark them done here so later days in this same window can
  // correctly unlock dependent tracks. This never touches the real
  // completedChunkMap the caller passed in — the next real call still uses
  // true DB completion state, so rollover for genuinely-incomplete chunks
  // is unaffected.
  const workingCompletionMap = new Map(completedChunkMap);
  const dailyMinutes = hoursPerDay * 60;
  const activeCount = computeActiveTrackCount(trackNames.length, dailyMinutes);

  let activeTracks = trackNames.slice(0, activeCount);
  let queuedTracks = trackNames.slice(activeCount);

  const days = [];
  let dayNumber = startDayNumber;
  let currentDate = new Date(startDate);
  let studyDayCount = 0;

  const allQueuesEmpty = () =>
    [...activeTracks, ...queuedTracks].every(t => (trackQueues[t] || []).length === 0);

  for (let i = 0; i < windowSize && !allQueuesEmpty(); i++) {
    studyDayCount++;
    const isBufferDay = Boolean(bufferInterval) && studyDayCount % bufferInterval === 0;

    const dayChunks = [];

    if (!isBufferDay) {
      let minutesUsed = 0;

      for (const track of activeTracks) {
        const queue = trackQueues[track];
        if (!queue || queue.length === 0) continue;

        const nextChunk = queue[0];
        if (!isTopicUnlockedAsOf(nextChunk.topicId, dayNumber, allTopicsById, workingCompletionMap)) {
          continue; // gated on a prerequisite not yet completed on an earlier day
        }

        const minutesLeftToday = dailyMinutes - minutesUsed;
        if (minutesLeftToday <= 0) continue;

        if (nextChunk.minutes <= minutesLeftToday) {
          dayChunks.push({
            key: nextChunk.key,
            topicId: nextChunk.topicId,
            topicName: nextChunk.topicName,
            track: nextChunk.track,
            point: nextChunk.point,
            type: nextChunk.type,
            practicePrompt: nextChunk.practicePrompt,
            minutesAllotted: nextChunk.minutes,
            isPartial: false,
          });
          minutesUsed += nextChunk.minutes;
          queue.shift();
          workingCompletionMap.set(nextChunk.key, dayNumber); // provisional, this call only
        } else if (nextChunk.type === 'conceptual') {
          // conceptual chunks may split across days
          const portion = minutesLeftToday;
          dayChunks.push({
            key: nextChunk.key,
            topicId: nextChunk.topicId,
            topicName: nextChunk.topicName,
            track: nextChunk.track,
            point: nextChunk.point,
            type: nextChunk.type,
            practicePrompt: nextChunk.practicePrompt,
            minutesAllotted: portion,
            isPartial: true,
          });
          minutesUsed += portion;
          // NOTE: partial progress within a split chunk is NOT persisted
          // across incomplete days — if this chunk isn't marked complete
          // today, the next generation call will offer it again at its FULL
          // duration, not the remainder. Simplified for now; a future
          // version could track partial-completion minutes separately.
        }
        // practical chunks that don't fit are simply skipped this track today
      }

      activeTracks = activeTracks.map(track => {
        if ((trackQueues[track] || []).length === 0 && queuedTracks.length > 0) {
          return queuedTracks.shift();
        }
        return track;
      });
    }

    days.push({
      dayNumber,
      date: new Date(currentDate).toISOString().split('T')[0],
      phase: 'foundational',
      isBufferDay,
      chunks: dayChunks,
      totalMinutesUsed: dayChunks.reduce((sum, c) => sum + c.minutesAllotted, 0),
    });

    dayNumber++;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return { days, foundationalComplete: allQueuesEmpty() };
}

// ---------------------------------------------------------------------------
// Generate a window of PRACTICE-phase days (open-ended — no "completion").
// ---------------------------------------------------------------------------
function generatePracticeWindow({ startDayNumber, startDate, bufferInterval, windowSize = 14 }) {
  const days = [];
  let currentDate = new Date(startDate);

  for (let i = 0; i < windowSize; i++) {
    const dayNumber = startDayNumber + i;
    const studyDayIndex = i + 1;
    const isBufferDay = Boolean(bufferInterval) && studyDayIndex % bufferInterval === 0;

    days.push({
      dayNumber,
      date: new Date(currentDate).toISOString().split('T')[0],
      phase: 'practice',
      isBufferDay,
      chunkPlan: isBufferDay
        ? { type: 'revision' }
        : {
            dsaProblemCount: 2,
            aptitudeSetMinutes: 30,
            weeklyMockInterview: studyDayIndex % 7 === 0,
          },
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return days;
}

// ---------------------------------------------------------------------------
// Top-level entry point: figure out whether the student is still in the
// Foundational phase or should move into Practice, and generate the next
// window accordingly. Call this whenever you need "what's coming up" —
// e.g. when the student opens their roadmap page.
// ---------------------------------------------------------------------------
function generateNextWindow({
  gapTopics,
  completedChunkMap,   // Map<"topicId::pointIndex", dayNumberCompletedOn>
  hoursPerDay,
  bufferInterval,
  startDayNumber,
  startDate,
  windowSize = 14,
}) {
  const { days, foundationalComplete } = generateFoundationalWindow({
    gapTopics, completedChunkMap, hoursPerDay, bufferInterval, startDayNumber, startDate, windowSize,
  });

  if (!foundationalComplete || days.length === windowSize) {
    // still foundational content left, or the window filled up before we
    // could tell — return what we have; caller asks again next time
    return { days, phase: days.some(d => d.phase === 'foundational') ? 'foundational' : 'practice' };
  }

  // foundational content ran out partway through the window — fill the rest with practice days
  const remaining = windowSize - days.length;
  if (remaining > 0) {
    const lastDay = days[days.length - 1];
    const nextDate = lastDay ? new Date(lastDay.date) : new Date(startDate);
    if (lastDay) nextDate.setDate(nextDate.getDate() + 1);
    const practiceDays = generatePracticeWindow({
      startDayNumber: (lastDay ? lastDay.dayNumber : startDayNumber) + 1,
      startDate: nextDate.toISOString().split('T')[0],
      bufferInterval,
      windowSize: remaining,
    });
    return { days: [...days, ...practiceDays], phase: 'practice' };
  }

  return { days, phase: 'foundational' };
}

// ---------------------------------------------------------------------------
// Dry-run estimate for onboarding: "at this pace, foundational content will
// take about N days / M weeks" — does NOT persist anything, just simulates
// with an empty completion map until the content runs out.
// ---------------------------------------------------------------------------
function estimateFoundationalDuration({ gapTopics, hoursPerDay, bufferInterval }) {
  const { days } = generateFoundationalWindow({
    gapTopics,
    completedChunkMap: new Map(),
    hoursPerDay,
    bufferInterval,
    startDayNumber: 1,
    startDate: new Date().toISOString().split('T')[0],
    windowSize: 3000, // effectively "run to completion" for estimation purposes
  });
  const studyDays = days.filter(d => !d.isBufferDay).length;
  const bufferDays = days.filter(d => d.isBufferDay).length;
  return {
    totalDays: days.length,
    studyDays,
    bufferDays,
    approxWeeks: Math.ceil(days.length / 7),
  };
}

module.exports = {
  computeActiveTrackCount,
  orderByPrerequisites,
  buildTrackQueues,
  isTopicUnlockedAsOf,
  generateFoundationalWindow,
  generatePracticeWindow,
  generateNextWindow,
  estimateFoundationalDuration,
};