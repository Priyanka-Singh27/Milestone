import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { rolesApi } from "../api";
import { useAuth } from "./AuthContext";

const RolesContext = createContext(null);

/** Roles + topics change rarely, so they are fetched once per session and shared. */
export function RolesProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [roles, setRoles] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const inFlight = useRef(null);

  const load = useCallback(async (force = false) => {
    if (inFlight.current) return inFlight.current;
    if (!force && status === "ready") return null;
    setStatus("loading");
    setError(null);
    inFlight.current = rolesApi
      .list()
      .then((d) => {
        setRoles(d.roles || []);
        setStatus("ready");
      })
      .catch((e) => {
        setError(e);
        setStatus("error");
      })
      .finally(() => {
        inFlight.current = null;
      });
    return inFlight.current;
  }, [status]);

  useEffect(() => {
    if (isAuthenticated && status === "idle") load();
  }, [isAuthenticated, status, load]);

  useEffect(() => {
    if (!isAuthenticated) { setRoles([]); setStatus("idle"); }
  }, [isAuthenticated]);

  const value = useMemo(() => {
    const idOf = (r) => r.id || r._id;
    const getRole = (id) => roles.find((r) => idOf(r) === id) || null;
    return {
      roles,
      status,
      error,
      reload: () => load(true),
      getRole,
      idOf,
      topicsOf: (roleId) => getRole(roleId)?.topics || [],
      topicMapOf: (roleId) => new Map((getRole(roleId)?.topics || []).map((t) => [t.id, t])),
    };
  }, [roles, status, error, load]);

  return <RolesContext.Provider value={value}>{children}</RolesContext.Provider>;
}

export const useRoles = () => useContext(RolesContext);
