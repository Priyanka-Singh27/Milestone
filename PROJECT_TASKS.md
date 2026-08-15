# PROJECT_TASKS.md

## Purpose of this file

This file is the single source of truth for what each team member is building. It's written to be detailed enough that an AI coding agent (Claude Code, Cursor, etc.) can read a member's section and implement their feature correctly without needing to guess field names, route paths, or business logic. Every member should point their agent at this file and `docs/CONTRACTS.md` before generating any code.

**Rule for agents reading this file:** Do not invent field names, route paths, or response shapes that differ from what's specified here. If something genuinely isn't covered, flag it instead of guessing, so the team can add it to this file.

---

## 0. Shared Contracts (applies to every member — read this first)

### 0.1 Tech stack
- Frontend: React (or Next.js) + Tailwind CSS
- Backend: Node.js + Express
- Database: MongoDB Atlas (shared dev database — see section 0.8)
- Object storage: decided by Person C (AWS S3 or Cloudinary)
- AI/LLM provider: **not finalized yet — do not hardcode a specific provider or SDK.** Build all AI-calling code behind a single internal wrapper module (`server/src/services/llm.service.js`) so the actual provider (Anthropic, Groq, or otherwise) can be swapped in later by changing one file, not code scattered across every feature. Every prompt call in this document should go through that wrapper.
- Auth: JWT + Google OAuth

### 0.2 API conventions
- All routes are prefixed `/api/v1/`
- REST-style plural nouns for resources (e.g., `/api/v1/applications`, not `/api/v1/getApplications`)
- Standard verbs: `GET` (fetch), `POST` (create), `PATCH` (partial update), `DELETE` (remove)

### 0.3 Standard response shape

Every endpoint, regardless of who builds it, must return:

```json
// success
{ "success": true, "data": { } }

// error
{ "success": false, "error": { "code": "INVALID_EMAIL", "message": "That email is already registered." } }
```

Every error includes both a short `code` (for the frontend to map to a custom UI message/icon) and a plain `message` (usable directly as a fallback). Standard HTTP status codes: `200` success, `201` created, `400` validation error, `401` unauthorized, `403` forbidden, `404` not found, `500` server error.

### 0.4 Auth contract
- JWT payload shape: `{ "userId": "string", "email": "string", "iat": number, "exp": number }`
- Token passed as `Authorization: Bearer <token>` header
- Session length: **7 days** before requiring re-login
- On an expired/invalid token: respond `401`; frontend must show a clear "Your session expired — please log in again" message, not a silent redirect
- All protected routes go through `server/src/middleware/auth.middleware.js`, which attaches `req.user = { userId, email }`
- **Placeholder user ID for local development before Auth ships:** use the fixed string `"dev-user-1"` everywhere a `userId` is needed. This exact user is seeded once into the shared dev database (see section 0.8) — do not invent your own placeholder.

### 0.5 Shared enums / value rules
```
TaskStatus       = "not_started" | "in_progress" | "completed" | "verified"
TopicSource      = "resume" | "manual" | "quiz"
TopicType        = "roadmap" | "fundamentals"
CertificateType  = "badge" | "uploaded"
```
- **Application status is NOT a fixed enum.** Default pipeline is `Applied → OA → Interview → Offer → Rejected`, pre-filled for every user, but stored as a free string per user so they can add their own custom stages (like customizing spreadsheet columns).

### 0.6 Environment variables (exact names — put in root `.env.example` files)
```
# server/.env
DATABASE_URL=
JWT_SECRET=
LLM_API_KEY=              # provider TBD — do not name this ANTHROPIC_API_KEY or GROQ_API_KEY specifically
LLM_PROVIDER=              # e.g. "groq" | "anthropic" — read by llm.service.js to decide which SDK/endpoint to use
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
S3_BUCKET_NAME=            # or Cloudinary equivalents — Person C's choice
S3_ACCESS_KEY=
S3_SECRET_KEY=

# client/.env.local
VITE_API_BASE_URL=   # e.g. http://localhost:5000/api/v1
```

### 0.7 Cross-member dependency map
- Persons A, B, C build against the placeholder `userId` (`dev-user-1`) until Person D's auth middleware ships (target: end of Week 4).
- Person B's quiz system is triggered by both Person A (roadmap tasks) and Person B's own fundamentals tasks — see section 2, "Topic completion contract."
- Person D's Dashboard reads summary data from Persons A, B, and C's APIs — their endpoints must exist and match this spec before Dashboard can be finished.
- Person D and Person C share one Google Cloud project (Person D uses it for OAuth login, Person C uses it for Sheets API) — do not create two separate projects.
- Anyone calling the LLM (Person A for resume parsing/task generation, Person B for quiz generation) must go through `server/src/services/llm.service.js`, never call a provider SDK directly in a controller.

### 0.8 Local development database
- Everyone connects to the **same shared MongoDB Atlas dev database** — no local copies.
- Person D owns and runs the seed script. Each member contributes their portion into one shared seed file before Week 3:
  - Person A: sample roles + topics (mark `quizEligible: true` on substantial topics, per section 2.6)
  - Person B: fundamentals topics (DSA/OOP/OS/DBMS/CN)
  - Person D: the single `"dev-user-1"` test user record
  - Person C: no seed data needed (applications/certificates are created live during testing)
- Because the database is shared, avoid destructive test scripts that wipe collections without checking with the team first.

---

## 1. Person A — Roadmap Engine

### 1.1 Responsibility
Turn a target role + the student's current skills into a persisted, day-wise learning roadmap spanning ~6-8 months, adjustable by days/week and hours/day available. Each day contains a **bundle of varied tasks** (not one task per day) so the experience feels like a real daily study session — e.g., a DSA problem, an OS concept, an aptitude drill, and a library walkthrough on the same day, drawn from multiple topic-tracks running in parallel.

### 1.2 Data models

**Role**
```
id: string
name: string                  // e.g. "AI/ML Engineer"
description: string
topics: [{
  id: string
  name: string
  track: string                    // e.g. "DSA", "Core CS", "Aptitude", "Tools/Libraries" — used to interleave variety per day
  prerequisiteTopicIds: string[]
  estimatedHours: number
  quizEligible: boolean            // true for "worthy" topics substantial enough to warrant a quiz (e.g. NumPy, Scikit-learn)
}]
```

**SkillProfile**
```
id: string
userId: string
skills: [{
  topicId: string
  verified: boolean            // true only after quiz pass (Person B writes this via API call)
  source: TopicSource
}]
```

**Roadmap**
```
id: string
userId: string
targetRoleId: string
startDate: string (ISO date)
totalDays: number
daysPerWeek: number
hoursPerDay: number
days: RoadmapDay[]
createdAt: string (ISO)
```

**RoadmapDay**
```
dayNumber: number
date: string (ISO date)
tasks: RoadmapTask[]          // typically 3-5 tasks, pulled from different active tracks — see 1.4
```

**RoadmapTask**
```
id: string
topicId: string
track: string
taskName: string
description: string
estimatedMinutes: number
status: TaskStatus
```

### 1.3 API endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/roles` | — | `{ roles: Role[] }` — list/search available target roles |
| POST | `/api/v1/skills/extract` | `{ resumeFileUrl: string }` (or multipart upload) | `{ skills: [{ topicId, name, confidence }] }` — LLM-parsed resume skills |
| POST | `/api/v1/skills/gap` | `{ userId, targetRoleId, currentSkillTopicIds: string[] }` | `{ gapTopicIds: string[] }` |
| POST | `/api/v1/roadmap/generate` | `{ userId, targetRoleId, gapTopicIds, daysPerWeek, hoursPerDay, extraTopics?: string[] }` | `{ roadmap: Roadmap }` |
| GET | `/api/v1/roadmap/:userId` | — | `{ roadmap: Roadmap }` |
| PATCH | `/api/v1/roadmap/task/:taskId` | `{ status: TaskStatus }` | `{ task: RoadmapTask }` — when status becomes `"completed"` AND the task's topic is `quizEligible`, surfaces a "quiz available" flag in the response (does not force navigation — see section 5 of CONTRACTS.md) |
| POST | `/api/v1/roadmap/add-topic` | `{ userId, roadmapId, topicName }` | `{ roadmap: Roadmap }` — re-runs the scheduler to slot in new content without breaking existing days |
| PATCH | `/api/v1/skills/verify` | `{ userId, topicId }` | `{ skillProfile: SkillProfile }` — called by Person B's backend when a quiz is passed; Person A implements and owns this endpoint |

### 1.4 Core logic to implement

**Scheduling algorithm** (`server/src/utils/scheduler.js`) — pure logic, no AI call, must be independently testable:
1. Input: list of topics (with `track`, `estimatedHours`, `prerequisiteTopicIds`), `daysPerWeek`, `hoursPerDay`.
2. Group topics by `track`. Run 3-4 tracks in parallel across the roadmap rather than fully finishing one track before starting the next — this is what produces the varied daily task bundles.
3. Compute total available hours = `totalWeeks * daysPerWeek * hoursPerDay`, and allocate a rough proportion of daily time to each active track.
4. For each day, select one task-sized chunk from each currently-active track (respecting `prerequisiteTopicIds` within a track), producing a 3-5 item task list per day.
5. Insert a lighter buffer/revision day roughly every 7-10 study days.
6. Output: an array of `RoadmapDay` objects with `dayNumber` and `date` assigned, tasks not yet filled with content text.

**Task content generation** (via `llm.service.js`):
1. For each day's selected set of topic-chunks from the scheduler, make one call requesting task text for the whole day's bundle together (not one call per task) — this keeps the day coherent and reduces API calls.
2. Prompt must request strict JSON output: an array of `RoadmapTask`-shaped objects (excluding `id`/`status`, which the backend assigns) for that day.
3. Persist the completed `Roadmap` (with all `RoadmapDay` and `RoadmapTask` objects filled in) to the database in one write.

**Resume parsing** (via `llm.service.js`):
1. Extract raw text from the uploaded PDF/DOCX (use a parsing library, not the LLM, for text extraction).
2. Send extracted text through `llm.service.js` with a prompt requesting strict JSON output: a list of skills/tools/technologies found, each matched against the `Role.topics` list where possible.
3. Return the list to the frontend for the student to review/edit before confirming (do not auto-save without confirmation).

### 1.5 Frontend pages/components
- `client/src/pages/onboarding.jsx` — multi-step: role selection → resume upload or manual skill entry → skill review/edit → time-commitment input → "Generate my roadmap" action with loading state
- `client/src/pages/roadmap.jsx` — day-wise timeline view (grouped by week/month) showing each day's task bundle, completion checkboxes per task, "Add extra topic" action, visual distinction between `completed` and `verified` status
- `client/src/components/roadmap/` — `RoadmapDayCard` (shows all of a day's tasks together), `RoadmapTaskItem`, `RoleSelector`, `ResumeUploader`, `SkillReviewList`, `TimeCommitmentForm`

### 1.6 Week-by-week plan
- Week 1-2: Role/topic seed data (with `track` and `quizEligible` fields) + skill-gap comparison logic
- Week 3-4: Scheduler algorithm with multi-track interleaving (test independently of AI)
- Week 5: LLM integration for resume parsing + per-day task-bundle generation
- Week 6: Onboarding flow + roadmap page UI
- Week 7: Implement `/api/v1/skills/verify` for Person B to call; wire "mark complete" to surface quiz availability
- Week 8: Edge cases, polish, testing

---

## 2. Person B — Quiz System & CS Fundamentals

### 2.1 Responsibility
Verify skills via AI-generated quizzes, but **only on "worthy" topics** (substantial ones like NumPy, Scikit-learn, a full DSA topic area — flagged `quizEligible: true` in the seed data), not after every small task. Also owns the role-agnostic CS fundamentals tracker (DSA, OS, DBMS, CN, OOP).

### 2.2 Data models

**Quiz**
```
id: string
topicId: string
questions: [{
  id: string
  question: string
  options: string[]            // exactly 4 options
  correctOptionIndex: number
}]
questionCount: number           // 15-20, scaled to how substantial the topic is
generatedAt: string (ISO)
```

**QuizAttempt**
```
id: string
userId: string
quizId: string
topicId: string
answers: number[]              // selected option index per question
score: number                  // 0-100
passed: boolean                // true if score >= 80
attemptNumber: number          // 1, 2, or 3 — max 3 total attempts
attemptedAt: string (ISO)
```

**FundamentalsTopic** (fixed seed data, not user-generated)
```
id: string
area: "DSA" | "OOP" | "OS" | "DBMS" | "CN"
name: string
description: string
quizEligible: boolean
capstoneProjectSuggestion: string
```

**FundamentalsProgress**
```
userId: string
topicId: string
status: TaskStatus
```

### 2.3 API endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/v1/quiz/generate/:topicId` | — | `{ quiz: Quiz }` — generates via `llm.service.js` if not cached, else returns cached quiz. Only callable for topics where `quizEligible: true`. |
| POST | `/api/v1/quiz/submit` | `{ userId, quizId, topicId, answers: number[] }` | `{ attempt: QuizAttempt }` — scores it; if `passed`, creates a badge `Certificate` (via Person C's endpoint) and calls Person A's `PATCH /api/v1/skills/verify` |
| GET | `/api/v1/fundamentals` | `?userId=` | `{ areas: [{ area, topics: FundamentalsTopic[], progress: FundamentalsProgress[] }] }` |
| PATCH | `/api/v1/fundamentals/task/:topicId` | `{ userId, status: TaskStatus }` | `{ progress: FundamentalsProgress }` — same completion behavior as roadmap tasks |

### 2.4 Topic-completion & quiz-attempt rules (cross-member — read carefully)

1. Marking a task/topic `"completed"` does **not** force a quiz. If the topic is `quizEligible`, the frontend shows a "Take Quiz" option the student can act on whenever they choose — immediately or later.
2. Quiz rules: **15-20 questions** (scaled to topic size), **80% passing score**, **maximum 3 attempts total**, with a **minimum 10-hour gap** required between attempts. Backend must reject a new attempt request if fewer than 10 hours have passed since the last one, or if `attemptNumber` would exceed 3.
3. On pass (`passed: true`): topic status becomes `verified`; call Person C's certificate endpoint to create a `Certificate` with `type: "badge"`; call Person A's `PATCH /api/v1/skills/verify` with `{ userId, topicId }`.
4. On final failed attempt (3rd attempt, still failed): topic stays `completed` but never becomes `verified` — the student is not blocked from continuing their roadmap.
5. **Do not write directly into another member's database table.** Always go through that member's API endpoint, even internally within the same backend service.
6. Optional/lower-priority: lightweight self-check mini-quizzes on smaller, non-`quizEligible` tasks are allowed as a stretch feature but must never produce a badge — build this only if time allows after everything else in this document is done.

### 2.5 Core logic to implement

**Quiz generation** (via `llm.service.js`):
1. Only triggerable for topics with `quizEligible: true`.
2. Prompt with the topic name and its estimated depth/hours (to help scale question count between 15-20).
3. Require strict JSON output: 15-20 questions, each with exactly 4 options and one `correctOptionIndex`.
4. Cache the generated quiz by `topicId` so repeat requests for the same topic don't re-call the LLM.

**Scoring & attempt limiting:**
1. `score = (correctCount / totalQuestions) * 100`
2. `passed = score >= 80`
3. Before accepting a new attempt: check the student's most recent `QuizAttempt` for that topic — reject with a clear error (`code: "COOLDOWN_ACTIVE"`) if less than 10 hours have passed, or (`code: "MAX_ATTEMPTS_REACHED"`) if 3 attempts already used.
4. On fail, response should include which question indices were wrong (for weak-area feedback) but not reveal correct answers directly.

### 2.6 Frontend pages/components
- `client/src/pages/quiz.jsx` — question flow, submit, pass/fail feedback with weak-area indication, attempt-count and cooldown-timer display
- `client/src/pages/fundamentals.jsx` — progress bars per area, expandable topic list, capstone checklist
- `client/src/components/quiz/` — `QuizQuestion`, `QuizResult`, `AttemptCooldownBanner`
- `client/src/components/fundamentals/` — `FundamentalsAreaCard`, `CapstoneChecklist` (reuse Person A's `RoadmapTaskItem` pattern where possible for consistency)

### 2.7 Week-by-week plan
- Week 1-2: Fundamentals seed data (with `quizEligible` flags) + Quiz/QuizAttempt schema
- Week 3-4: Quiz generation via `llm.service.js` + scoring/attempt-limiting logic
- Week 5: Fundamentals page UI
- Week 6: Quiz page UI + "Take Quiz" optional-trigger wiring
- Week 7: Integrate with Person A's `/skills/verify` and Person C's badge-certificate creation
- Week 8: Polish — cooldown timers, weak-area feedback UI

---

## 3. Person C — Application Tracker & Certificate Vault

### 3.1 Responsibility
Internship application tracking (with Google Sheets export/sync, user-customizable status pipeline) and a certificate/badge vault that stores both quiz-earned badges and manually uploaded course certificates.

### 3.2 Data models

**Application**
```
id: string
userId: string
company: string
role: string
status: string              // free string — defaults to Applied/OA/Interview/Offer/Rejected, user can add custom values
appliedDate: string (ISO date)
lastUpdated: string (ISO date)
notes: string
```

**Certificate**
```
id: string
userId: string
type: CertificateType          // "badge" | "uploaded"
title: string                  // topic name for badges, certificate title for uploads
issuer: string                 // "Platform-verified" for badges, actual issuer for uploads
dateIssued: string (ISO date)
tags: string[]
fileUrl: string | null         // null for badges, object storage URL for uploads
quizScore: number | null       // set only for badges
```

### 3.3 API endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/applications` | `?userId=&status=` | `{ applications: Application[] }` |
| POST | `/api/v1/applications` | `{ userId, company, role, status, appliedDate, notes }` | `{ application: Application }` |
| PATCH | `/api/v1/applications/:id` | `{ status?, notes?, ... }` | `{ application: Application }` |
| DELETE | `/api/v1/applications/:id` | — | `{ success: true }` |
| POST | `/api/v1/applications/sync-sheets` | `{ userId }` | `{ sheetUrl: string }` — exports current applications to a Google Sheet via OAuth |
| POST | `/api/v1/certificates/upload` | multipart form: file + `{ userId, title, issuer, dateIssued, tags }` | `{ certificate: Certificate }` — always creates `type: "uploaded"` |
| POST | `/api/v1/certificates/badge` | `{ userId, topicId, title, quizScore }` | `{ certificate: Certificate }` — internal endpoint called by Person B on quiz pass; creates `type: "badge"`, no file |
| GET | `/api/v1/certificates` | `?userId=&tag=&type=` | `{ certificates: Certificate[] }` |
| DELETE | `/api/v1/certificates/:id` | — | `{ success: true }` — uploaded certificates only; badges should not be deletable |

### 3.4 Core logic to implement

**Application tracker:** standard CRUD. `status` is stored as a free string; pre-populate the five default values as suggestions in the UI, but do not restrict the field to an enum, since users can add their own stages.

**Google Sheets sync:**
1. Use the shared Google Cloud project (same one Person D uses for login OAuth) with Sheets API scope added.
2. On sync request, create or update a Google Sheet for that user (store the `sheetId` on a mapping table so repeat syncs update the same sheet rather than duplicating).
3. Write applications as rows with headers: Company, Role, Status, Applied Date, Last Updated, Notes.

**Certificate/badge handling:**
1. Uploaded certificates: accept multipart file upload, upload the raw file to object storage (S3 or Cloudinary — your choice), store only the returned URL plus metadata in the database.
2. Badges: created via the internal `/api/v1/certificates/badge` endpoint called by Person B, no file involved — just a database record.
3. Vault UI should visually distinguish badges from uploaded certificates (e.g., a badge icon vs. a document thumbnail).

### 3.5 Frontend pages/components
- `client/src/pages/applications.jsx` — table or kanban view, add/edit modal, status filter (including any custom statuses a user has added), "Sync to Sheets" button
- `client/src/pages/vault.jsx` — grid view showing both badges and uploaded certificates, upload (drag-and-drop), tag/type filter sidebar, click-to-preview
- `client/src/components/tracker/` — `ApplicationTable` or `ApplicationKanban`, `ApplicationFormModal`, `StatusBadge`, `CustomStatusInput`
- `client/src/components/vault/` — `CertificateCard` (handles both badge and uploaded styling), `CertificateUploader`, `TagFilterSidebar`

### 3.6 Week-by-week plan
- Week 1-2: Application model + full CRUD tracker (no dependencies, can start immediately)
- Week 3: Certificate model (both types) + object storage integration for uploads
- Week 4: Vault page UI (badges + uploads)
- Week 5: Application Tracker page UI, including custom-status support
- Week 6-7: Google Sheets API + OAuth integration
- Week 8: Reminders for stale applications, polish

---

## 4. Person D — Auth, Profile, Dashboard, Landing Page & Deployment (Integration Lead)

### 4.1 Responsibility
The shared foundation every other member's feature depends on: authentication, user profile, the aggregating dashboard, the landing/login pages, and all deployment/DevOps ownership — including running the shared seed script against the shared MongoDB Atlas dev database.

### 4.2 Data models

**User**
```
User {
  id: string
  name: string
  email: string
  passwordHash: string | null     // null if authProvider is "google"
  authProvider: "local" | "google"
  targetRoleId: string | null     // set during onboarding, changeable later from Settings
  createdAt: string (ISO)
  updatedAt: string (ISO)
}
```

### 4.3 API endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/v1/auth/signup` | `{ email, password, name }` | `{ token: string, user: User }` |
| POST | `/api/v1/auth/login` | `{ email, password }` | `{ token: string, user: User }` |
| GET | `/api/v1/auth/google` | — | redirects to Google OAuth consent screen |
| GET | `/api/v1/auth/google/callback` | — | exchanges code, creates/finds User, redirects to frontend with token |
| GET | `/api/v1/profile` | (auth required) | `{ user: User }` |
| PATCH | `/api/v1/profile` | `{ name?, targetRoleId? }` | `{ user: User }` — used both at onboarding and for later target-role changes |
| GET | `/api/v1/dashboard` | `?userId=` | `{ roadmapProgress: number, fundamentalsProgress: number, verifiedSkillCount: number, applicationCount: number, certificateCount: number, todaysTasks: RoadmapTask[] }` — aggregates from Persons A, B, C's data |

### 4.4 Core logic to implement

**Auth middleware** (`server/src/middleware/auth.middleware.js`):
1. Read `Authorization: Bearer <token>` header.
2. Verify JWT using `JWT_SECRET`; tokens are valid for 7 days.
3. On success, attach `req.user = { userId, email }` and call `next()`.
4. On failure/expiry, respond `401` with `code: "SESSION_EXPIRED"` using the standard error shape from section 0.3 — frontend shows a clear re-login prompt, not a silent redirect.
5. This middleware is imported and applied to every protected route across all four members' route files — ship this early (target: end of Week 4) since everyone else's routes depend on it.

**Google OAuth:** standard OAuth2 code exchange flow; on first login, create a `User` row with `authProvider: "google"` and no `passwordHash`. Uses the same Google Cloud project as Person C's Sheets integration.

**Dashboard aggregation:** calls Person A's `GET /api/v1/roadmap/:userId`, Person B's `GET /api/v1/fundamentals`, and Person C's `GET /api/v1/applications` / `GET /api/v1/certificates` internally, then computes summary numbers. This endpoint cannot be finished until those three members' endpoints exist and match this spec.

**Seed script ownership:** Person D builds and runs `server/src/seed/index.js`, importing each member's contributed seed data (roles/topics from Person A, fundamentals from Person B, the `dev-user-1` record) against the shared Atlas database.

### 4.5 Frontend pages/components
- `client/src/pages/index.jsx` — landing page (value prop, how-it-works, CTA)
- `client/src/pages/login.jsx`, `client/src/pages/signup.jsx`
- `client/src/pages/settings.jsx` — editable profile, target-role change, connected accounts, regenerate roadmap option
- `client/src/pages/dashboard.jsx` — today's tasks widget, progress bars, quick stats, shortcut nav, recent activity feed
- `client/src/context/AuthContext.jsx` — holds token/user state, handles session-expiry prompt, provides `useAuth()` hook for all other members' pages

### 4.6 DevOps/deployment responsibilities
1. Week 1: Set up GitHub repo, branch protection on `main`, create `dev` branch, deploy an empty skeleton (frontend + backend both live) to prove the pipeline before real features exist. Pull requests are used for all merges but do not require mandatory review given team size.
2. Set up CI (`.github/workflows/ci.yml`) — lint/test on PRs into `dev`.
3. Own the deployed environment: frontend on Vercel/Netlify, backend on Render/Railway, MongoDB Atlas, object storage bucket (per Person C's provider choice).
4. Own environment variable configuration on the deployed platforms (must match `.env.example` names exactly, including the provider-agnostic `LLM_API_KEY` / `LLM_PROVIDER` pair).
5. Final integration pass in Week 8: merge all branches into `dev`, test cross-feature flows, promote to `main` for production deploy, verify OAuth redirect URLs are updated to production URLs.

### 4.7 Week-by-week plan
- Week 1: Repo setup + empty deployed skeleton + seed script framework
- Week 1-2: User model + JWT auth
- Week 3: Google OAuth
- Week 4: Auth middleware shipped for others to use
- Week 5: Landing + Login/Signup pages
- Week 6: Profile & Settings page (including target-role change)
- Week 7: Dashboard (final integration point)
- Week 8: Full integration testing + production deployment

---

## 5. Cross-Cutting Rules for All Agents

1. Never write directly into a table owned by another member — always call their API endpoint, even for internal server-to-server calls.
2. Never invent a field name, enum value, or route path not listed in this file — if something's missing, stop and flag it rather than guessing.
3. Always use the standard response shape from section 0.3, including both `code` and `message` on errors.
4. Always use `"dev-user-1"` as the placeholder `userId` until real auth is wired in.
5. Never call an LLM provider SDK directly — always go through `server/src/services/llm.service.js`. Do not hardcode "Anthropic" or "Groq" anywhere in feature code; the provider is chosen later and read from `LLM_PROVIDER` at runtime.
6. Quizzes are only for `quizEligible` topics, never forced immediately on task completion, capped at 3 attempts with a 10-hour gap, and scored at an 80% pass threshold.
7. A roadmap day always contains a bundle of 3-5 varied tasks across different active tracks — never a single isolated task per day.