/* ==================================================
   Every endpoint, grouped by area. Pages never build
   URLs themselves. The user always comes from the
   bearer token; ids sent in bodies are just for the
   server to double-check.
================================================== */

import { request } from "./client";
import { API_BASE_URL, TIMEOUTS } from "../config/constants";

const qs = (params) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  return s ? `?${s}` : "";
};

/* ---------- auth + profile ---------- */
export const googleLoginUrl = () => `${API_BASE_URL}/auth/google`;
export const authApi = {
  signup: (body) => request("/auth/signup", { method: "POST", body, auth: false }),
  login: (body) => request("/auth/login", { method: "POST", body, auth: false }),
};
export const profileApi = {
  get: () => request("/profile"),
  update: (body) => request("/profile", { method: "PATCH", body }),
};
export const dashboardApi = {
  get: () => request("/dashboard", { timeoutMs: TIMEOUTS.dashboard }),
};

/* ---------- roles, skills, roadmap ---------- */
export const rolesApi = { list: () => request("/roles") };

export const skillsApi = {
  extract: (formData) =>
    request("/skills/extract", { method: "POST", form: formData, timeoutMs: TIMEOUTS.resumeExtract }),
  gap: (body) => request("/skills/gap", { method: "POST", body }),
  verified: () => request("/skills/verified"),
};

export const roadmapApi = {
  estimate: (body) => request("/roadmap/estimate", { method: "POST", body }),
  generate: (body) =>
    request("/roadmap/generate", { method: "POST", body, timeoutMs: TIMEOUTS.roadmapGenerate }),
  get: (userId) =>
    request(`/roadmap/${encodeURIComponent(userId)}`, { timeoutMs: TIMEOUTS.roadmapFetch }),
  updateTask: (taskId, { userId, status, dayNumber }) =>
    request(`/roadmap/task/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: { userId, status, dayNumber },
    }),
};

/* ---------- quizzes ---------- */
export const quizApi = {
  status: (topicId) => request(`/quiz/status/${encodeURIComponent(topicId)}`),
  generate: (topicId, roleId) =>
    request(`/quiz/generate/${encodeURIComponent(topicId)}`, {
      method: "POST",
      body: roleId ? { roleId } : {},
      timeoutMs: TIMEOUTS.quizGenerate,
    }),
  submit: (body) => request("/quiz/submit", { method: "POST", body }),
};

/* ---------- fundamentals ---------- */
export const fundamentalsApi = {
  get: () => request("/fundamentals"),
  setStatus: (topicId, status) =>
    request(`/fundamentals/task/${encodeURIComponent(topicId)}`, { method: "PATCH", body: { status } }),
};

/* ---------- applications + Google Sheets ---------- */
export const applicationsApi = {
  list: (status) => request(`/applications${qs({ status })}`),
  create: (body) => request("/applications", { method: "POST", body }),
  update: (id, body) => request(`/applications/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  remove: (id) => request(`/applications/${encodeURIComponent(id)}`, { method: "DELETE" }),
  sheetsStatus: () => request("/applications/sheets/status"),
  sheetsConnect: () => request("/applications/sheets/connect"),
  sheetsSync: () => request("/applications/sync-sheets", { method: "POST", body: {}, timeoutMs: TIMEOUTS.upload }),
};

/* ---------- certificates ---------- */
export const certificatesApi = {
  list: ({ type, tag } = {}) => request(`/certificates${qs({ type, tag })}`),
  upload: (formData) =>
    request("/certificates/upload", { method: "POST", form: formData, timeoutMs: TIMEOUTS.upload }),
  remove: (id) => request(`/certificates/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
