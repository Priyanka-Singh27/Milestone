import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ArrowRight, Flame, Gem, List, Map as MapIcon, RefreshCw, ScrollText, Trophy, X } from "lucide-react";
import { certificatesApi, roadmapApi } from "../api";
import { useAuth } from "../context/AuthContext";
import { useRoadmap } from "../context/RoadmapContext";
import { useRoles } from "../context/RolesContext";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { useQuizStatuses } from "../hooks/useQuizStatuses";
import { friendlyError } from "../config/errors";
import { Mascot } from "../components/art/Mascots";
import { CardSkeleton, ConfirmDialog, EmptyState, ErrorBanner, Frame, Notice, PageHead, ProgressRing, Skeleton, TrackBadge } from "../components/ui";
import VoyageMap from "../components/roadmap/VoyageMap";
import ListView from "../components/roadmap/ListView";
import { DayPanel, QuizPanel, TodayCard } from "../components/roadmap/Panels";
import {
  buildStops, computeStreak, describeDay, formatDate, overallProgress, pearlsFor, readyTopicIds,
  todayString, topicProgress,
} from "../lib/roadmap";

const VIEW_KEY = "milestone_roadmap_view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || "map"; } catch { return "map"; } };

export default function Roadmap() {
  const { userId } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const rm = useRoadmap();
  const { getRole, status: rolesStatus } = useRoles();

  const [view, setView] = useState(readView);
  const [trackFilter, setTrackFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [busyKey, setBusyKey] = useState("");
  const [future, setFuture] = useState(null); // task awaiting "mark a future task?" confirmation
  const [readyBanner, setReadyBanner] = useState(null);
  const [created, setCreated] = useState(Boolean(location.state?.justCreated));
  const [passedMsg, setPassedMsg] = useState(location.state?.justPassed || null);

  // Always fetch on opening the page: the server may roll the plan forward or extend it.
  useEffect(() => { rm.load({ force: true }); /* eslint-disable-next-line */ }, [userId]);

  const roadmap = rm.roadmap;
  const days = useMemo(() => roadmap?.days || [], [roadmap]);
  const role = getRole(roadmap?.targetRoleId);
  const topicMap = useMemo(() => new Map((role?.topics || []).map((t) => [t.id, t])), [role]);
  const today = todayString();

  // Badges tell us which gates are already passed.
  const { data: badgeData } = useApi(() => certificatesApi.list({ type: "badge" }).catch(() => null), [userId]);
  const passedSet = useMemo(() => {
    const s = new Set();
    (badgeData?.certificates || []).forEach((c) => (c.tags || []).forEach((t) => s.add(t)));
    return s;
  }, [badgeData]);

  // Quiz status (attempts / cooldown) for topics whose lessons are all done.
  const readyIds = useMemo(() => readyTopicIds(days, topicMap).filter((id) => !passedSet.has(id)), [days, topicMap, passedSet]);
  const { statuses } = useQuizStatuses(readyIds);
  const stops = useMemo(() => buildStops(days, topicMap, passedSet, statuses), [days, topicMap, passedSet, statuses]);

  const progress = overallProgress(days);
  const streak = computeStreak(days, today);
  const pearls = pearlsFor(days.flatMap((d) => d.tasks || []));
  const currentDay = days.find((d) => d.date >= today) || days[days.length - 1];
  const tracks = useMemo(() => [...new Set(days.flatMap((d) => (d.tasks || []).map((t) => t.track)))], [days]);

  /* ---------- changing a task ---------- */
  async function applyStatus(day, task, status) {
    const key = `${day.dayNumber}::${task.id}`;
    const topic = topicMap.get(task.topicId);
    const patchDays = (list, s) =>
      list.map((d) => d.dayNumber !== day.dayNumber ? d : { ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, status: s } : t)) });

    const previous = task.status;
    const beforeReady = topic ? topicProgress(days, topic).ready : false;

    setBusyKey(key);
    rm.setRoadmap((r) => ({ ...r, days: patchDays(r.days, status) })); // optimistic
    try {
      await roadmapApi.updateTask(task.id, { userId, status, dayNumber: day.dayNumber });
      if (topic && topic.quizEligible !== false && !beforeReady && topicProgress(patchDays(days, status), topic).ready) {
        setReadyBanner(topic);
      }
    } catch (err) {
      rm.setRoadmap((r) => ({ ...r, days: patchDays(r.days, previous) })); // roll back
      toast.error(friendlyError(err));
      if (err.code === "TASK_NOT_FOUND") rm.load({ force: true });
    } finally {
      setBusyKey("");
    }
  }

  // Ticking something that is scheduled for later asks first (it may be a mis-tap).
  function setStatus(day, task, status) {
    if (status === "completed" && day.date > today) setFuture({ day, task, status });
    else applyStatus(day, task, status);
  }

  const switchView = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  };

  /* ---------- states before the roadmap ---------- */
  if (rm.status === "none") return <Navigate to="/onboarding/role" replace />;

  if (!roadmap) {
    if (rm.status === "error") {
      return <ErrorBanner message={friendlyError(rm.error)} onRetry={() => rm.load({ force: true })} />;
    }
    return (
      <>
        <Skeleton h={42} w="55%" />
        <div className="two-col"><CardSkeleton lines={4} /><CardSkeleton lines={4} /></div>
        <CardSkeleton lines={6} />
      </>
    );
  }

  if (days.length === 0) {
    return <EmptyState who="captain" title="Your roadmap is empty" text="Something went wrong while it was created. Let's chart it again." to="/onboarding/role" actionLabel="Plan my roadmap" />;
  }

  /* ---------- the selected stop (map view) ---------- */
  const selStop = stops.find((s) => (s.type === "day" ? `day-${s.day.dayNumber}` : `quiz-${s.topic.id}`) === selected) || null;

  return (
    <>
      <PageHead
        kicker={`YOUR ROADMAP${role ? ` · ${role.name}` : ""}`}
        title="Chart the course,"
        em="sail it."
        text={currentDay?.phase === "practice" ? "Foundations done. You're in the practice phase now." : "One day at a time. Your plan adjusts if you fall behind."}
        who="captain"
      >
        <div className="chips">
          <span className="chip"><Trophy size={15} aria-hidden="true" /> {progress.percent}% done</span>
          <span className="chip"><Flame size={15} aria-hidden="true" /> {streak} day streak</span>
          <span className="chip"><Gem size={15} aria-hidden="true" /> {pearls} pearls</span>
          <button className="chip chip-btn" onClick={() => rm.load({ force: true })} disabled={rm.status === "loading"}>
            <RefreshCw size={14} className={rm.status === "loading" ? "spin" : ""} aria-hidden="true" /> {rm.status === "loading" ? "Updating…" : "Refresh"}
          </button>
        </div>
      </PageHead>

      {rm.error && <ErrorBanner message={friendlyError(rm.error)} onRetry={() => rm.load({ force: true })} />}
      {created && (
        <Notice tone="success" action={<button className="icon-btn" aria-label="Dismiss" onClick={() => setCreated(false)}><X size={16} /></button>}>
          Your roadmap is ready. Here's where your voyage begins.
        </Notice>
      )}
      {passedMsg && (
        <Notice tone="success" action={<Link className="btn btn-sm btn-cream" to="/vault">See my badge</Link>}>
          You passed the {passedMsg} quiz and earned a verified badge! 🎉
        </Notice>
      )}
      {rm.planNotice && (
        <Notice tone="info" action={<button className="icon-btn" aria-label="Dismiss" onClick={rm.dismissPlanNotice}><X size={16} /></button>}>
          Your plan was updated: tasks you didn't finish were moved onto upcoming days.
        </Notice>
      )}
      {readyBanner && (
        <Notice
          tone="success"
          action={
            <span className="row-gap">
              <Link className="btn btn-sm btn-gold" to={`/quiz/${encodeURIComponent(readyBanner.id)}`}>Take the quiz <ArrowRight size={14} aria-hidden="true" /></Link>
              <button className="icon-btn" aria-label="Dismiss" onClick={() => setReadyBanner(null)}><X size={16} /></button>
            </span>
          }
        >
          <ScrollText size={14} aria-hidden="true" /> You finished every lesson of <strong>{readyBanner.name}</strong>. Its quiz gate is open!
        </Notice>
      )}

      <div className="two-col two-col-even">
        <TodayCard days={days} today={today} topicMap={topicMap} trackFilter={trackFilter} busyKey={busyKey} onSetStatus={setStatus} />
        <Frame className="card overall">
          <span className="kicker">OVERALL PROGRESS</span>
          <div className="overall-body">
            <ProgressRing value={progress.done} max={progress.total || 1} size={120} stroke={12} label={`${progress.percent} percent of tasks done`}>
              <strong>{progress.percent}%</strong>
            </ProgressRing>
            <div>
              <h2>{progress.done} of {progress.total} tasks done</h2>
              <p className="muted">
                {currentDay?.phase === "practice" ? "Practice phase" : "Foundations phase"} · Day {currentDay?.dayNumber} of {days.length} planned
              </p>
              <p className="hint">Quiz-verified tasks count as done. The plan grows as you go.</p>
            </div>
          </div>
        </Frame>
      </div>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Roadmap view">
          <button className={view === "map" ? "on" : ""} onClick={() => switchView("map")} aria-pressed={view === "map"}><MapIcon size={15} aria-hidden="true" /> Map</button>
          <button className={view === "list" ? "on" : ""} onClick={() => switchView("list")} aria-pressed={view === "list"}><List size={15} aria-hidden="true" /> List</button>
        </div>
        {tracks.length > 1 && (
          <div className="chips" role="group" aria-label="Filter tasks by track">
            <button className={`chip-filter ${trackFilter === "all" ? "on" : ""}`} onClick={() => setTrackFilter("all")} aria-pressed={trackFilter === "all"}>All tracks</button>
            {tracks.map((t) => (
              <button key={t} className={`chip-filter ${trackFilter === t ? "on" : ""}`} onClick={() => setTrackFilter(t)} aria-pressed={trackFilter === t}>
                <TrackBadge track={t} />
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "list" ? (
        <ListView days={days} today={today} topicMap={topicMap} trackFilter={trackFilter} busyKey={busyKey} onSetStatus={setStatus} />
      ) : (
        <div className="vy-layout">
          <VoyageMap days={days} stops={stops} topicMap={topicMap} today={today} role={role} selectedKey={selected} onSelect={setSelected} />

          <aside className={`vy-panel ${selStop ? "vy-panel-open" : ""}`} aria-label="Selected stop">
            {!selStop && (
              <div className="vy-panel-empty">
                <Mascot who="captain" size={100} />
                <h3>Pick a stop</h3>
                <p>Select a day to see its tasks, or a quiz gate to test a finished topic.</p>
                <ul className="legend">
                  <li><i className="dot dot-done" /> Done</li>
                  <li><i className="dot dot-now" /> In progress / today</li>
                  <li><i className="dot dot-ahead" /> Ahead</li>
                  <li><i className="dot dot-missed" /> Missed (moved forward)</li>
                  <li><i className="dot dot-quiz" /> Quiz gate</li>
                </ul>
              </div>
            )}
            {selStop?.type === "day" && (
              <DayPanel day={selStop.day} info={describeDay(selStop.day, today, topicMap)} today={today} topicMap={topicMap}
                trackFilter={trackFilter} busyKey={busyKey} onSetStatus={setStatus} onClose={() => setSelected(null)} />
            )}
            {selStop?.type === "quiz" && <QuizPanel stop={selStop} onClose={() => setSelected(null)} />}
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={!!future}
        title="Mark a future task as done?"
        confirmLabel="Yes, mark it done"
        onCancel={() => setFuture(null)}
        onConfirm={() => { const f = future; setFuture(null); applyStatus(f.day, f.task, f.status); }}
      >
        <p>
          <strong>{future?.task.taskName}</strong> is scheduled for {future && formatDate(future.day.date)}.
          Mark it done now anyway?
        </p>
      </ConfirmDialog>
    </>
  );
}
