import React, { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { OnboardingProvider, useOnboarding } from "../../context/OnboardingContext";
import { useRoadmap } from "../../context/RoadmapContext";
import { PageHead, Stepper } from "../../components/ui";

export const STEPS = ["Role", "Skills", "Gap", "Plan"];
const PATHS = ["/onboarding/role", "/onboarding/skills", "/onboarding/gap", "/onboarding/plan"];

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Inner />
    </OnboardingProvider>
  );
}

function Inner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { roleId, gapTopicIds } = useOnboarding();
  const { status, load } = useRoadmap();
  const current = Math.max(0, PATHS.indexOf(pathname));

  // Do we already have a roadmap? (continuing would replace it)
  useEffect(() => { if (status === "idle") load(); }, [status, load]);

  // Warn before a refresh/close mid-flow: the answers are only kept in memory.
  useEffect(() => {
    if (!roleId) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [roleId]);

  // A refresh mid-flow restarts at step 1 (state lives in memory only).
  if (current > 0 && !roleId) return <Navigate to={PATHS[0]} replace />;
  if (current === 3 && gapTopicIds === null) return <Navigate to={PATHS[2]} replace />;

  return (
    <>
      <PageHead
        kicker={`STEP ${current + 1} OF ${STEPS.length}`}
        title="Let's chart"
        em="your voyage."
        text="A few quick questions, then we'll plan your days."
        who="captain"
      />

      {status === "ready" && (
        <div className="notice notice-warn banner" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            You already have a roadmap. Finishing this setup <strong>replaces it</strong>, including your progress on it.
          </span>
          <Link to="/dashboard" className="btn btn-sm btn-cream">Keep my current roadmap</Link>
        </div>
      )}

      <Stepper steps={STEPS} current={current} onGo={(i) => navigate(PATHS[i])} />
      <Outlet />
    </>
  );
}
