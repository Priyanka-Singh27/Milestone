import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, RotateCcw, Trash2 } from "lucide-react";
import { skillsApi } from "../../api";
import { useOnboarding } from "../../context/OnboardingContext";
import { useRoles } from "../../context/RolesContext";
import { friendlyError } from "../../config/errors";
import { formatMinutes, topicMinutes } from "../../lib/roadmap";
import {
  ConfirmDialog, ErrorBanner, Frame, Notice, PriorityTag, Skeleton, TrackBadge,
} from "../../components/ui";

function TopicRow({ topic, action }) {
  return (
    <li className="gap-row">
      <div className="gap-main">
        <strong>{topic.name}</strong>
        <span className="gap-meta">
          <TrackBadge track={topic.track} />
          <PriorityTag priority={topic.priority} />
          <small>{(topic.outline || []).length} subtopics · {formatMinutes(topicMinutes(topic))}</small>
        </span>
      </div>
      {action}
    </li>
  );
}

export default function GapStep() {
  const navigate = useNavigate();
  const { getRole } = useRoles();
  const {
    roleId, skills, setSkills, gapTopicIds, setGapTopicIds, removedIds, setRemovedIds,
    inconsistencies, setInconsistencies, dismissed, setDismissed, finalGapIds,
  } = useOnboarding();
  const role = getRole(roleId);
  const topics = role?.topics || [];
  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(null); // { topic, dependents }

  const compute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const currentSkills = Object.entries(skills).map(([topicId, s]) => ({
        topicId,
        proficiency: s.proficiency,
      }));
      const data = await skillsApi.gap({ targetRoleId: roleId, currentSkills });
      setGapTopicIds(data.gapTopicIds || []);
      setInconsistencies(data.inconsistencies || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [roleId, skills, setGapTopicIds, setInconsistencies]);

  // Always recompute on entering the step, and again after "Mark … as known".
  useEffect(() => {
    compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const gap = (gapTopicIds || []).filter((id) => !removedIds.includes(id)).map((id) => byId.get(id)).filter(Boolean);
  const known = topics.filter((t) => !(gapTopicIds || []).includes(t.id));
  const skipped = removedIds.map((id) => byId.get(id)).filter(Boolean);
  const totalMinutes = gap.reduce((s, t) => s + topicMinutes(t), 0);

  const key = (i) => `${i.topicId}:${i.missingPrerequisiteId}`;
  const banners = inconsistencies.filter((i) => !dismissed.includes(key(i)));

  function askRemove(topic) {
    // Does any remaining topic build on this one?
    const dependents = gap.filter((t) => (t.prerequisiteTopicIds || []).includes(topic.id) && t.id !== topic.id);
    if (dependents.length) setConfirmRemove({ topic, dependents });
    else setRemovedIds((r) => [...r, topic.id]);
  }

  function markKnown(id) {
    setSkills((s) => ({ ...s, [id]: { proficiency: "intermediate" } }));
    setVersion((v) => v + 1); // recompute the gap with the new answer
  }

  if (error) {
    const lost = ["ROLE_NOT_FOUND", "UNKNOWN_TOPIC_IDS"].includes(error.code);
    return (
      <Frame className="card step-card">
        <ErrorBanner
          message={friendlyError(error)}
          onRetry={lost ? undefined : compute}
        />
        <div className="step-actions">
          <button className="btn btn-cream" onClick={() => navigate(lost ? "/onboarding/role" : "/onboarding/skills")}>
            <ArrowLeft size={16} aria-hidden="true" /> {lost ? "Back to the start" : "Back"}
          </button>
          <span />
        </div>
      </Frame>
    );
  }

  return (
    <Frame className="card step-card" aria-busy={loading}>
      <h2>Your skill gap</h2>
      <p className="muted">
        This is what you still need to learn for <strong>{role?.name}</strong>. Take a look, and skip anything you don't need.
      </p>

      {loading ? (
        <div className="stack"><Skeleton h={24} w="50%" /><Skeleton h={70} /><Skeleton h={70} /><Skeleton h={70} /></div>
      ) : (
        <>
          {banners.map((i) => (
            <Notice
              key={key(i)}
              tone="warn"
              action={
                <span className="row-gap">
                  <button className="btn btn-sm btn-gold" onClick={() => markKnown(i.missingPrerequisiteId)}>
                    Mark “{byId.get(i.missingPrerequisiteId)?.name || i.missingPrerequisiteId}” as known
                  </button>
                  <button className="btn btn-sm btn-cream" onClick={() => setDismissed((d) => [...d, key(i)])}>
                    Keep as it is
                  </button>
                </span>
              }
            >
              You marked <strong>{byId.get(i.topicId)?.name || i.topicId}</strong> as known, but not{" "}
              <strong>{byId.get(i.missingPrerequisiteId)?.name || i.missingPrerequisiteId}</strong>, which it builds on.
            </Notice>
          ))}

          {gap.length === 0 ? (
            <div className="notice notice-success banner" role="status">
              <span>
                You already know everything in this role. 🎉 Your roadmap will start straight in the practice phase
                (DSA problems, aptitude sets and mock interviews).
              </span>
            </div>
          ) : (
            <>
              <h3>What you still need to learn <span className="count">{gap.length}</span></h3>
              <p className="muted">Total study time: <strong>{formatMinutes(totalMinutes)}</strong></p>
              <ul className="gap-list">
                {gap.map((t) => (
                  <TopicRow
                    key={t.id}
                    topic={t}
                    action={
                      <button className="btn btn-sm btn-cream" onClick={() => askRemove(t)} aria-label={`Skip ${t.name}`}>
                        <Trash2 size={14} aria-hidden="true" /> Skip
                      </button>
                    }
                  />
                ))}
              </ul>
            </>
          )}

          {skipped.length > 0 && (
            <>
              <h3>Skipped by you <span className="count">{skipped.length}</span></h3>
              <ul className="gap-list gap-list-muted">
                {skipped.map((t) => (
                  <TopicRow
                    key={t.id}
                    topic={t}
                    action={
                      <button className="btn btn-sm btn-cream" onClick={() => setRemovedIds((r) => r.filter((x) => x !== t.id))}>
                        <RotateCcw size={14} aria-hidden="true" /> Add back
                      </button>
                    }
                  />
                ))}
              </ul>
            </>
          )}

          {known.length > 0 && (
            <>
              <h3>Skills you already have <span className="count">{known.length}</span></h3>
              <ul className="gap-list gap-list-muted">
                {known.map((t) => <TopicRow key={t.id} topic={t} />)}
              </ul>
            </>
          )}
        </>
      )}

      <div className="step-actions">
        <button className="btn btn-cream" onClick={() => navigate("/onboarding/skills")}>
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        <button className="btn btn-gold" disabled={loading} onClick={() => navigate("/onboarding/plan")}>
          Next: plan your pace <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        title="Skip this topic?"
        confirmLabel="Skip anyway"
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => { setRemovedIds((r) => [...r, confirmRemove.topic.id]); setConfirmRemove(null); }}
      >
        <p>
          <strong>{confirmRemove?.dependents.map((d) => d.name).join(", ")}</strong>{" "}
          {confirmRemove?.dependents.length === 1 ? "builds" : "build"} on <strong>{confirmRemove?.topic.name}</strong>.
          Skipping it may make {confirmRemove?.dependents.length === 1 ? "that topic" : "those topics"} harder to follow.
        </p>
      </ConfirmDialog>
    </Frame>
  );
}
