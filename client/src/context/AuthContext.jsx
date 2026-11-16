import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { profileApi } from "../api";
import { tokenStore } from "../api/client";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => tokenStore.get());
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(tokenStore.get()));
  const [profileError, setProfileError] = useState(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setProfileError(null);
    try {
      const data = await profileApi.get();
      setUser(data.user || data.profile || data);
    } catch (err) {
      // A bad session is handled globally (token cleared + 'auth:expired').
      // Anything else (network, cold start) keeps the token so a retry can work.
      if (!["SESSION_EXPIRED", "INVALID_TOKEN", "NO_TOKEN"].includes(err.code)) setProfileError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restore the session on load: stored token first, then confirm with GET /profile.
  useEffect(() => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    if (!user) loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // The API client fires this when the session is expired or invalid.
  useEffect(() => {
    const onExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  const login = useCallback((newToken, newUser) => {
    tokenStore.set(newToken);
    setToken(newToken);
    if (newUser) {
      setUser(newUser);
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setUser(null);
    navigate("/", { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({
      token,
      user,
      userId: user?.id || user?._id || "",
      isLoading,
      isAuthenticated: Boolean(token),
      profileError,
      login,
      logout,
      setUser,
      refreshUser: loadProfile,
    }),
    [token, user, isLoading, profileError, login, logout, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
