# PROJECT_TASKS.md

## Purpose of this file

This file is the single source of truth for what each team member is building. It's written to be detailed enough that an AI coding agent (Claude Code, Cursor, etc.) can read a member's section and implement their feature correctly without needing to guess field names, route paths, or business logic. Every member should point their agent at this file (and `shared/types.ts` / `CONTRACTS.md` once filled in) before generating any code.

**Rule for agents reading this file:** Do not invent field names, route paths, or response shapes that differ from what's specified here. If something genuinely isn't covered, flag it instead of guessing, so the team can add it to this file.

---

## 0. Shared Contracts (applies to every member — read this first)

### 0.1 Tech stack
- Frontend: React + Tailwind CSS
- Backend: Node.js + Express
- Database: MongoDB 
- Object storage: AWS S3 or Cloudinary
- AI: Anthropic API (`@anthropic-ai/sdk`) or Member 1's concern
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
{ "success": false, "error": { "message": "string", "code": "string" } }
```

Standard HTTP status codes: `200` success, `201` created, `400` validation error, `401` unauthorized, `403` forbidden, `404` not found, `500` server error.

### 0.4 Auth contract
- JWT payload shape: `{ "userId": "string", "email": "string", "iat": number, "exp": number }`
- Token passed as `Authorization: Bearer <token>` header
- All protected routes go through `server/src/middleware/auth.middleware.js`, which attaches `req.user = { userId, email }`
- **Placeholder user ID for local development before Auth ships:** use the fixed string `"dev-user-1"` everywhere a `userId` is needed. Do not invent your own placeholder — everyone must use this exact value so seed data lines up.

### 0.5 Shared enums (use these exact string values, nowhere else)
```
ApplicationStatus = "Applied" | "OA" | "Interview" | "Offer" | "Rejected"
TaskStatus        = "not_started" | "in_progress" | "completed" | "verified"
TopicSource        = "resume" | "manual" | "quiz"
TopicType           = "roadmap" | "fundamentals"
```

### 0.6 Environment variables (exact names — put in root `.env.example` files)
```
# server/.env
DATABASE_URL=
JWT_SECRET=
ANTHROPIC_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
S3_BUCKET_NAME=
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

---

## 1. Person A — Roadmap Engine

### 1.1 Responsibility
Turn a target role + the student's current skills into a persisted, day-wise learning roadmap spanning ~6-8 months, adjustable by days/week and hours/day available.

### 1.2 Data models

**Role**
```
id: string
name: string                  // e.g. "AI/ML Engineer"
description: string
topics: [{
  id: string
  name: string
  prerequisiteTopicIds: string[]
  estimatedHours: number
}]
```

**SkillProfile**
```
id: string
userId: string
skills: [{
  topicId: string
  verified: boolean            // true only after quiz pass (Person B writes this)
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
tasks: RoadmapTask[]
```

**RoadmapTask**
```
id: string
topicId: string
title: string
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
| PATCH | `/api/v1/roadmap/task/:taskId` | `{ status: TaskStatus }` | `{ task: RoadmapTask }` — triggers the topic-completion contract (see section 2) when status becomes `"completed"` |
| POST | `/api/v1/roadmap/add-topic` | `{ userId, roadmapId, topicName }` | `{ roadmap: Roadmap }` — re-runs the scheduler to slot in new content without breaking existing days |

### 1.4 Core logic to implement

**Scheduling algorithm** (`server/src/utils/scheduler.js`) — pure logic, no AI call, must be independently testable:
1. Input: list of topics (with `estimatedHours`), `daysPerWeek`, `hoursPerDay`.
2. Compute total available hours = `totalWeeks * daysPerWeek * hoursPerDay`.
3. Distribute topics across days in prerequisite order, respecting `prerequisiteTopicIds`.
4. Insert a buffer/revision day roughly every 7-10 study days.
5. Output: an array of `RoadmapDay` objects with `dayNumber` and `date` assigned, tasks not yet filled with content.

**Task content generation** (uses Anthropic API or any free API):
1. For each scheduled day/topic slot from the scheduler, call the Anthropic API with the topic name, estimated time for that day, and student's stated experience level.
2. Prompt must request strict JSON output matching the `RoadmapTask` shape (excluding `id`/`status`, which the backend assigns).
3. Persist the completed `Roadmap` (with all `RoadmapDay` and `RoadmapTask` objects filled in) to the database in one write.

**Resume parsing** (uses Anthropic API or any free API):
1. Extract raw text from the uploaded PDF/DOCX (use a parsing library, not the LLM, for text extraction).
2. Send extracted text to the Anthropic API with a prompt requesting strict JSON output: a list of skills/tools/technologies found, each matched against the `Role.topics` list where possible.
3. Return the list to the frontend for the student to review/edit before confirming (do not auto-save without confirmation).

### 1.5 Frontend pages/components
- `client/src/pages/onboarding.jsx` — multi-step: role selection → resume upload or manual skill entry → skill review/edit → time-commitment input → "Generate my roadmap" action with loading state
- `client/src/pages/roadmap.jsx` — day-wise timeline view (grouped by week/month), completion checkboxes, "Add extra topic" action, visual distinction between `completed` and `verified` status
- `client/src/components/roadmap/` — `RoadmapDayCard`, `RoadmapTaskItem`, `RoleSelector`, `ResumeUploader`, `SkillReviewList`, `TimeCommitmentForm`

### 1.6 Week-by-week plan
- Week 1-2: Role/topic seed data + skill-gap comparison logic
- Week 3-4: Scheduler algorithm (test independently of AI)
- Week 5: Anthropic API integration (resume parsing + task generation)
- Week 6: Onboarding flow + roadmap page UI
- Week 7: Wire "mark complete" to Person B's quiz trigger
- Week 8: Edge cases, polish, testing

---

## 2. Person B — Quiz System & CS Fundamentals

### 2.1 Responsibility
Verify skills via short AI-generated quizzes when a topic is marked complete, and maintain the role-agnostic CS fundamentals tracker (DSA, OS, DBMS, CN, OOP).

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
passed: boolean                // true if score >= 70
attemptedAt: string (ISO)
```

**FundamentalsTopic** (fixed seed data, not user-generated)
```
id: string
area: "DSA" | "OOP" | "OS" | "DBMS" | "CN"
name: string
description: string
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
| POST | `/api/v1/quiz/generate/:topicId` | — | `{ quiz: Quiz }` — generates via Anthropic API if not cached, else returns cached quiz |
| POST | `/api/v1/quiz/submit` | `{ userId, quizId, topicId, answers: number[] }` | `{ attempt: QuizAttempt }` — scores it, and if `passed`, calls Person A's skill-verification update (see 2.4) |
| GET | `/api/v1/fundamentals` | `?userId=` | `{ areas: [{ area, topics: FundamentalsTopic[], progress: FundamentalsProgress[] }] }` |
| PATCH | `/api/v1/fundamentals/task/:topicId` | `{ userId, status: TaskStatus }` | `{ progress: FundamentalsProgress }` — same completion trigger as roadmap tasks |

### 2.4 Topic-completion contract (cross-member — read carefully)

When a task (roadmap or fundamentals) is marked `"completed"`:
1. The owning route (`roadmap.controller.js` for Person A, `fundamentals.controller.js` for Person B) calls a shared internal function `triggerQuizForTopic({ userId, topicId, topicType })`.
2. This immediately generates (or fetches cached) the quiz for that `topicId` and returns it to the frontend, which redirects the student into the Quiz page.
3. On quiz pass (`POST /api/v1/quiz/submit` returns `passed: true`), Person B's backend calls **Person A's** endpoint `PATCH /api/v1/skills/verify` (Person A must implement this) with `{ userId, topicId }` to set `verified: true` on the matching entry in `SkillProfile.skills`.
4. **Do not write directly into another member's database table.** Always go through that member's API endpoint, even internally within the same backend service.

### 2.5 Core logic to implement

**Quiz generation** (uses Anthropic API):
1. Prompt with the topic name and a difficulty level derived from the role/fundamentals context.
2. Require strict JSON output: exactly 4-6 questions, each with exactly 4 options and one `correctOptionIndex`.
3. Cache the generated quiz by `topicId` so repeat requests for the same topic don't re-call the LLM (check for an existing `Quiz` row first).

**Scoring:**
1. Compare submitted `answers` against `correctOptionIndex` for each question.
2. `score = (correctCount / totalQuestions) * 100`
3. `passed = score >= 70`
4. On fail, response should include which question indices were wrong (for weak-area feedback) but not reveal correct answers directly — frontend uses this to suggest review before retry.

### 2.6 Frontend pages/components
- `client/src/pages/quiz.jsx` — question flow (one at a time or single scrollable form), submit, pass/fail feedback with weak-area indication
- `client/src/pages/fundamentals.jsx` — progress bars per area, expandable topic list, capstone checklist
- `client/src/components/quiz/` — `QuizQuestion`, `QuizResult`
- `client/src/components/fundamentals/` — `FundamentalsAreaCard`, `CapstoneChecklist` (reuse Person A's `RoadmapTaskItem` pattern where possible for consistency)

### 2.7 Week-by-week plan
- Week 1-2: Fundamentals seed data + Quiz/QuizAttempt schema
- Week 3-4: Quiz generation (Anthropic API) + scoring logic
- Week 5: Fundamentals page UI
- Week 6: Quiz page UI + completion → quiz launch wiring
- Week 7: Integrate with Person A's roadmap completion trigger
- Week 8: Retry/cooldown logic, polish

---

## 3. Person C — Application Tracker & Certificate Vault

### 3.1 Responsibility
Internship application tracking (with Google Sheets export/sync) and a certificate/achievement upload-and-organize vault.

### 3.2 Data models

**Application**
```
id: string
userId: string
company: string
role: string
status: ApplicationStatus
appliedDate: string (ISO date)
lastUpdated: string (ISO date)
notes: string
```

**Certificate**
```
id: string
userId: string
title: string
issuer: string
dateIssued: string (ISO date)
tags: string[]
fileUrl: string                // object storage URL, not the raw file
uploadedAt: string (ISO)
```

### 3.3 API endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/applications` | `?userId=&status=` | `{ applications: Application[] }` |
| POST | `/api/v1/applications` | `{ userId, company, role, status, appliedDate, notes }` | `{ application: Application }` |
| PATCH | `/api/v1/applications/:id` | `{ status?, notes?, ... }` | `{ application: Application }` |
| DELETE | `/api/v1/applications/:id` | — | `{ success: true }` |
| POST | `/api/v1/applications/sync-sheets` | `{ userId }` | `{ sheetUrl: string }` — exports current applications to a Google Sheet via OAuth |
| POST | `/api/v1/certificates/upload` | multipart form: file + `{ userId, title, issuer, dateIssued, tags }` | `{ certificate: Certificate }` |
| GET | `/api/v1/certificates` | `?userId=&tag=&category=` | `{ certificates: Certificate[] }` |
| DELETE | `/api/v1/certificates/:id` | — | `{ success: true }` |

### 3.4 Core logic to implement

**Application tracker:** standard CRUD, no AI involved. Enforce `ApplicationStatus` enum values exactly as defined in section 0.5.

**Google Sheets sync:**
1. Use the shared Google Cloud project (same one Person D uses for login OAuth) with Sheets API scope added.
2. On sync request, create or update a Google Sheet for that user (store the `sheetId` on the user's profile or a separate mapping table so repeat syncs update the same sheet rather than creating duplicates).
3. Write applications as rows with headers: Company, Role, Status, Applied Date, Last Updated, Notes.

**Certificate upload:**
1. Accept multipart file upload, upload the raw file to S3/Cloudinary, store only the returned URL plus metadata in the database — never store the raw file in the primary database.
2. Support filtering by `tag` and `category` (category can be inferred from tags or a separate field — confirm with team if a fixed category list is wanted).

### 3.5 Frontend pages/components
- `client/src/pages/applications.jsx` — table or kanban view, add/edit modal, status filter, "Sync to Sheets" button
- `client/src/pages/vault.jsx` — grid view with thumbnails, upload (drag-and-drop), tag filter sidebar, click-to-preview
- `client/src/components/tracker/` — `ApplicationTable` or `ApplicationKanban`, `ApplicationFormModal`, `StatusBadge`
- `client/src/components/vault/` — `CertificateCard`, `CertificateUploader`, `TagFilterSidebar`

### 3.6 Week-by-week plan
- Week 1-2: Application model + full CRUD tracker (no dependencies, can start immediately)
- Week 3: Certificate model + object storage integration
- Week 4: Vault page UI
- Week 5: Application Tracker page UI
- Week 6-7: Google Sheets API + OAuth integration
- Week 8: Reminders for stale applications, polish

---

## 4. Person D — Auth, Profile, Dashboard, Landing Page & Deployment (Integration Lead)

### 4.1 Responsibility
The shared foundation every other member's feature depends on: authentication, user profile, the aggregating dashboard, the landing/login pages, and all deployment/DevOps ownership.

### 4.2 Data models

**User**
```
id: string
email: string
passwordHash: string | null     // null if authProvider is "google"
authProvider: "local" | "google"
name: string
targetRoleId: string | null
createdAt: string (ISO)
updatedAt: string (ISO)
```

### 4.3 API endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/v1/auth/signup` | `{ email, password, name }` | `{ token: string, user: User }` |
| POST | `/api/v1/auth/login` | `{ email, password }` | `{ token: string, user: User }` |
| GET | `/api/v1/auth/google` | — | redirects to Google OAuth consent screen |
| GET | `/api/v1/auth/google/callback` | — | exchanges code, creates/finds User, redirects to frontend with token |
| GET | `/api/v1/profile` | (auth required) | `{ user: User }` |
| PATCH | `/api/v1/profile` | `{ name?, targetRoleId? }` | `{ user: User }` |
| GET | `/api/v1/dashboard` | `?userId=` | `{ roadmapProgress: number, fundamentalsProgress: number, verifiedSkillCount: number, applicationCount: number, certificateCount: number, todaysTasks: RoadmapTask[] }` — aggregates from Persons A, B, C's data |

### 4.4 Core logic to implement

**Auth middleware** (`server/src/middleware/auth.middleware.js`):
1. Read `Authorization: Bearer <token>` header.
2. Verify JWT using `JWT_SECRET`.
3. On success, attach `req.user = { userId, email }` and call `next()`.
4. On failure, respond `401` using the standard error shape from section 0.3.
5. This middleware is imported and applied to every protected route across all four members' route files — ship this early (target: end of Week 4) since everyone else's routes depend on it.

**Google OAuth:** standard OAuth2 code exchange flow; on first login, create a `User` row with `authProvider: "google"` and no `passwordHash`.

**Dashboard aggregation:** calls Person A's `GET /api/v1/roadmap/:userId`, Person B's `GET /api/v1/fundamentals`, and Person C's `GET /api/v1/applications` / `GET /api/v1/certificates` internally, then computes summary numbers. This endpoint cannot be finished until those three members' endpoints exist and match this spec.

### 4.5 Frontend pages/components
- `client/src/pages/index.jsx` — landing page (value prop, how-it-works, CTA)
- `client/src/pages/login.jsx`, `client/src/pages/signup.jsx`
- `client/src/pages/settings.jsx` — editable profile, connected accounts, regenerate roadmap option
- `client/src/pages/dashboard.jsx` — today's tasks widget, progress bars, quick stats, shortcut nav, recent activity feed
- `client/src/context/AuthContext.jsx` — holds token/user state, provides `useAuth()` hook for all other members' pages

### 4.6 DevOps/deployment responsibilities
1. Week 1: Set up GitHub repo, branch protection on `main`, create `dev` branch, deploy an empty skeleton (frontend + backend both live) to prove the pipeline before real features exist.
2. Set up CI (`.github/workflows/ci.yml`) — lint/test on PRs into `dev`.
3. Own the deployed environment: frontend on Vercel/Netlify, backend on Render/Railway, database on managed Postgres/Atlas, object storage bucket.
4. Own environment variable configuration on the deployed platforms (must match `.env.example` names exactly).
5. Final integration pass in Week 8: merge all branches into `dev`, test cross-feature flows, promote to `main` for production deploy, verify OAuth redirect URLs are updated to production URLs.

### 4.7 Week-by-week plan
- Week 1: Repo setup + empty deployed skeleton
- Week 1-2: User model + JWT auth
- Week 3: Google OAuth
- Week 4: Auth middleware shipped for others to use
- Week 5: Landing + Login/Signup pages
- Week 6: Profile & Settings page
- Week 7: Dashboard (final integration point)
- Week 8: Full integration testing + production deployment

---

## 5. Cross-Cutting Rules for All Agents

1. Never write directly into a table owned by another member — always call their API endpoint, even for internal server-to-server calls.
2. Never invent a field name, enum value, or route path not listed in this file — if something's missing, stop and flag it rather than guessing.
3. Always use the standard response shape from section 0.3, with no exceptions.
4. Always use `"dev-user-1"` as the placeholder `userId` until real auth is wired in — do not hardcode a different placeholder.
5. Match exact enum string values from section 0.5 — do not use different casing or synonyms (e.g., not `"In Progress"`, use `"in_progress"`).