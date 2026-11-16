import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "../config/constants";
import { AUTO_THEME, THEMES, modeOf, resolveTheme } from "../theme/themes";

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const read = () => {
  try { return localStorage.getItem(STORAGE_KEYS.theme) || AUTO_THEME; } catch { return AUTO_THEME; }
};

export function ThemeProvider({ children }) {
  const [setting, setSetting] = useState(read);
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );

  // Follow the device while "Match my device" is chosen.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return undefined;
    const onChange = (e) => setPrefersDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const active = resolveTheme(setting, prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = active;
    root.dataset.mode = modeOf(active);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEMES.find((t) => t.id === active)?.bg || "#bfe3f6");
  }, [active]);

  const choose = useCallback((id) => {
    setSetting(id);
    try { localStorage.setItem(STORAGE_KEYS.theme, id); } catch { /* storage blocked */ }
  }, []);

  const value = useMemo(
    () => ({ setting, active, mode: modeOf(active), choose, themes: THEMES }),
    [setting, active, choose]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
