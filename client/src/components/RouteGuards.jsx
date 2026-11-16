import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRoadmap } from "../context/RoadmapContext";
import { returnStore } from "../api/client";
import { friendlyError } from "../config/errors";
import { ErrorBanner, Loading } from "./ui";

/** Wraps every logged-in page. No token: go to login and remember where the visitor was heading. */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (isLoading && !user) return <Loading who="pearl" title="Signing you in…" />;
  return <Outlet />;
}

/** Login / signup / landing: a signed-in visitor is sent on to their workspace. */
export function PublicOnly({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/continue" replace />;
  return children;
}

/**
 * After login/signup/Google: dashboard if a roadmap exists, onboarding if the
 * roadmap fetch says ROADMAP_NOT_FOUND. (targetRoleId alone does not prove a
 * roadmap exists.) Also restores the page the visitor originally wanted.
 */
export function PostLogin() {
  const { load } = useRoadmap();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    (async () => {
      const result = await load({ force: true });
      if (!alive) return;
      const from = location.state?.from || returnStore.take();
      if (result.status === "none") navigate("/onboarding/role", { replace: true });
      else if (result.status === "error") setFailure(result.error);
      else navigate(from && !from.startsWith("/login") ? from : "/dashboard", { replace: true });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, attempt]);

  if (failure) {
    return (
      <div className="page">
        <ErrorBanner message={friendlyError(failure)} onRetry={() => { setFailure(null); setAttempt((n) => n + 1); }} />
        <button className="btn btn-cream" onClick={() => navigate("/dashboard", { replace: true })}>
          Continue to the dashboard anyway
        </button>
      </div>
    );
  }
  return (
    <div className="page">
      <Loading who="captain" title="Preparing your workspace…" text="Checking your roadmap. The first load can be slow on free hosting." />
    </div>
  );
}
