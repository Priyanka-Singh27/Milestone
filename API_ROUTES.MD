# API_ROUTES.md

A running, plain-English reference of every API endpoint in the project. Update this whenever a route is added or changed — this is the fastest way for a teammate (or their agent) to see what's available without digging through someone else's route files.

All routes are prefixed `/api/v1/`. All responses follow the standard shape from `CONTRACTS.md`:
```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

---

## Auth & Profile (Person D)

| Method | Path | What it does | Auth required? |
|---|---|---|---|
| POST | `/api/v1/auth/signup` | Creates a new account with email/password | No |
| POST | `/api/v1/auth/login` | Logs in with email/password, returns a token | No |
| GET | `/api/v1/auth/google` | Starts Google Sign-In, redirects to Google | No |
| GET | `/api/v1/auth/google/callback` | Google redirects back here after login; creates/finds the user, sends them into the app with a token | No |
| GET | `/api/v1/profile` | Gets the logged-in user's profile info | Yes |
| PATCH | `/api/v1/profile` | Updates profile info (name, target role) — also used when a user changes their target role later | Yes |
| GET | `/api/v1/dashboard` | Gets the summary numbers for the Dashboard page (progress %, counts) — pulls from Roadmap, Fundamentals, Applications, and Certificates | Yes |

---

## Roles, Skills & Roadmap (Person A)

| Method | Path | What it does | Auth required? |
|---|---|---|---|
| GET | `/api/v1/roles` | Lists/searches all available target roles (e.g., AI/ML Engineer, SDE) | Yes |
| POST | `/api/v1/skills/extract` | Uploads a resume, gets back a list of skills the AI found in it | Yes |
| POST | `/api/v1/skills/gap` | Compares a user's current skills against a target role, returns what's missing | Yes |
| PATCH | `/api/v1/skills/verify` | Marks a specific skill as "verified" — called internally by the Quiz system when a quiz is passed, not called directly by the frontend | Yes (internal) |
| POST | `/api/v1/roadmap/generate` | Creates a brand-new day-wise roadmap for a user, based on their skill gap and time availability | Yes |
| GET | `/api/v1/roadmap/:userId` | Fetches a user's current roadmap | Yes |
| PATCH | `/api/v1/roadmap/task/:taskId` | Marks a single day's task as complete/in-progress/etc. If the topic is quiz-eligible, flags that a quiz is now available | Yes |
| POST | `/api/v1/roadmap/add-topic` | Adds an extra topic mid-journey and reshuffles the schedule to fit it in | Yes |

---

## Quiz & CS Fundamentals (Person B)

| Method | Path | What it does | Auth required? |
|---|---|---|---|
| POST | `/api/v1/quiz/generate/:topicId` | Generates (or returns a cached) quiz for a specific topic — only works for topics marked "quiz-eligible" | Yes |
| POST | `/api/v1/quiz/submit` | Submits quiz answers, returns the score and pass/fail. On pass, triggers a badge (Person C) and marks the skill verified (Person A) | Yes |
| GET | `/api/v1/fundamentals` | Lists the fixed CS Fundamentals curriculum (DSA/OOP/OS/DBMS/CN) along with the user's progress | Yes |
| PATCH | `/api/v1/fundamentals/task/:topicId` | Marks a fundamentals topic complete — same behavior as a roadmap task | Yes |

---

## Applications & Certificates (Person C)

| Method | Path | What it does | Auth required? |
|---|---|---|---|
| GET | `/api/v1/applications` | Lists a user's internship applications (can filter by status) | Yes |
| POST | `/api/v1/applications` | Adds a new application | Yes |
| PATCH | `/api/v1/applications/:id` | Updates an application (status, notes, etc.) | Yes |
| DELETE | `/api/v1/applications/:id` | Deletes an application | Yes |
| POST | `/api/v1/applications/sync-sheets` | Exports/syncs the user's applications to their Google Sheet | Yes |
| POST | `/api/v1/certificates/upload` | Uploads a course certificate file, saves it with its details | Yes |
| POST | `/api/v1/certificates/badge` | Creates a badge certificate after a quiz is passed — called internally by the Quiz system, not the frontend directly | Yes (internal) |
| GET | `/api/v1/certificates` | Lists a user's certificates/badges (can filter by tag or type) | Yes |
| DELETE | `/api/v1/certificates/:id` | Deletes an uploaded certificate (badges can't be deleted) | Yes |

---

## Internal-Only Routes (not called directly by the frontend)

These exist so backend features can talk to each other without writing into another member's database table directly:

- `PATCH /api/v1/skills/verify` — Quiz system → Roadmap Engine, on quiz pass
- `POST /api/v1/certificates/badge` — Quiz system → Certificate Vault, on quiz pass

---

## Adding a New Route

When you add a route, add a row here in the matching section with: method, path, a one-line plain-English description, and whether auth is required. Keep it updated as you build — this file is meant to always reflect what's actually live, not just what's planned in `PROJECT_TASKS.md`.