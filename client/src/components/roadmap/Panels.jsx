import React from "react";
import { Link } from "react-router-dom";
import {
  Anchor, ArrowRight, CalendarClock, Check, Clock, Coffee, Dumbbell, Lock, Medal,
  RefreshCw, ScrollText, Terminal, Trophy, X,
} from "lucide-react";
import { Mascot } from "../art/Mascots";
import { Frame, ProgressBar, ProgressRing, VerifiedBadge } from "../ui";
import TaskRow from "./TaskRow";
import { QUIZ_FALLBACK } from "../../config/constants";
import {
  formatDate, formatDuration, formatLongDate, isDone, nextStudyDay, pearlsFor, totalMinutes,
} from "../../lib/roadmap";

/* ---------- practice plan (days after the foundations) ---------- */

export function PracticePlanCard({ plan }) {
  if (!plan) return null;
  return (
    <div className="plan-card">
      {plan.type === "revision" ? (
        <p><strong>Revision day.</strong> Revisit anything that still feels shaky. No new topics today.</p>
      ) : (
        <>
          <p><strong>Practice day.</strong> Foundations done. Time to sharpen your skills.</p>
          <ul>
            {plan.dsaProblemCount ? <li><Terminal size={14} aria-hidden="true" /> {plan.dsaProblemCount} DSA problems</li> : null}
            {plan.aptitudeSetMinutes ? <li><Clock size={14} aria-hidden="true" /> {plan.aptitudeSetMinutes} minute aptitude set</li> : null}
            {plan.weeklyMockInterview ? <li><Medal size={14} aria-hidden="true" /> A mock interview this week</li> : null}
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------- TODAY ---------- */

export function TodayCard({ days, today, topicMap, trackFilter, busyKey, onSetStatus }) {
  const day = days.find((d) => d.date === today) || null;
  const upcoming = nextStudyDay(days, today);
  const tasks = (day?.tasks || []).filter((t) => trackFilter === "all" || t.track === trackFilter);
  const done = (day?.tasks || []).filter((t) => isDone(t.status)).length;
  const total = (day?.tasks || []).length;
  const keyOf = (t) => `${day.dayNumber}::${t.id}`;

  return (
    <Frame className="card today">
      <div className="card-head">
        <div>
          <span className="kicker">TODAY</span>
          <h2>{formatLongDate(today)}</h2>
        </div>
        {day && total > 0 && (
          <ProgressRing value={done} max={total} size={72} stroke={8} label={`${done} of ${total} tasks done today`}>
            <strong>{done}/{total}</strong>
          </ProgressRing>
        )}
      </div>

      {!day && (
        <div className="today-empty">
          <Mascot who="poppy" size={80} />
          <p>
            Nothing is scheduled for today.
            {upcoming && <> Your next study day is <strong>{formatLongDate(upcoming.date)}</strong>.</>}
          </p>
        </div>
      )}

      {day?.isBufferDay && (
        <div className="today-empty">
          <Mascot who="pearl" size={80} />
          <p>
            <strong>Catch-up day.</strong> No new tasks today, so use it to finish anything you missed.
            {upcoming && <> Next study day: <strong>{formatLongDate(upcoming.date)}</strong>.</>}
          </p>
        </div>
      )}

      {day && !day.isBufferDay && day.phase === "practice" && <PracticePlanCard plan={day.practicePlan} />}

      {day && !day.isBufferDay && total > 0 && (
        <>
          <p className="muted">About {Math.round(totalMinutes(day.tasks) / 6) / 10} hours of work today.</p>
          <div className="tasks">
            {tasks.map((t) => (
              <TaskRow key={keyOf(t)} day={day} task={t} topicName={topicMap.get(t.topicId)?.name}
                busy={busyKey === keyOf(t)} onSetStatus={onSetStatus} />
            ))}
            {tasks.length === 0 && <p className="muted">No tasks in this track today.</p>}
          </div>
        </>
      )}
    </Frame>
  );
}

/* ---------- a day, from the map or the list ---------- */

export function DayPanel({ day, info, today, topicMap, trackFilter, busyKey, onSetStatus, onClose }) {
  const tasks = (day.tasks || []).filter((t) => trackFilter === "all" || t.track === trackFilter);
  const earned = pearlsFor(day.tasks || []);
  const keyOf = (t) => `${day.dayNumber}::${t.id}`;

  return (
    <div className="vy-panel-body">
      <div className="vy-panel-head">
        <div>
          <span className="kicker">
            DAY {day.dayNumber} · {formatDate(day.date)}
            {day.date === today && " · TODAY"}
          </span>
          <h3>{info.title}</h3>
        </div>
        <button className="vy-close icon-btn" onClick={onClose} aria-label="Close day details"><X size={18} /></button>
      </div>

      {info.state === "missed" && (
        <div className="note"><Anchor size={15} aria-hidden="true" /> Unfinished tasks from this day were moved onto your upcoming days automatically.</div>
      )}
      {info.kind === "rest" && (
        <div className="note note-soft"><Coffee size={15} aria-hidden="true" /> A catch-up day. There are no new tasks, so use it to finish anything you missed.</div>
      )}
      {info.kind === "practice" && <PracticePlanCard plan={day.practicePlan} />}

      {(day.tasks || []).length > 0 && (
        <>
          <ProgressBar value={info.done} max={info.total} label={`${info.done} of ${info.total} cleared${earned ? ` · +${earned} pearls` : ""}`} showText />
          <div className="tasks">
            {tasks.map((t) => (
              <TaskRow key={keyOf(t)} day={day} task={t} topicName={topicMap.get(t.topicId)?.name}
                busy={busyKey === keyOf(t)} onSetStatus={onSetStatus} />
            ))}
            {tasks.length === 0 && <p className="muted">No tasks in this track on this day.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- a quiz gate ---------- */

/** Human text + state for a quiz stop, from its progress and (optional) server status. */
export function quizAvailability(stop) {
  const { state, status } = stop;
  if (state === "passed") return { kind: "passed", short: "PASSED", text: "You passed this gate and earned a verified badge." };
  if (state === "locked") {
    const left = Math.max(0, stop.progress.total - stop.progress.doneLessons);
    return { kind: "locked", short: "LOCKED", text: `Finish ${left} more lesson${left === 1 ? "" : "s"} of this topic to open the gate.` };
  }
  if (status?.blockedReason === "COOLDOWN_ACTIVE" && status.cooldownEndsAt) {
    const left = formatDuration(new Date(status.cooldownEndsAt).getTime() - Date.now());
    return { kind: "cooldown", short: `IN ${left.toUpperCase()}`, text: `You can try again in ${left}. Use the time to review the topic.` };
  }
  if (status?.blockedReason === "MAX_ATTEMPTS_REACHED") {
    return { kind: "exhausted", short: "NO ATTEMPTS", text: "You've used all your attempts for this quiz." };
  }
  if (status?.blockedReason === "ALREADY_PASSED") {
    return { kind: "passed", short: "PASSED", text: "You passed this gate and earned a verified badge." };
  }
  return { kind: "ready", short: "OPEN", text: "Every lesson is done. The gate is open. Ready to prove it?" };
}

export function QuizPanel({ stop, onClose }) {
  const { topic, progress, status } = stop;
  const a = quizAvailability(stop);
  const max = status?.maxAttempts ?? QUIZ_FALLBACK.maxAttempts;
  const pass = status?.passingScore ?? QUIZ_FALLBACK.passingScore;
  const cool = status?.cooldownHours ?? QUIZ_FALLBACK.cooldownHours;

  return (
    <div className="vy-panel-body">
      <div className="vy-panel-head">
        <div>
          <span className="kicker">TOPIC QUIZ GATE</span>
          <h3>{topic.name}</h3>
        </div>
        <button className="vy-close icon-btn" onClick={onClose} aria-label="Close quiz details"><X size={18} /></button>
      </div>

      <div className="quiz-hero">
        <Mascot who="hazel" size={92} />
        <p>{a.text}</p>
      </div>

      <ProgressBar value={progress.doneLessons} max={progress.total || 1} label={`${progress.doneLessons} of ${progress.total} lessons completed`} showText />

      <ul className="rules">
        <li><ScrollText size={14} aria-hidden="true" /> {QUIZ_FALLBACK.questionRange} multiple-choice questions</li>
        <li><Check size={14} aria-hidden="true" /> {pass}% or more to pass</li>
        <li><RefreshCw size={14} aria-hidden="true" /> Up to {max} attempts, with a {cool}-hour wait between them</li>
        {status && status.attemptsUsed > 0 && a.kind !== "passed" && (
          <li><CalendarClock size={14} aria-hidden="true" /> Attempts used: {status.attemptsUsed} of {max}</li>
        )}
      </ul>

      {a.kind === "passed" && <VerifiedBadge />}

      {a.kind === "ready" && (
        <Link to={`/quiz/${encodeURIComponent(topic.id)}`} className="btn btn-gold btn-block">
          Take the quiz <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
      {["locked", "cooldown", "exhausted"].includes(a.kind) && (
        <button className="btn btn-cream btn-block" disabled><Lock size={15} aria-hidden="true" /> {a.kind === "cooldown" ? a.short.toLowerCase().replace("in ", "Available in ") : a.kind === "exhausted" ? "No attempts left" : "Locked"}</button>
      )}
      {a.kind === "passed" && (
        <Link to="/vault" className="btn btn-cream btn-block"><Medal size={16} aria-hidden="true" /> See your badge</Link>
      )}
    </div>
  );
}

export function NodeIcon({ info }) {
  if (info.state === "done") return <Check size={24} strokeWidth={2.6} aria-hidden="true" />;
  if (info.kind === "rest") return <Coffee size={22} aria-hidden="true" />;
  if (info.kind === "practice") return <Dumbbell size={22} aria-hidden="true" />;
  if (info.state === "missed") return <Anchor size={22} aria-hidden="true" />;
  return <Terminal size={22} aria-hidden="true" />;
}

export function QuizIcon({ kind }) {
  if (kind === "passed") return <Trophy size={25} aria-hidden="true" />;
  if (kind === "ready") return <ScrollText size={25} aria-hidden="true" />;
  return <Lock size={22} aria-hidden="true" />;
}
