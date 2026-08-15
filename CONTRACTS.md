# CONTRACTS.md

This file is the single source of truth for shared decisions across the project. Every team member (and any AI coding agent working on their behalf) must follow these exactly. If something needs to change after this is finalized, flag it to the whole team before editing — don't silently change a contract everyone else is already building against.

---

## 1. User Model

```
User {
  id: string
  name: string
  email: string
  passwordHash: string | null      // null if signed in with Google
  authProvider: "local" | "google"
  targetRoleId: string | null      // set during onboarding, changeable later
  createdAt: string (ISO)
  updatedAt: string (ISO)
}
```

- Target role is chosen during onboarding but can be changed anytime afterward from Settings.
- Login supports both email/password and Google Sign-In.

---

## 2. API Conventions

- All routes prefixed `/api/v1/`
- Plural, noun-based paths (e.g., `/api/v1/applications`, `/api/v1/certificates`)
- Standard verbs: `GET` fetch, `POST` create, `PATCH` update, `DELETE` remove

---

## 3. Response Format

**Success:**
```json
{ "success": true, "data": { } }
```

**Error:**
```json
{ "success": false, "error": { "code": "INVALID_EMAIL", "message": "That email is already registered." } }
```

- Every error includes both a short `code` (for the frontend to map to a custom UI message or icon) and a plain `message` (usable directly as a fallback).
- Standard status codes: `200` success, `201` created, `400` validation error, `401` unauthorized, `403` forbidden, `404` not found, `500` server error.

---

## 4. Data Shapes

### 4.1 Roadmap

A day bundles **multiple varied tasks**, not one task per day — this is a deliberate UX decision so a day feels like a real study session (e.g., a DSA problem + an OS topic + an aptitude drill + a tool walkthrough), not a single isolated to-do.

```
Roadmap {
  id: string
  userId: string
  targetRoleId: string
  startDate: string (ISO date)
  totalDays: number
  daysPerWeek: number
  hoursPerDay: number
  days: RoadmapDay[]
}

RoadmapDay {
  dayNumber: number
  date: string (ISO date)
  tasks: RoadmapTask[]        // typically 3-5 tasks, pulled from different active topic-tracks
}

RoadmapTask {
  id: string
  topicId: string
  taskName: string
  description: string
  estimatedMinutes: number
  status: "not_started" | "in_progress" | "completed" | "verified"
}
```

**Scheduling implication:** the scheduler must interleave multiple topic-tracks in parallel (e.g., DSA + core subject + aptitude + tool/library) rather than fully completing one topic before starting the next. Each day's task set is generated together so it reads like a coherent daily plan, not four disconnected reminders.

### 4.2 Application Tracker

```
Application {
  id: string
  userId: string
  company: string
  role: string
  status: string          // default set below, but user-extendable
  appliedDate: string (ISO date)
  lastUpdated: string (ISO date)
  notes: string
}
```

- Default status pipeline: `Applied → OA → Interview → Offer → Rejected`
- Users can add their own custom statuses beyond the default set (like customizing columns in a spreadsheet) — store `status` as a free string per user rather than a hard-coded enum, but pre-fill the five defaults so most users never need to add their own.

### 4.3 Certificates & Badges

Two distinct sources feed this section:
1. **Badges** — auto-generated when a user passes a topic quiz (see 4.4)
2. **Uploaded certificates** — course completions, hackathons, etc., uploaded manually by the user

```
Certificate {
  id: string
  userId: string
  type: "badge" | "uploaded"
  title: string                 // topic name for badges, certificate title for uploads
  issuer: string                // "Platform-verified" for badges, actual issuer for uploads
  dateIssued: string (ISO date)
  tags: string[]
  fileUrl: string | null        // null for badges (no file), object storage URL for uploads
  quizScore: number | null      // only set for badges
}
```

### 4.4 Quiz

Quizzes are **not** given after every small task — only after a "worthy" topic is completed (e.g., NumPy, Scikit-learn, a full DSA topic area), since a quiz after every tiny task would hurt the experience. Smaller day-to-day tasks can optionally have lightweight self-check mini-quizzes, but those do **not** produce badges and are a lower priority (build only if time allows).

```
Quiz {
  id: string
  topicId: string
  questions: [{
    id: string
    question: string
    options: string[]          // exactly 4 options
    correctOptionIndex: number
  }]
  questionCount: number         // 15-20, scaled by topic size
  generatedAt: string (ISO)
}

QuizAttempt {
  id: string
  userId: string
  quizId: string
  topicId: string
  answers: number[]
  score: number                 // 0-100
  passed: boolean                // true if score >= 80
  attemptNumber: number          // 1, 2, or 3
  attemptedAt: string (ISO)
}
```

**Rules:**
- Passing score: **80%**
- Question count: **15-20**, scaled to how substantial the topic is
- Quiz is triggered only on "worthy" (substantial) topics — defined by Person A/B tagging certain topics in the seed data as `quizEligible: true`
- Student can choose to take the quiz immediately or **later** — marking a topic complete does not force an immediate quiz
- **Maximum 3 attempts total**, with a **10-hour minimum gap** between attempts
- On pass: generates a `Certificate` with `type: "badge"`

---

## 5. Topic Completion & Quiz Flow

1. Student marks a "worthy" topic complete → task status becomes `completed`, no forced redirect.
2. A "Take Quiz" prompt appears on the roadmap/fundamentals page for that topic, which the student can act on whenever they choose.
3. On quiz pass (≥80%): topic status becomes `verified`, a badge `Certificate` is created, and the skill is marked verified on the user's `SkillProfile`.
4. On quiz fail: attempt is logged; if `attemptNumber < 3`, student can retry after a 10-hour cooldown; after 3 failed attempts, the topic stays `completed` but not `verified` (student can move on and doesn't get permanently blocked).
5. Cross-member rule unchanged: whoever owns the quiz system updates another member's data only through that member's API endpoint, never by writing into their table directly.

---

## 6. Auth & Sessions

- JWT payload: `{ userId, email, iat, exp }`
- Token passed as `Authorization: Bearer <token>`
- **Session length: 7 days** before requiring re-login
- **On expiry:** show a clear "Your session expired — please log in again" prompt rather than a silent/unexplained redirect
- **Local dev placeholder:** every member uses the exact string `"dev-user-1"` as `userId` before real auth is wired in. This user is seeded once into the shared dev database (see section 8) so everyone is testing against the same record.

---

## 7. Shared Accounts & Secrets

| Item | Owner | Notes |
|---|---|---|
| Google Cloud project (Sign-In + Sheets API) | *Open — assign at meeting* | Must be one shared project, used by both Person D (login) and Person C (Sheets sync) |
| Anthropic API key | *Open — assign at meeting* | Used for roadmap generation, resume parsing, and quiz generation — one shared key |
| Object storage (S3 or Cloudinary) | Person C | Person C decides which provider |
| MongoDB Atlas (shared dev database) | Person D | Person D sets up and shares connection string securely (not committed to Git) |

- Each member is individually responsible for the parts of their own feature that need a service account, unless listed above as shared.
- No credentials are ever committed to the repo — use `.env` files locally and the hosting platform's environment variable settings in production.

---

## 8. Git & Workflow

- Nobody pushes directly to `main` — all work happens on feature branches, merged via Pull Request.
- PR review before merge: **not required** for this project, given team size — merge once your own testing passes, but keep PRs small enough that a teammate *could* skim it if they want to.
- No fixed commit message format required — just keep messages reasonably descriptive.

---

## 9. Local Development Setup

- **Shared MongoDB Atlas database** — everyone connects to the same cloud dev database rather than running local copies. This keeps everyone looking at identical data, but means bad test data from one person can affect others — be careful running destructive tests against shared data.
- **Seed data ownership:** Person D owns and runs the seed script (since they own the database setup). Each member contributes their own portion into one shared seed file before Week 3:
  - Person A: sample roles + topics (mark `quizEligible: true` on substantial topics)
  - Person B: fundamentals topics (DSA/OOP/OS/DBMS/CN)
  - Person D: the single `"dev-user-1"` test user record
  - Person C: no seed data needed (applications/certificates are created live during testing)

---

## 10. Scope for Version 1

Everything currently specified in `PROJECT_TASKS.md` is in scope for the first version — no features are being deferred at this time. If scope needs to shrink later due to time constraints, that's a team discussion, not a unilateral cut.

---

## Open Items — Decide at the Day-0 Meeting

- [ ] Who creates and owns the shared Google Cloud project (Sign-In + Sheets)?
- [ ] Who creates and owns the shared Anthropic API key?
- [ ] Confirm object storage provider (Person C's call — S3 or Cloudinary)
- [ ] Confirm exact `quizEligible` topics list for Phase 1 (which topics get quizzes vs. which are just tracked tasks)