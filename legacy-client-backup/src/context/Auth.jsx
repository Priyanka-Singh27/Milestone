import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TOKEN_KEY, getProfile } from "../api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setProfile(null);
  }, []);

  const signIn = useCallback((newToken, user) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    if (user) setProfile(user);
  }, []);

  // Any 401 from the API layer signs the user out.
  useEffect(() => {
    window.addEventListener("milestone:logout", logout);
    return () => window.removeEventListener("milestone:logout", logout);
  }, [logout]);

  // Load the profile whenever the token changes.
  useEffect(() => {
    if (!token) {
      setProfile(null);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    getProfile()
      .then((r) => active && setProfile(r?.user || r?.profile || r))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      profile,
      setProfile,
      loading,
      authenticated: Boolean(token),
      userId: profile?.id || profile?._id || "",
      signIn,
      logout,
    }),
    [token, profile, loading, signIn, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}