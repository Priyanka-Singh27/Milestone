import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { profileApi, roadmapApi } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useRoadmap } from "../../context/RoadmapContext";
import { useRoles } from "../../context/RolesContext";
import { useToast } from "../../context/ToastContext";
import { friendlyError } from "../../config/errors";
import { PLAN_LIMITS } from "../../config/constants";
import { ConfirmDialog, Field, Frame, Notice, ProgressOverlay, Skeleton } from "../../components/ui";

const BUFFER_LABEL = (n) => (n === 0 ? "No catch-up days" : `A catch-up day after every ${n} study days`);

export default function PlanStep() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, userId, setUser } = useAuth();
  const { getRole } = useRoles();
  const { status: roadmapStatus, setRoadmap } = useRoadmap();
  const { roleId, plan, setPlan, finalGapIds } = useOnboarding();
  const role = getRole(roleId);

  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const requestId = useRef(0);

  const { hoursPerDay, daysPerWeek, bufferInterval } = plan;
  const hoursValid =
    Number.isFinite(hoursPerDay) && hoursPerDay >= PLAN_LIMITS.hoursPerDay.min && hoursPerDay <= PLAN_LIMITS.hoursPerDay.max;
  const nothingToLearn = finalGapIds.length === 0;

  // Debounced estimate. A slower, older answer can never replace a newer one.
  useEffect(() => {
    setEstimateError(null);
    if (nothingToLearn || !hoursValid) { setEstimate(null); return undefined; }
    const id = ++requestId.current;
    setEstimating(true);
    const timer = setTimeout(async () => {
      try {
        const data = await roadmapApi.estimate({
          targetRoleId: roleId, gapTopicIds: finalGapIds, hoursPerDay, daysPerWeek, bufferInterval,
        });
        if (id === requestId.current) setEstimate(data.estimate || data);
      } catch (err) {
        if (id === requestId.current) { setEstimate(null); setEstimateError(err); }
      } finally {
        if (id === requestId.current) setEstimating(false);
      }
    }, PLAN_LIMITS.estimateDebounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoursPerDay, daysPerWeek, bufferInterval, roleId, finalGapIds.join("|")]);

  // Warn on refresh/close while the roadmap is being written.
  useEffect(() => {
    if (!generating) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [generating]);

  const set = (patch) => setPlan((p) => ({ ...p, ...patch }));

  async function generate(replace) {
    setConfirmReplace(false);
    setGenerating(true);
    setGenerateError(null);
    try {
      const data = await roadmapApi.generate({
        userId, targetRoleId: roleId, gapTopicIds: finalGapIds, hoursPerDay, daysPerWeek, bufferInterval, replace,
      });
      setRoadmap(data.roadmap);
      // Keep the profile's target role in step with the roadmap (best effort).
      if (user?.targetRoleId !== roleId) {
        profileApi.update({ targetRoleId: roleId }).then((r) => setUser(r.user || r.profile || r)).catch(() => {});
      }
      toast.success("Your roadmap is ready!");
      navigate("/roadmap", { replace: true, state: { justCreated: true } });
    } catch (err) {
      setGenerating(false);
      if (err.code === "ROADMAP_EXISTS") setConfirmReplace(true);
      else setGenerateError(err); // inputs are kept so "Try again" is one click
    }
  }

  const start = () => (roadmapStatus === "ready" ? setConfirmReplace(true) : generate(false));

  return (
    <Frame className="card step-card">
      <h2>How much time can you give?</h2>
      <p className="muted">We'll spread your {nothingToLearn ? "practice" : `${finalGapIds.length} topics`} across your days.</p>

      <div className="plan-grid">
        <Field label="Hours per day" htmlFor="hours" error={!hoursValid ? `Choose between ${PLAN_LIMITS.hoursPerDay.min} and ${PLAN_LIMITS.hoursPerDay.max} hours.` : null}>
          <input
            id="hours" type="number" inputMode="decimal"
            min={PLAN_LIMITS.hoursPerDay.min} max={PLAN_LIMITS.hoursPerDay.max} step={PLAN_LIMITS.hoursPerDay.step}
            value={Number.isNaN(hoursPerDay) ? "" : hoursPerDay}
            onChange={(e) => set({ hoursPerDay: e.target.value === "" ? NaN : Number(e.target.value) })}
            disabled={generating}
          />
        </Field>
        <Field label="Study days per week" htmlFor="days">
          <select id="days" value={daysPerWeek} onChange={(e) => set({ daysPerWeek: Number(e.target.value) })} disabled={generating}>
            {Array.from({ length: PLAN_LIMITS.daysPerWeek.max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} day{n > 1 ? "s" : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Catch-up days" htmlFor="buffer" hint="Free days that give you room to catch up when life gets in the way.">
          <select id="buffer" value={bufferInterval} onChange={(e) => set({ bufferInterval: Number(e.target.value) })} disabled={generating}>
            {PLAN_LIMITS.bufferInterval.options.map((n) => <option key={n} value={n}>{BUFFER_LABEL(n)}</option>)}
          </select>
        </Field>
      </div>

      <div className="estimate" role="status" aria-live="polite">
        <Sparkles size={18} aria-hidden="true" />
        {nothingToLearn ? (
          <span>Nothing left to learn, so you'll go straight to the practice phase.</span>
        ) : estimateError ? (
          <span>{friendlyError(estimateError)}</span>
        ) : estimating || !estimate ? (
          <Skeleton h={16} w="70%" />
        ) : (
          <span>
            About <strong>{estimate.approxWeeks} week{estimate.approxWeeks === 1 ? "" : "s"}</strong> —{" "}
            {estimate.studyDays} study days{estimate.bufferDays ? ` and ${estimate.bufferDays} catch-up days` : ""}.
            After that you move to a practice phase with DSA problems, aptitude sets and mock interviews.
          </span>
        )}
      </div>

      {generateError && (
        <Notice>{friendlyError(generateError)}</Notice>
      )}

      <div className="step-actions">
        <button className="btn btn-cream" onClick={() => navigate("/onboarding/gap")} disabled={generating}>
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        <button
          className="btn btn-gold"
          onClick={start}
          disabled={generating || !hoursValid || (!nothingToLearn && (!estimate || estimating))}
        >
          {generateError ? "Try again" : "Create my roadmap"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title="Replace your current roadmap?"
        confirmLabel="Replace it"
        danger
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => generate(true)}
      >
        <p>You already have a roadmap. Creating a new one replaces it, and the progress you made on the old one will be lost.</p>
      </ConfirmDialog>

      <ProgressOverlay
        open={generating}
        who="captain"
        title="Charting your voyage…"
        messages={[
          "Planning your study days…",
          "Writing your daily tasks…",
          "Spreading topics across your calendar…",
          "Adding catch-up days…",
          "Almost there…",
        ]}
      />
    </Frame>
  );
}
