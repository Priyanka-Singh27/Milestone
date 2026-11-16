import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { roadmapApi } from "../api";
import { useAuth } from "./AuthContext";

const RoadmapContext = createContext(null);
export const useRoadmap = () => useContext(RoadmapContext);

const FRESH_MS = 20000;

/**
 * Holds the student's roadmap in memory. `status`:
 *   idle     nothing requested yet
 *   loading  GET in flight (can be slow: it may roll over or extend the plan)
 *   ready    roadmap loaded
 *   none     ROADMAP_NOT_FOUND: onboarding is not finished (not an error)
 *   error    any other failure
 */
export function RoadmapProvider({ children }) {
  const { userId, isAuthenticated } = useAuth();
  const [roadmap, setRoadmapState] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [planNotice, setPlanNotice] = useState(false);
  const inFlight = useRef(null);
  const loadedAt = useRef(0);
  const current = useRef(null);
  current.current = roadmap;

  const setRoadmap = useCallback((updater) => {
    setRoadmapState((prev) => (typeof updater === "function" ? updater(prev) : updater));
    setStatus((s) => (s === "none" || s === "idle" || s === "error" ? "ready" : s));
  }, []);

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!userId) return { status: "idle", roadmap: null };
      if (inFlight.current) return inFlight.current;
      if (!force && current.current && Date.now() - loadedAt.current < FRESH_MS) {
        return { status: "ready", roadmap: current.current };
      }

      setStatus("loading");
      setError(null);
      const previous = current.current;

      inFlight.current = roadmapApi
        .get(userId)
        .then((d) => {
          const next = d.roadmap || d;
          // Detect the silent "missed tasks were moved forward" rebuild.
          if (previous && didPlanChange(previous, next)) setPlanNotice(true);
          setRoadmapState(next);
          loadedAt.current = Date.now();
          setStatus("ready");
          return { status: "ready", roadmap: next };
        })
        .catch((e) => {
          if (e.code === "ROADMAP_NOT_FOUND" || e.status === 404) {
            setRoadmapState(null);
            setStatus("none");
            return { status: "none", roadmap: null };
          }
          setError(e);
          setStatus(previous ? "ready" : "error");
          return { status: previous ? "ready" : "error", roadmap: previous, error: e };
        })
        .finally(() => {
          inFlight.current = null;
        });
      return inFlight.current;
    },
    [userId]
  );

  // Forget everything when the user changes or logs out.
  useEffect(() => {
    if (!isAuthenticated) {
      setRoadmapState(null);
      setStatus("idle");
      setError(null);
      setPlanNotice(false);
      loadedAt.current = 0;
    }
  }, [isAuthenticated, userId]);

  const value = useMemo(
    () => ({
      roadmap,
      status,
      error,
      load,
      setRoadmap,
      planNotice,
      dismissPlanNotice: () => setPlanNotice(false),
      clear: () => {
        setRoadmapState(null);
        setStatus("idle");
        loadedAt.current = 0;
      },
    }),
    [roadmap, status, error, load, setRoadmap, planNotice]
  );

  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>;
}

/** Same day numbers/dates but different unfinished task ids on the days ahead = the plan was rebuilt. */
function didPlanChange(prev, next) {
  const sig = (rm) =>
    (rm.days || [])
      .filter((d) => !d.isBufferDay)
      .slice(0, 6)
      .map((d) => `${d.date}:${(d.tasks || []).map((t) => t.id).join(",")}`)
      .join("|");
  return sig(prev) !== sig(next);
}
