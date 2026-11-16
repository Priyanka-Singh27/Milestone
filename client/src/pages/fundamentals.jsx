import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Lock, ScrollText } from "lucide-react";
import { fundamentalsApi } from "../api";
import { useApi } from "../hooks/useApi";
import { useQuizStatuses } from "../hooks/useQuizStatuses";
import { useToast } from "../context/ToastContext";
import { friendlyError } from "../config/errors";
import { TASK_STATUS } from "../config/constants";
import { CardSkeleton, ErrorBanner, Frame, PageHead, VerifiedBadge } from "../components/ui";
import { quizAvailability } from "../components/roadmap/Panels";

const SETTABLE = ["not_started", "in_progress", "completed"];
const isDoneStatus = (s) => s === "completed" || s === "verified";

export default function Fundamentals() {
  const toast = useToast();
  const { data, error, loading, retry, setData } = useApi(() => fundamentalsApi.get(), []);
  const areas = data?.areas || [];

  // Quiz status for every completed (not yet verified) topic.
  const doneIds = useMemo(
    () => areas.flatMap((a) => a.topics.filter((t, i) => a.progress?.[i]?.status === "completed" && t.quizEligible !== false).map((t) => t.id)),
    [areas]
  );
  const { statuses, refresh } = useQuizStatuses(doneIds);

  // Completing a topic opens its quiz: fetch the status then.
  useEffect(() => { doneIds.forEach((id) => { if (!statuses[id]) refresh(id); }); /* eslint-disable-next-line */ }, [doneIds.join("|")]);

  async function setStatus(ai, ti, topic, status) {
    const prev = data;
    setData((d) => ({
      ...d,
      areas: d.areas.map((a, i) => i !== ai ? a : { ...a, progress: a.progress.map((p, k) => (k === ti ? { ...p, status } : p)) }),
    }));
    try {
      await fundamentalsApi.setStatus(topic.id, status);
    } catch (err) {
      setData(prev);
      toast.error(friendlyError(err));
    }
  }

  const total = areas.reduce((s, a) => s + a.topics.length, 0);
  const done = areas.reduce((s, a) => s + (a.progress || []).filter((p) => isDoneStatus(p.status)).length, 0);

  return (
    <>
      <PageHead kicker="CS FUNDAMENTALS" title="Fundamentals," em="bite by bite."
        text={loading ? "Loading your topics…" : `${done} of ${total} topics completed. Finish a topic to unlock its quiz.`} who="finn" />
      {error && <ErrorBanner message={friendlyError(error)} onRetry={retry} />}
      {loading && !data && <div className="area-grid"><CardSkeleton lines={5} /><CardSkeleton lines={5} /></div>}

      <div className="area-grid">
        {areas.map((area, ai) => (
          <Frame className="card area" key={area.area || ai}>
            <div className="card-head">
              <h2>{area.area}</h2>
              <span className="muted">{(area.progress || []).filter((p) => isDoneStatus(p.status)).length}/{area.topics.length}</span>
            </div>
            <ul className="topic-list">
              {area.topics.map((t, ti) => {
                const status = area.progress?.[ti]?.status || "not_started";
                const verified = status === "verified";
                const st = statuses[t.id];
                const avail = quizAvailability({ state: st?.passed ? "passed" : "ready", status: st });
                return (
                  <li key={t.id} className={isDoneStatus(status) ? "topic-done" : ""}>
                    <div className="topic-main">
                      <strong>{t.name}</strong>
                      <small>{t.description}</small>
                      <small className="muted">{(t.outline || []).length} lessons</small>
                    </div>
                    <div className="topic-side">
                      {verified ? <VerifiedBadge /> : (
                        <select value={status} onChange={(e) => setStatus(ai, ti, t, e.target.value)} aria-label={`Status of ${t.name}`}>
                          {SETTABLE.map((s) => <option key={s} value={s}>{TASK_STATUS[s]}</option>)}
                        </select>
                      )}
                      {status === "completed" && t.quizEligible !== false && (
                        avail.kind === "passed" ? <span className="pill pill-gold"><Check size={12} aria-hidden="true" /> Passed</span>
                        : avail.kind === "ready" ? (
                          <Link to={`/quiz/${encodeURIComponent(t.id)}`} className="btn btn-gold btn-sm">
                            <ScrollText size={14} aria-hidden="true" /> Take quiz <ArrowRight size={13} aria-hidden="true" />
                          </Link>
                        ) : (
                          <button className="btn btn-cream btn-sm" disabled><Lock size={13} aria-hidden="true" /> {avail.kind === "cooldown" ? avail.short.replace("IN ", "In ") : "No attempts left"}</button>
                        )
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Frame>
        ))}
      </div>
    </>
  );
}
