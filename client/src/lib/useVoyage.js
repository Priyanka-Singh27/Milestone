import { useCallback, useEffect, useMemo, useState } from "react";
import { getRoadmap, getRoles, listCertificates } from "../api";

/**
 * Loads everything the roadmap needs in one place:
 * the roadmap, the roles (for topic names + lesson outlines) and the
 * user's badges (a badge's tag is the topic id the quiz was passed on).
 */
export function useVoyage(userId) {
  const [roadmap, setRoadmap] = useState(null);
  const [roles, setRoles] = useState([]);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noRoadmap, setNoRoadmap] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError("");

    const [rm, rl, ct] = await Promise.allSettled([
      getRoadmap(userId),
      getRoles(),
      listCertificates(userId),
    ]);

    if (rl.status === "fulfilled") setRoles(rl.value?.roles || rl.value || []);
    if (ct.status === "fulfilled") {
      setBadges((ct.value?.certificates || []).filter((c) => c.type === "badge"));
    }

    if (rm.status === "fulfilled") {
      setRoadmap(rm.value?.roadmap || rm.value);
      setNoRoadmap(false);
    } else if (rm.reason?.code === "ROADMAP_NOT_FOUND" || rm.reason?.status === 404) {
      setRoadmap(null);
      setNoRoadmap(true);
    } else {
      setError(rm.reason?.message || "Could not load your roadmap.");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const role = useMemo(
    () => roles.find((r) => (r.id || r._id) === roadmap?.targetRoleId) || null,
    [roles, roadmap]
  );

  const topicMap = useMemo(() => {
    const map = new Map();
    (role?.topics || []).forEach((t) => map.set(t.id, t));
    return map;
  }, [role]);

  const passed = useMemo(() => {
    const set = new Set();
    badges.forEach((b) => (b.tags || []).forEach((t) => set.add(t)));
    return set;
  }, [badges]);

  return {
    roadmap, setRoadmap, roles, role, topicMap, passed, badges,
    loading, error, setError, noRoadmap, reload,
  };
}