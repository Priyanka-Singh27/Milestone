/* ==================================================
   ONE place for every number, name and limit the UI
   uses. Where the API cannot supply a value yet, it is
   listed under "FALLBACKS" so it is easy to replace.
================================================== */

/* ---------- API ---------- */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000/api/v1" : "")
).replace(/\/$/, "");

export const STORAGE_KEYS = {
  token: "prep_token",
  theme: "milestone_theme",
  flash: "milestone_flash",
};

/* Request timeouts (ms) */
export const TIMEOUTS = {
  default: 20000,
  dashboard: 15000,
  roadmapFetch: 60000, // can trigger a rollover/extension that calls the AI
  roadmapGenerate: 70000,
  resumeExtract: 45000,
  upload: 60000,
  quizGenerate: 60000,
  slowNotice: 5000, // show "waking up the server" after this long
};

/* ---------- Onboarding form limits ---------- */
export const PLAN_LIMITS = {
  hoursPerDay: { min: 0.5, max: 8, step: 0.5, default: 2 },
  daysPerWeek: { min: 1, max: 7, default: 5 },
  bufferInterval: { options: [0, 3, 4, 5, 6, 7], default: 0 },
  estimateDebounceMs: 400,
};

export const RESUME_RULES = {
  maxBytes: 5 * 1024 * 1024,
  extensions: [".pdf", ".docx"],
  mimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

export const CERTIFICATE_RULES = {
  maxBytes: 10 * 1024 * 1024,
  extensions: [".pdf", ".jpg", ".jpeg", ".png"],
  mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
};

/* ---------- Vocabulary the API defines (display names + colours) ---------- */
export const TRACKS = {
  DSA: { label: "DSA", cls: "track-DSA" },
  "Core CS": { label: "Core CS", cls: "track-CoreCS" },
  Aptitude: { label: "Aptitude", cls: "track-Aptitude" },
  "Tools/Libraries": { label: "Tools & Libraries", cls: "track-ToolsLibraries" },
};

export const PROFICIENCIES = [
  { id: "beginner", label: "Beginner (I want to learn this properly)" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];
export const CONFIDENCE_TO_PROFICIENCY = { high: "intermediate", medium: "beginner", low: "beginner" };

export const TASK_STATUS = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Done",
  verified: "Verified",
};

/* Statuses the student may set by hand. 'verified' only ever comes from a passed quiz. */
export const USER_TASK_STATUSES = ["not_started", "in_progress", "completed"];

/* Applications: the five defaults; anything else is a custom status. */
export const DEFAULT_APPLICATION_STATUSES = ["Applied", "OA", "Interview", "Offer", "Rejected"];
export const APPLICATION_REMINDER_DAYS = 14;

/* ---------- FALLBACKS (the API should supply these; used only if it does not) ---------- */
export const QUIZ_FALLBACK = { maxAttempts: 3, passingScore: 80, cooldownHours: 10, questionRange: "15–20" };
export const ROADMAP_WINDOW = { daysPerChapter: 7 };
