// server/src/utils/scheduler.js
//
// DESIGN NOTE: This scheduler does NOT pre-generate an entire roadmap up
// front. It always computes "what's next" from the student's REAL completion
// state. Call generateNextWindow() whenever you need the next N days.

const MIN_MINUTES_PER_TRACK = 20;
const MAX_TRACK_CAP = 4;

function computeActiveTrackCount(availableTrackCount, dailyMinutes) {
  const byTime = Math.floor(dailyMinutes / MIN_MINUTES_PER_TRACK);
  return Math.max(1, Math.min(availableTrackCount, byTime, MAX_TRACK_CAP));
}

function orderByPrerequisites(topics) {
  const ordered = [];
  const remaining = [...topics];
  const scheduledIds = new Set();
  const allIdsInSet = new Set(topics.map(t => t.id));

  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex(topic =>
      topic.prerequisiteTopicIds.every(id => scheduledIds.has(id) || !allIdsInSet.has(id))
    );
    const index = nextIndex === -1 ? 0 : nextIndex;
    const topic = remaining.splice(index, 1)[0];
    scheduledIds.add(topic.id);
    ordered.push(topic);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// ITEM 3 — Respect daysPerWeek: figure out which real weekdays count as
// "study days," evenly distributed across a 7-day week, anchored Mon->Sun.
// ---------------------------------------------------------------------------
function computeStudyDaysOfWeek(daysPerWeek) {
  if (!daysPerWeek || daysPerWeek >= 7) return new Set([0, 1, 2, 3, 4, 5, 6]);
  const orderStartingMonday = [1, 2, 3, 4, 5, 6, 0]; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  return new Set(orderStartingMonday.slice(0, daysPerWeek));
}

function isStudyDay(date, studyDaysOfWeek) {
  return studyDaysOfWeek.has(date.getDay());
}

function advanceToNextStudyDay(date, studyDaysOfWeek) {
  const d = new Date(date);
  while (!isStudyDay(d, studyDaysOfWeek)) d.setDate(d.getDate() + 1);
  return d;
}

function advanceToFollowingStudyDay(date, studyDaysOfWeek) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return advanceToNextStudyDay(d, studyDaysOfWeek);
}

// ---------------------------------------------------------------------------
// ITEM 4 — Partial-progress persistence. Compute per-chunk REMAINING minutes
// from real stored task history: sum minutes from every task sharing this
// chunk's key that was ever marked completed/verified, across ALL days, and
// subtract from the outline point's original estimate. A chunk only counts
// as "fully complete" once cumulative completed minutes reach the total.
// ---------------------------------------------------------------------------
function buildProgressMaps(allStoredDays, gapTopics) {
  const doneMinutesByKey = new Map();
  const lastCompletionDayByKey = new Map();

  allStoredDays.forEach(day => {
    (day.tasks || []).forEach(t => {
      if (t.status === 'completed' || t.status === 'verified') {
        doneMinutesByKey.set(t.id, (doneMinutesByKey.get(t.id) || 0) + (t.estimatedMinutes || 0));
        const prevMax = lastCompletionDayByKey.get(t.id) || 0;
        if (day.dayNumber > prevMax) lastCompletionDayByKey.set(t.id, day.dayNumber);
      }
    });
  });

  const completedChunkMap = new Map();
  const remainingMinutesMap = new Map();

  gapTopics.forEach(topic => {
    topic.outline.forEach((point, idx) => {
      const key = `${topic.id}::${idx}`;
      const done = doneMinutesByKey.get(key) || 0;
      if (done >= point.estimatedMinutes && done > 0) {
        completedChunkMap.set(key, lastCompletionDayByKey.get(key));
      } else if (done > 0) {
        remainingMinutesMap.set(key, point.estimatedMinutes - done);
      }
    });
  });

  return { completedChunkMap, remainingMinutesMap };
}

function buildTrackQueues(gapTopics, completedChunkMap, remainingMinutesMap = new Map()) {
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
        if (completedChunkMap.has(key)) return;
        queue.push({
          key,
          topicId: topic.id,
          topicName: topic.name,
          track: topic.track,
          point: point.point,
          type: point.type,
          practicePrompt: point.practicePrompt,
          minutes: remainingMinutesMap.has(key) ? remainingMinutesMap.get(key) : point.estimatedMinutes,
        });
      });
    });
    trackQueues[track] = queue;
  });

  return trackQueues;
}

function isTopicUnlockedAsOf(topicId, currentDayNumber, allTopicsById, completedChunkMap) {
  const topic = allTopicsById.get(topicId);
  if (!topic) return true;
  return topic.prerequisiteTopicIds.every(prereqId => {
    const prereqTopic = allTopicsById.get(prereqId);
    if (!prereqTopic) return true;
    return prereqTopic.outline.every((_, idx) => {
      const key = `${prereqId}::${idx}`;
      const completedOnDay = completedChunkMap.get(key);
      return completedOnDay !== undefined && completedOnDay < currentDayNumber;
    });
  });
}

// ---------------------------------------------------------------------------
// ITEM 5 — Smarter cross-track gating: scan ahead in the SAME track's queue
// for the first chunk whose topic is unlocked, instead of giving up on the
// whole track for the day when only its very next topic is blocked.
// ---------------------------------------------------------------------------
function findNextUnlockedChunkIndex(queue, dayNumber, allTopicsById, completedChunkMap) {
  return queue.findIndex(chunk => isTopicUnlockedAsOf(chunk.topicId, dayNumber, allTopicsById, completedChunkMap));
}

function generateFoundationalWindow({
  gapTopics,
  completedChunkMap,
  remainingMinutesMap = new Map(),
  hoursPerDay,
  daysPerWeek,
  bufferInterval,
  startDayNumber,
  startDate,
  windowSize = 14,
}) {
  const allTopicsById = new Map(gapTopics.map(t => [t.id, t]));
  const trackQueues = buildTrackQueues(gapTopics, completedChunkMap, remainingMinutesMap);
  const trackNames = Object.keys(trackQueues);
  const dailyMinutes = hoursPerDay * 60;
  const activeCount = computeActiveTrackCount(trackNames.length, dailyMinutes);
  const studyDaysOfWeek = computeStudyDaysOfWeek(daysPerWeek);

  let activeTracks = trackNames.slice(0, activeCount);
  let queuedTracks = trackNames.slice(activeCount);

  const workingCompletionMap = new Map(completedChunkMap);

  const days = [];
  let dayNumber = startDayNumber;
  let currentDate = advanceToNextStudyDay(new Date(startDate), studyDaysOfWeek);
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

        const chunkIndex = findNextUnlockedChunkIndex(queue, dayNumber, allTopicsById, workingCompletionMap);
        if (chunkIndex === -1) continue;

        const nextChunk = queue[chunkIndex];
        const minutesLeftToday = dailyMinutes - minutesUsed;
        if (minutesLeftToday <= 0) continue;

        if (nextChunk.minutes <= minutesLeftToday) {
          dayChunks.push({
            key: nextChunk.key, topicId: nextChunk.topicId, topicName: nextChunk.topicName,
            track: nextChunk.track, point: nextChunk.point, type: nextChunk.type,
            practicePrompt: nextChunk.practicePrompt, minutesAllotted: nextChunk.minutes, isPartial: false,
          });
          minutesUsed += nextChunk.minutes;
          queue.splice(chunkIndex, 1);
          workingCompletionMap.set(nextChunk.key, dayNumber);
        } else if (nextChunk.type === 'conceptual') {
          const portion = minutesLeftToday;
          dayChunks.push({
            key: nextChunk.key, topicId: nextChunk.topicId, topicName: nextChunk.topicName,
            track: nextChunk.track, point: nextChunk.point, type: nextChunk.type,
            practicePrompt: nextChunk.practicePrompt, minutesAllotted: portion, isPartial: true,
          });
          minutesUsed += portion;
        }
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
      date: currentDate.toISOString().split('T')[0],
      phase: 'foundational',
      isBufferDay,
      chunks: dayChunks,
      totalMinutesUsed: dayChunks.reduce((sum, c) => sum + c.minutesAllotted, 0),
    });

    dayNumber++;
    currentDate = advanceToFollowingStudyDay(currentDate, studyDaysOfWeek);
  }

  return { days, foundationalComplete: allQueuesEmpty() };
}

function generatePracticeWindow({ startDayNumber, startDate, daysPerWeek, bufferInterval, windowSize = 14 }) {
  const studyDaysOfWeek = computeStudyDaysOfWeek(daysPerWeek);
  const days = [];
  let currentDate = advanceToNextStudyDay(new Date(startDate), studyDaysOfWeek);

  for (let i = 0; i < windowSize; i++) {
    const dayNumber = startDayNumber + i;
    const studyDayIndex = i + 1;
    const isBufferDay = Boolean(bufferInterval) && studyDayIndex % bufferInterval === 0;

    days.push({
      dayNumber,
      date: currentDate.toISOString().split('T')[0],
      phase: 'practice',
      isBufferDay,
      chunkPlan: isBufferDay
        ? { type: 'revision' }
        : { dsaProblemCount: 2, aptitudeSetMinutes: 30, weeklyMockInterview: studyDayIndex % 7 === 0 },
    });

    currentDate = advanceToFollowingStudyDay(currentDate, studyDaysOfWeek);
  }

  return days;
}

function generateNextWindow({
  gapTopics,
  completedChunkMap,
  remainingMinutesMap = new Map(),
  hoursPerDay,
  daysPerWeek,
  bufferInterval,
  startDayNumber,
  startDate,
  windowSize = 14,
}) {
  const { days, foundationalComplete } = generateFoundationalWindow({
    gapTopics, completedChunkMap, remainingMinutesMap, hoursPerDay, daysPerWeek, bufferInterval, startDayNumber, startDate, windowSize,
  });

  if (!foundationalComplete || days.length === windowSize) {
    return { days, phase: days.some(d => d.phase === 'foundational') ? 'foundational' : 'practice' };
  }

  const remaining = windowSize - days.length;
  if (remaining > 0) {
    const lastDay = days[days.length - 1];
    const nextDate = lastDay ? new Date(lastDay.date) : new Date(startDate);
    if (lastDay) nextDate.setDate(nextDate.getDate() + 1);
    const practiceDays = generatePracticeWindow({
      startDayNumber: (lastDay ? lastDay.dayNumber : startDayNumber) + 1,
      startDate: nextDate.toISOString().split('T')[0],
      daysPerWeek,
      bufferInterval,
      windowSize: remaining,
    });
    return { days: [...days, ...practiceDays], phase: 'practice' };
  }

  return { days, phase: 'foundational' };
}

function estimateFoundationalDuration({ gapTopics, hoursPerDay, daysPerWeek, bufferInterval }) {
  const { days } = generateFoundationalWindow({
    gapTopics,
    completedChunkMap: new Map(),
    hoursPerDay,
    daysPerWeek,
    bufferInterval,
    startDayNumber: 1,
    startDate: new Date().toISOString().split('T')[0],
    windowSize: 3000,
  });
  const studyDays = days.filter(d => !d.isBufferDay).length;
  const bufferDays = days.filter(d => d.isBufferDay).length;
  const calendarSpanDays = days.length > 0
    ? Math.ceil((new Date(days[days.length - 1].date) - new Date(days[0].date)) / 86400000) + 1
    : 0;
  return {
    totalStudyEntries: days.length,
    studyDays,
    bufferDays,
    calendarSpanDays,
    approxWeeks: Math.ceil(calendarSpanDays / 7),
  };
}

module.exports = {
  computeActiveTrackCount,
  computeStudyDaysOfWeek,
  orderByPrerequisites,
  buildTrackQueues,
  buildProgressMaps,
  isTopicUnlockedAsOf,
  findNextUnlockedChunkIndex,
  generateFoundationalWindow,
  generatePracticeWindow,
  generateNextWindow,
  estimateFoundationalDuration,
};