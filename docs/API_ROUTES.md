# API_ROUTES.md

A running, plain-English reference of every API endpoint in the project. Update this whenever a route is added or changed — this is the fastest way for a teammate (or their agent) to see what's available without digging through someone else's route files.

All routes are prefixed `/api/v1/`. All responses follow the standard shape from `CONTRACTS.md`:
```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "...", "message": "..." } }
```

---

## Auth & Profile (Person D)

| Method | Path | What it does | Auth required? | Key Status Codes & Error Codes |
|---|---|---|---|---|
| POST | `/api/v1/auth/signup` | Creates a new account with email/password; returns 7-day JWT and sanitized user | No | `201` Created<br>`400` `MISSING_FIELDS`, `INVALID_EMAIL`, `PASSWORD_TOO_SHORT`, `EMAIL_TAKEN` |
| POST | `/api/v1/auth/login` | Logs in with email/password; returns token and sanitized user | No | `200` OK<br>`400` `MISSING_FIELDS`<br>`401` `INVALID_CREDENTIALS` (same for wrong pass & unknown email)<br>`401` `USE_GOOGLE_LOGIN` (account created via Google) |
| GET | `/api/v1/auth/google` | Starts Google Sign-In; sets CSRF `google_oauth_state` cookie & redirects to Google | No | `302` Redirect to Google OAuth consent screen<br>`501` `GOOGLE_NOT_CONFIGURED` |
| GET | `/api/v1/auth/google/callback` | Google redirects back here; exchanges code, lowercases email, links googleId to existing local accounts, redirects to frontend `#token=...` | No | `302` Redirect to `${FRONTEND_URL}/auth/callback#token=...`<br>`302` Redirect to `/login?error=...` on denial/mismatch |
| GET | `/api/v1/profile` | Returns current user's profile info (name, email, targetRoleId, authProvider) | Yes (`requireAuth`) | `200` OK<br>`401` `NO_TOKEN`, `INVALID_TOKEN`, `SESSION_EXPIRED` |
| PATCH | `/api/v1/profile` | Updates profile name and/or targetRoleId (verifies role existence or clears with `null`) | Yes (`requireAuth`) | `200` OK<br>`400` `NOTHING_TO_UPDATE`, `INVALID_NAME`, `UNKNOWN_ROLE`<br>`401` Unauthorized |
| GET | `/api/v1/dashboard` | Aggregates summary statistics from Roadmap, Fundamentals, Applications, Certificates. Degrades gracefully if modules are down | Yes (`requireAuth`) | `200` OK (distinguishes module failure/unmounted with `unavailable: true` from resource 404/empty data with `unavailable: false`) |

---

## Global & Catch-All Error Codes

| Status | Code | Description |
|---|---|---|
| `404` | `ROUTE_NOT_FOUND` | Returned by the Express catch-all router when an endpoint or sub-route does not exist or has not yet been merged/mounted (e.g. `Cannot GET /api/v1/unknown`). Dashboard treats submodules returning `ROUTE_NOT_FOUND` as `unavailable = true`. In contrast, resource-specific 404s (e.g. `ROADMAP_NOT_FOUND`, `USER_NOT_FOUND`) indicate that the module is online but the requested user has no data, which sets `unavailable = false`. |
| `500` | `SERVER_ERROR` | Central uncaught exception or database connection crash. |

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

## Internal-Only Routes & Service Authentication

These routes allow backend modules to talk to each other without directly modifying another team member's MongoDB collections:

- `PATCH /api/v1/skills/verify` — Quiz system → Roadmap Engine (on quiz pass)
- `POST /api/v1/certificates/badge` — Quiz system → Certificate Vault (on quiz pass)

### Authentication for Internal Routes:
Protected with `authenticate({ allowInternal: true })`. Callers can authenticate either via a valid user JWT (`Authorization: Bearer <token>`) or using the service-to-service key:
- Header: `x-internal-key: <INTERNAL_API_KEY>`
- Header: `x-user-id: <target-user-id>`

---

## Adding a New Route

When you add a route, add a row here in the matching section with: method, path, a one-line plain-English description, and whether auth is required. Keep it updated as you build — this file is meant to always reflect what's actually live, not just what's planned in `PROJECT_TASKS.md`.
