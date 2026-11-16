/* ==================================================
   API LAYER — every backend call lives here.
   Base URL comes from VITE_API_URL (see client/.env).
================================================== */

export const API_BASE = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1"
).replace(/\/$/, "");

export const TOKEN_KEY = "milestone_token";

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(
      "Can't reach the server. Is the backend running?",
      "NETWORK_ERROR",
      0
    );
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || json?.success === false) {
    const err = json?.error || {};
    if (
      res.status === 401 &&
      ["NO_TOKEN", "INVALID_TOKEN", "SESSION_EXPIRED"].includes(err.code)
    ) {
      window.dispatchEvent(new Event("milestone:logout"));
    }
    throw new ApiError(
      err.message || `Request failed (${res.status})`,
      err.code || "REQUEST_FAILED",
      res.status
    );
  }

  return json?.data ?? json;
}

const qs = (params) =>
  new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();

/* ---------- auth & profile ---------- */
export const login = (body) => request("/auth/login", { method: "POST", body });
export const signup = (body) => request("/auth/signup", { method: "POST", body });
export const googleLoginUrl = `${API_BASE}/auth/google`;
export const getProfile = () => request("/profile");
export const updateProfile = (body) => request("/profile", { method: "PATCH", body });
export const getDashboard = () => request("/dashboard");

/* ---------- roles, skills, roadmap ---------- */
export const getRoles = () => request("/roles");
export const getSkillGap = (body) => request("/skills/gap", { method: "POST", body });
export const estimateRoadmap = (body) => request("/roadmap/estimate", { method: "POST", body });
export const generateRoadmap = (body) => request("/roadmap/generate", { method: "POST", body });
export const getRoadmap = (userId) => request(`/roadmap/${encodeURIComponent(userId)}`);
export const updateRoadmapTask = (taskId, status, userId, dayNumber) =>
  request(`/roadmap/task/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: { userId, status, dayNumber },
  });

/* ---------- quizzes (topic milestones) ---------- */
export const getQuizAvailability = (topicId) =>
  request(`/quiz/availability/${encodeURIComponent(topicId)}`);
export const generateQuiz = (topicId, roleId) =>
  request(`/quiz/generate/${encodeURIComponent(topicId)}`, {
    method: "POST",
    body: roleId ? { roleId } : {},
  });
export const submitQuiz = (body) => request("/quiz/submit", { method: "POST", body });

/* ---------- CS fundamentals ---------- */
export const getFundamentals = () => request("/fundamentals");
export const updateFundamental = (topicId, status) =>
  request(`/fundamentals/task/${encodeURIComponent(topicId)}`, {
    method: "PATCH",
    body: { status },
  });

/* ---------- applications (backend reads userId from query/body) ---------- */
export const listApplications = (userId) => request(`/applications?${qs({ userId })}`);
export const createApplication = (body) => request("/applications", { method: "POST", body });
export const updateApplication = (id, body) =>
  request(`/applications/${id}`, { method: "PATCH", body });
export const deleteApplication = (id) => request(`/applications/${id}`, { method: "DELETE" });

/* ---------- certificates & badges ---------- */
export const listCertificates = (userId) => request(`/certificates?${qs({ userId })}`);
export const uploadCertificate = (formData) =>
  request("/certificates/upload", { method: "POST", form: formData });
export const deleteCertificate = (id) => request(`/certificates/${id}`, { method: "DELETE" });