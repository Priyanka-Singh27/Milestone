/* ==================================================
   API CLIENT — the only place that calls fetch().
   • adds the bearer token
   • per-call timeouts (AbortController)
   • normalises every failure into ApiError { code, message, status }
   • global handling of expired / invalid sessions
   • flags slow requests (cold-starting free-tier server)
   Never logs tokens, passwords or request bodies.
================================================== */

import { API_BASE_URL, STORAGE_KEYS, TIMEOUTS } from "../config/constants";
import { slowStore } from "./slow";

export class ApiError extends Error {
  constructor(message, code = "SERVER_ERROR", status = 0, data = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.data = data; // extra payload some errors carry (e.g. quiz status)
  }
}

/* ---------- token storage (never throws: Safari private mode, blocked storage) ---------- */
export const tokenStore = {
  get() {
    try { return localStorage.getItem(STORAGE_KEYS.token); } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(STORAGE_KEYS.token, token); } catch { /* storage blocked */ }
  },
  clear() {
    try { localStorage.removeItem(STORAGE_KEYS.token); } catch { /* ignore */ }
  },
};

export const flashStore = {
  set(message) { try { sessionStorage.setItem(STORAGE_KEYS.flash, message); } catch { /* ignore */ } },
  take() {
    try {
      const m = sessionStorage.getItem(STORAGE_KEYS.flash);
      if (m) sessionStorage.removeItem(STORAGE_KEYS.flash);
      return m;
    } catch { return null; }
  },
};

/** Remembers where a logged-out visitor was heading (survives the Google round-trip). */
export const returnStore = {
  set(path) { try { sessionStorage.setItem("milestone_return", path); } catch { /* ignore */ } },
  take() {
    try {
      const p = sessionStorage.getItem("milestone_return");
      if (p) sessionStorage.removeItem("milestone_return");
      return p;
    } catch { return null; }
  },
};

const SESSION_CODES = new Set(["NO_TOKEN", "INVALID_TOKEN", "SESSION_EXPIRED"]);

export async function request(
  path,
  { method = "GET", body, form, timeoutMs = TIMEOUTS.default, auth = true } = {}
) {
  if (!API_BASE_URL) {
    throw new ApiError("The app is not configured: VITE_API_BASE_URL is missing.", "SERVER_ERROR", 0);
  }

  const headers = { Accept: "application/json" };
  const token = auth ? tokenStore.get() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // After a few seconds, tell the app a request is slow ("waking up the server…").
  let slowStarted = false;
  const slowTimer = setTimeout(() => {
    slowStarted = true;
    slowStore.start();
  }, TIMEOUTS.slowNotice);

  const cleanup = () => {
    clearTimeout(timer);
    clearTimeout(slowTimer);
    if (slowStarted) slowStore.end();
  };

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
      credentials: "omit", // we use bearer tokens, never cookies, for the API
    });
  } catch (err) {
    cleanup();
    if (err?.name === "AbortError") throw new ApiError("Request timed out.", "TIMEOUT", 0);
    throw new ApiError("Network error.", "NETWORK_ERROR", 0);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* body was not JSON (proxy error page, cold start, …) */
  }
  cleanup();

  if (!json || typeof json !== "object") {
    throw new ApiError("The server sent an unexpected reply.", "SERVER_ERROR", res.status);
  }

  if (!res.ok || json.success === false) {
    const e = json.error || {};
    const code = e.code || "SERVER_ERROR";

    // An expired/invalid session anywhere in the app signs the user out.
    if (res.status === 401 && SESSION_CODES.has(code)) {
      tokenStore.clear();
      flashStore.set(code === "SESSION_EXPIRED" ? "Your session expired — please log in again." : "Please log in again.");
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    throw new ApiError(e.message || "Request failed.", code, res.status, json.data ?? null);
  }

  return json.data ?? {};
}
