import React from "react";
import { Check, Clock, Lock, Play, RefreshCw } from "lucide-react";
import { isDone } from "../../lib/roadmap";
import { TrackBadge, VerifiedBadge } from "../ui";

/**
 * One task. The checkbox marks it done/not done; "Start" toggles in-progress.
 * Verified tasks are locked: only the quiz system sets that status.
 */
export default function TaskRow({ day, task, topicName, busy, onSetStatus, compact = false }) {
  const done = isDone(task.status);
  const verified = task.status === "verified";
  const inProgress = task.status === "in_progress";

  return (
    <div className={`task ${done ? "task-done" : ""} ${verified ? "task-verified" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${task.taskName}: ${done ? "done" : "not done"}`}
        className="task-check"
        disabled={busy || verified}
        onClick={() => onSetStatus(day, task, done ? "not_started" : "completed")}
      >
        {busy ? <RefreshCw size={13} className="spin" aria-hidden="true" /> : done ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
      </button>

      <div className="task-body">
        <strong>{task.taskName}</strong>
        {!compact && task.description && <p>{task.description}</p>}
        <div className="task-meta">
          <TrackBadge track={task.track} />
          {topicName && <span className="pill pill-plain">{topicName}</span>}
          <span className="meta-item"><Clock size={12} aria-hidden="true" /> {task.estimatedMinutes || 25} min</span>
          {task.isPartial && <span className="pill pill-plain">Part of a longer lesson</span>}
          {inProgress && <span className="pill pill-warn">In progress</span>}
          {verified && <VerifiedBadge compact />}
        </div>
      </div>

      {verified ? (
        <span className="locked-note" title="Verified by quiz: this can't be changed"><Lock size={13} aria-hidden="true" /></span>
      ) : (
        !done && (
          <button
            type="button"
            className="btn btn-sm btn-cream task-start"
            disabled={busy}
            onClick={() => onSetStatus(day, task, inProgress ? "not_started" : "in_progress")}
          >
            <Play size={12} aria-hidden="true" /> {inProgress ? "Pause" : "Start"}
          </button>
        )
      )}
    </div>
  );
}
