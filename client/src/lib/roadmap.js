/* ==================================================
   ROADMAP LOGIC (pure functions, no React)
   Mirrors the backend rules so the map and the server
   agree. Dates are 'YYYY-MM-DD' strings; they are
   compared as strings, never as Date objects.

   Known limitation: the server decides "today" in UTC,
   this UI uses the student's local calendar date. Late
   in the evening/early morning the two can differ by a day.
================================================== */

export const isDone = (status) => status === "completed" || status === "verified";

const pad = (n) => String(n).padStart(2, "0");

/** The student's local calendar date as YYYY-MM-DD. */
export const todayString = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const toUTC = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

export const formatDate = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opts) : "";

export const formatLongDate = (iso) =>
  formatDate(iso, { weekday: "long", day: "numeric", month: "long" });

/** "7h 30m", "45m" */
export function formatDuration(ms) {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export const totalMinutes = (tasks = []) =>
  tasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);

const chunkIndex = (taskId) => {
  const n = parseInt(String(taskId).split("::")[1], 10);
  return Number.isNaN(n) ? null : n;
};

/* ---------- days ---------- */

export function describeDay(day, today, topicMap) {
  const tasks = day.tasks || [];
  const done = tasks.filter((t) => isDone(t.status)).length;

  const kind = day.isBufferDay ? "rest" : day.phase === "practice" ? "practice" : "study";

  const names = [
    ...new Set(tasks.map((t) => topicMap.get(t.topicId)?.name || t.track || "Study")),
  ];

  let title = "Study session";
  if (kind === "rest") title = "Catch-up day";
  else if (kind === "practice") title = "Practice drills";
  else if (names.length) {
    title =
      names.length > 2
        ? `${names.slice(0, 2).join(" · ")} +${names.length - 2}`
        : names.join(" · ");
  }

  let state;
  if (kind === "study") {
    if (tasks.length > 0 && done === tasks.length) state = "done";
    else if (day.date < today) state = "missed";
    else if (done > 0) state = "partial";
    else state = "upcoming";
  } else {
    state = day.date < today ? "passed" : "upcoming";
  }

  return { kind, state, title, done, total: tasks.length };
}

/** 0-based calendar-week index of a day, counted from the roadmap's first day. */
export const weekIndexOf = (days, day) =>
  days.length ? Math.max(0, Math.floor(daysBetween(days[0].date, day.date) / 7)) : 0;

/** The week's own bounds, e.g. for "Week 2 · 10 Nov – 16 Nov". */
export function weekRange(days, weekIndex) {
  const inWeek = days.filter((d) => weekIndexOf(days, d) === weekIndex);
  return { first: inWeek[0]?.date, last: inWeek[inWeek.length - 1]?.date, days: inWeek };
}

/** First study day after today (for the "Rest day" card). */
export const nextStudyDay = (days, today) =>
  days.find((d) => d.date > today && !d.isBufferDay && (d.tasks || []).length > 0) || null;

/* ---------- topics + quiz gates ---------- */

/** Progress of one topic across all stored days (same rule as the backend). */
export function topicProgress(days, topic) {
  const total = (topic.outline || []).length;
  const scheduled = new Set();
  const doneIdx = new Set();
  let doneCount = 0;
  let taskCount = 0;
  let verifiedCount = 0;
  let lastDayIndex = -1;

  days.forEach((day, i) => {
    (day.tasks || []).forEach((task) => {
      const mine = task.topicId === topic.id || String(task.id).startsWith(`${topic.id}::`);
      if (!mine) return;
      const idx = chunkIndex(task.id);
      if (idx !== null) scheduled.add(idx);
      lastDayIndex = i;
      taskCount += 1;
      if (task.status === "verified") verifiedCount += 1;
      if (isDone(task.status)) {
        doneCount += 1;
        if (idx !== null) doneIdx.add(idx);
      }
    });
  });

  const doneLessons = Math.max(doneIdx.size, Math.min(doneCount, total));
  return {
    total,
    doneLessons,
    taskCount,
    fullyScheduled: total > 0 ? scheduled.size >= total : false,
    ready: total > 0 && (doneIdx.size >= total || doneCount >= total),
    verified: taskCount > 0 && verifiedCount === taskCount,
    lastDayIndex,
  };
}

/**
 * The ordered stops of the map: every day, plus a QUIZ stop right after the day
 * that finishes a topic.
 *   passedTopics  Set of topic ids that have a badge (or are verified)
 *   quizStatuses  { [topicId]: status from GET /quiz/status } (optional)
 */
export function buildStops(days, topicMap, passedTopics = new Set(), quizStatuses = {}) {
  const quizzesByDay = new Map();

  topicMap.forEach((topic) => {
    if (topic.quizEligible === false) return;
    const progress = topicProgress(days, topic);
    if (!progress.fullyScheduled || progress.lastDayIndex < 0) return;

    const status = quizStatuses[topic.id] || null;
    const passed = progress.verified || passedTopics.has(topic.id) || status?.passed === true;
    const state = passed ? "passed" : progress.ready ? "ready" : "locked";

    const list = quizzesByDay.get(progress.lastDayIndex) || [];
    list.push({ topic, progress, state, status });
    quizzesByDay.set(progress.lastDayIndex, list);
  });

  const stops = [];
  days.forEach((day, index) => {
    stops.push({ type: "day", day, dayIndex: index });
    (quizzesByDay.get(index) || []).forEach((q) =>
      stops.push({ type: "quiz", ...q, dayIndex: index })
    );
  });
  return stops;
}

/** Topics whose lessons are all done (candidates for a quiz-status lookup). */
export function readyTopicIds(days, topicMap) {
  const ids = [];
  topicMap.forEach((topic) => {
    if (topic.quizEligible === false) return;
    const p = topicProgress(days, topic);
    if (p.fullyScheduled && p.ready && !p.verified) ids.push(topic.id);
  });
  return ids;
}

/* ---------- summaries ---------- */

export function computeStreak(days, today) {
  const study = days.filter(
    (d) =>
      d.phase === "foundational" &&
      !d.isBufferDay &&
      (d.tasks || []).length > 0 &&
      d.date <= today
  );
  let streak = 0;
  for (let i = study.length - 1; i >= 0; i--) {
    if (study[i].tasks.every((t) => isDone(t.status))) streak++;
    else if (study[i].date === today) continue; // today isn't over yet
    else break;
  }
  return streak;
}

export const pearlsFor = (tasks) =>
  tasks
    .filter((t) => isDone(t.status))
    .reduce((s, t) => s + Math.max(1, Math.round((t.estimatedMinutes || 0) / 5)), 0);

export function overallProgress(days) {
  const tasks = days.filter((d) => !d.isBufferDay).flatMap((d) => d.tasks || []);
  const done = tasks.filter((t) => isDone(t.status)).length;
  return {
    total: tasks.length,
    done,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}

/** Which days of a roadmap's tasks (and topics) are verified, for the skills checklist fallback. */
export function verifiedTopicsFromRoadmap(roadmap, topicMap) {
  const ids = new Set();
  if (!roadmap) return ids;
  topicMap.forEach((topic) => {
    if (topicProgress(roadmap.days || [], topic).verified) ids.add(topic.id);
  });
  return ids;
}

/** Gap-screen helpers: subtopic count and total minutes of a topic. */
export const topicMinutes = (topic) =>
  (topic.outline || []).reduce((s, o) => s + (o.estimatedMinutes || 0), 0);

export const formatMinutes = (mins) => {
  if (!mins) return "0 min";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};
