# PrepRoadmap — Full Project Documentation

A note on scope before reading: this document goes into full technical depth
on **Module A (Roadmap Engine)** since that's the module documented here —
every design decision, bug found, and fix made is recorded, because that
history is genuinely part of the module's design record, not just the final
state. For Modules B, C, and D, this reflects what has actually been reviewed
or observed (B's module was fully code-reviewed; C is mid-development; D's
scope is largely still as originally planned) — marked accordingly so nothing
here is overstated as more complete or more verified than it actually is.

---

## 1. What This Project Is

**PrepRoadmap** is a web platform that gives college students a single,
integrated place to prepare for technical internships and jobs — replacing
the current default of juggling a generic roadmap site, a personal
spreadsheet for tracking applications, and no real way to verify whether
they've actually learned something.

### The problem it addresses
- Students currently rely on separate, disconnected tools: spreadsheets
  (e.g. Google Sheets) for tracking job applications, generic online
  roadmaps (e.g. roadmap.sh) for learning plans, and nothing that ties
  learning progress to actual verified skill.
- Existing roadmap tools give the same static, weekly-milestone roadmap to
  every student, regardless of prior skill level or how much time they can
  realistically commit per day.
- Progress tracking elsewhere is self-reported (a checkbox) — nothing
  confirms a skill was actually learned to a working standard.
- Course material frequently misses specific, frequently-asked interview
  details that go beyond textbook coverage — e.g., DBMS courses often cover
  transaction isolation levels in the abstract but skip the specific named
  phenomena (dirty reads, non-repeatable reads, phantom reads) that
  interviewers commonly probe.
- Academic framing: recent industry data suggests only around 51% of
  India's ~1.5 million annual engineering graduates are considered
  employable, reflecting a lack of structured, verifiable skill-alignment
  tooling before students enter the job market.

### Related work / research gap
- **roadmap.sh** — the most widely used developer roadmap reference.
  Static, self-paced, checkbox-based progress. No personalization to prior
  skill, no time-based day-wise scheduling, no mastery verification.
- **CareerVector** (IJERT, 2026) — closest academic prior work. AI-driven,
  accepts a resume, computes a job-readiness score, generates a roadmap —
  but at the module level, not true day-wise granularity, and without
  quiz-gated verification or the application/fundamentals/certificate
  integration this project adds.
- **Broader adaptive learning path generation (ALPG) research** — finds
  most approaches remain prototype-stage, with the core challenge framed as
  a sociotechnical orchestration problem, not purely technical sequencing.
- **Stated gap:** no existing system integrates (a) verified-mastery gating
  via quizzes, (b) true day-wise, multi-track adaptive scheduling, and (c)
  end-to-end internship-readiness tracking (learning + applications +
  fundamentals + certificates) in one platform.

### The solution — four integrated pillars
1. **Adaptive, day-wise roadmap generator** (Module A) — target role +
   current skills → a personalized, day-by-day plan
2. **Quiz-gated skill verification** (Module B) — AI-generated quizzes,
   80% pass threshold, capped attempts, issues verified badges
3. **Internship application tracker** (Module C) — customizable status
   pipeline, optional Google Sheets export
4. **CS Fundamentals tracker + Certificate/Badge Vault** (Modules B & C) —
   role-agnostic fundamentals (DSA/OOP/OS/DBMS/CN), plus storage for both
   earned badges and uploaded course certificates

### Novelty / contribution
1. Verified-mastery gating via quiz thresholds — directly addresses the
   "advances regardless of mastery" problem noted in adaptive-learning
   literature
2. An industry-sourced (job postings + interview-question banks), not
   purely LLM-invented, curriculum-research methodology
3. True day-wise, multi-track, prerequisite-aware adaptive scheduling
4. Full integration of learning, verification, applications, and
   certificates in one platform

---

## 2. Team Structure

| Module | Owner | Scope |
|---|---|---|
| A — Roadmap Engine | (this document's author) | Roles, skill-gap analysis, resume parsing, day-wise multi-track scheduler, roadmap generation & progress tracking |
| B — Quiz System & CS Fundamentals | Person B | Quiz generation/scoring/verification, CS fundamentals tracker |
| C — Application Tracker & Certificate Vault | Person C | Application CRUD, Google Sheets sync, certificate/badge storage |
| D — Auth, Profile, Dashboard, Deployment | Person D | JWT/Google auth, user profile, dashboard aggregation, DevOps |

### Core architectural rule
No module writes directly into another module's database collection.
Cross-module interaction happens only through that module's own API
endpoint — confirmed in practice: Module B's quiz-pass flow calls Module
A's `PATCH /api/v1/skills/verify` and Module C's `POST
/api/v1/certificates/badge` over real HTTP, not direct writes.

---

## 3. System Architecture

Three-tier: client (React) -> backend API (Node/Express, one route module
per person, behind a shared JWT auth middleware) -> data & external
services (MongoDB Atlas; object storage for files; a provider-agnostic LLM
service wrapping Groq; Google APIs for OAuth login and Sheets sync).

**Tech stack:** React, Node.js, Express, MongoDB Atlas, JWT + Google OAuth,
Groq (via an internal `llm.service.js` abstraction — no module calls a
provider SDK directly), Google Sheets API, object storage (S3/Cloudinary),
Vercel/Render for deployment, GitHub Actions for CI/CD.

---

## 4. Module A — Roadmap Engine (Full Detail)

### 4.1 Data models

**`Role`** — one document per target role (currently: Data Analyst,
Software Developer, AI Engineer), each with a `topics[]` array:
```
topic: {
  id, name, track ("DSA"|"Core CS"|"Aptitude"|"Tools/Libraries"),
  priority ("core"|"supplementary"), quizEligible (bool),
  prerequisiteTopicIds: [...],
  outline: [{ point, estimatedMinutes, type ("practical"|"conceptual"),
              source ("docs"|"interview-questions"), practicePrompt }]
}
```

**`SkillProfile`** — per user: `skills: [{ topicId, verified (bool),
proficiency ("beginner"|"intermediate"|"advanced"), source
("resume"|"manual"|"quiz") }]`

**`Roadmap`** — per user: `gapTopicIds` (the original requested topic list,
persisted so regeneration never has to guess), `hoursPerDay`, `daysPerWeek`,
`bufferInterval`, and `days[]`, each day: `dayNumber, date (string
"YYYY-MM-DD"), phase ("foundational"|"practice"), isBufferDay, tasks[],
practicePlan` (practice-phase days only).

### 4.2 Content: the curriculum research methodology

Rather than letting an LLM freely invent what a topic should cover, each
role's curriculum was researched via a structured, sourced process:
1. Analysis of 15-20+ real job/internship postings per role to identify
   actually-required skills
2. Cross-referencing against roadmap.sh's topic sequencing and
   core/supplementary classification
3. A dedicated interview-relevance sourcing pass — GeeksforGeeks,
   InterviewBit, Glassdoor — specifically to catch niche but
   frequently-asked details standard course material tends to omit (the
   DBMS phantom-reads case is the concrete example this step caught)
4. Each topic's outline broken into ordered subtopics, each tagged with an
   estimated time, a type (practical/conceptual), a source category, and a
   concrete practice/review prompt

This produced three fully-researched, sourced role curriculums — Data
Analyst (14 topics), Software Developer (20 topics), AI Engineer (18
topics) — as seed content. A later pass added `quizEligible` per topic,
deliberately *not* defaulting every topic to quiz-eligible: trivia-heavy or
discussion-shaped topics (Git & Version Control, AI Safety & Ethics) were
set to `false` after reasoning about which topics are actually testable in
an MCQ format.

### 4.3 Skill-gap analysis
- Started as a simple binary known/unknown set-difference
- Upgraded to **proficiency levels**: a "beginner" self-report is *not*
  enough to exclude a topic from the gap — only intermediate/advanced or
  actual quiz-verification does
- Added a **prerequisite-consistency check**: flags (advisory, not
  blocking) cases like "claims advanced Scikit-learn but never mentioned
  Pandas" — checks direct prerequisites only, not the full transitive chain
  (a documented, deliberate scope limit)

### 4.4 Resume parsing
PDF/DOCX text extraction (`pdf-parse@1.1.1` — note the version pin; the
default `npm install pdf-parse` grabs an incompatible v2 API), then a
constrained LLM call that must match extracted skills against the role's
real topic IDs. Includes a defensive filter that drops any topic ID the LLM
hallucinates that isn't actually one of the role's real topics — tested
explicitly with a simulated hallucination to confirm the filter catches it.

### 4.5 The scheduler — design history and current state

The scheduler went through several real iterations, each driven by a
specific gap found through testing or discussion, not speculative
over-engineering:

- **v1:** fixed 3-track cap, fixed 45-minute chunk size, whole-roadmap
  pre-generation, simple binary prerequisite check
- **v2 (rolling-window redesign):** switched from pre-generating an entire
  roadmap upfront to computing "what's next" fresh from real completion
  data on every fetch — necessary once it became clear a fixed
  pre-generated plan couldn't correctly handle a student skipping a task
  (see 4.6, rollover)
- **v3 (current):**
  - **Adaptive track cap** — derived from `dailyMinutes / 20` (floor 1,
    ceiling 4) instead of a hardcoded number
  - **`daysPerWeek` genuinely respected** — the scheduler computes which
    real weekdays count as study days and skips the rest (a first attempt
    using an "evenly spaced" algorithm was wrong — caught by its own test,
    since it put Saturday into a supposed 5-day week; fixed to simple
    consecutive-from-Monday)
  - **Subtopic-level chunking** — uses each outline point's real
    `estimatedMinutes`, not a fixed chunk size
  - **Partial-progress persistence** — a split conceptual chunk's
    *remaining* minutes are computed from real completion history summed
    across all stored tasks sharing its key, not restarted at full
    duration next time
  - **Strict one-day-gap prerequisite rule** — a topic only unlocks once
    all its prerequisites were completed on a *strictly earlier* day, not
    the same day
  - **Smarter cross-track gating** — if a track's next topic is locked, the
    scheduler scans further ahead in that same track for a different,
    unlocked topic, instead of leaving the whole track idle for the day
  - **Two-phase structure** — a finite "Foundational" phase (walks the
    real researched curriculum, typically 4-8 weeks) followed by an
    open-ended "Practice & Mastery" phase (rotating practice content,
    fills the remainder of a realistic multi-month timeline) — this
    resolved an earlier tension between "6-8 month roadmap" and "only ~10
    hours of authored content exists per role"

### 4.6 Rollover architecture — the important late-stage fix

An early version generated and permanently stored a full 14-day window
upfront. This meant a skipped task didn't actually reschedule anything —
the pre-committed future days stayed as originally planned regardless of
what the student actually did. The fix, confirmed working via both
synthetic and real-database testing:

- Days are split into **past** (`date < today`, immutable history, never
  rewritten) and **non-past** (`date >= today`, recomputed as needed)
- `GET /roadmap/:userId` checks whether any *past* day has an incomplete
  task. If so, it discards the stored non-past days and regenerates from
  today using real completion data — the skipped task naturally reappears
  first, and everything else shifts later
- If no rollover is needed, it falls back to a lighter "extend if running
  low on upcoming days" check, or does nothing at all (a fast path with no
  wasted LLM calls when nothing has changed)
- Verified end-to-end against the real database: a task manually pushed
  into the past with `status: "not_started"` correctly reappeared as the
  first task of the newly-computed "today," with all subsequent days
  shifted later, buffer days recalculated, and total roadmap length grown
  to absorb the delay

### 4.7 LLM-generated task wording
One LLM call per day (not per task), wording all of that day's chunks
together for a coherent daily plan and fewer API calls. Grounded strictly
in each chunk's researched outline point and practice prompt — the LLM is
constrained to sequencing/wording, not deciding curriculum content. If the
LLM response is missing, malformed, or doesn't include a chunk's key, that
specific chunk falls back to its raw outline text rather than failing the
whole day's generation — tested explicitly with a deliberately broken LLM
response to confirm graceful degradation.

### 4.8 Real Groq integration
`llm.service.js` is a provider-agnostic wrapper — no other file calls a
provider SDK directly. Ships with a functional mock mode (used throughout
development before a provider was chosen) and a real Groq implementation
(model: `openai/gpt-oss-120b`, chosen for `json_mode`/`structured_outputs`
support and a large context window). Verified end-to-end with real API
calls: resume parsing against an actual uploaded resume returned genuinely
different, correctly-matched skills (not the canned mock response), and
roadmap generation produced real, well-worded daily tasks.

### 4.9 API endpoints
`GET /roles`, `POST /skills/extract`, `POST /skills/gap`, `PATCH
/skills/verify`, `POST /roadmap/estimate`, `POST /roadmap/generate`, `GET
/roadmap/:userId`, `PATCH /roadmap/task/:taskId`.

### 4.10 Testing approach
Every non-trivial piece was tested with a real, runnable script before
being considered done — not just reviewed by eye. This caught several real
bugs before they reached the database: an infinite-loop bug in the
duration-estimate function (a topic with a prerequisite could never
"complete" within a single dry-run simulation because the completion map
was never updated as the simulation progressed), the `daysPerWeek`
even-spacing bug mentioned above, and a silent data-loss bug where deriving
the topic list by scanning stored tasks would have permanently dropped any
topic not yet reached in the first generated window (fixed by persisting
`gapTopicIds` directly on the `Roadmap` document).

---

## 5. Module B — Quiz System & CS Fundamentals (code-reviewed)

Built: `Quiz`/`QuizAttempt`/`FundamentalsTopic`/`FundamentalsProgress`
models; role-aware quiz generation (the same topic produces meaningfully
different questions depending on target role — Data Analyst vs. AI
Engineer vs. Software Developer — with quizzes cached per `(topicId,
roleId)` pair); strict validation of LLM output (15-20 questions, exactly 4
options, valid answer index, no duplicate IDs); attempt-limiting (80% pass,
3-attempt cap, 10-hour cooldown, verified against real edge cases including
"already maxed out, don't allow a 4th"); cross-module integration calls to
Module A's `/skills/verify` and Module C's `/certificates/badge` via real
HTTP, with graceful handling if the target endpoint is down or not yet
built; a substantial `node:test` suite covering scoring, validation,
cooldown logic, and HTTP-level route tests.

**Known issues found during review** (not blockers, flagged for follow-up):
- Real generated quizzes show measurable answer-position bias (in one
  sample AI Engineer quiz, 8 of 15 correct answers landed on option A, zero
  on option D) — nothing in the pipeline currently shuffles options after
  generation, so an "always guess A" strategy would score well above chance
- `FundamentalsTopic`/`FundamentalsProgress` were confirmed empty in the
  real database — the seed function exists and is correctly written but is
  never actually called at server startup (a one-line fix, not yet applied
  as of this writing)
- Reads Module A's `Role`/`Roadmap` models directly (for role-resolution
  and topic-completion checks) rather than through Module A's API
  endpoints — functionally correct against the real schema, but tighter
  coupling than the spirit of "always go through their API"

---

## 6. Module C — Application Tracker & Certificate Vault (in progress)

As of this writing, Person C's controllers exist for applications and
certificates (confirmed via file listing) and active testing is underway,
specifically on `POST /api/v1/certificates/badge` — the endpoint Module B's
already-tested integration code calls on every quiz pass. This is the
highest-priority piece to finish, since Module B's cross-module flow can't
be verified end-to-end until it's confirmed working with real
request/response shapes matching exactly what B's code sends (`userId`,
`topicId`, `title`, `quizScore`).

Per the original module scope: application CRUD with a free-string `status`
field (not a hard enum, so students can add custom pipeline stages),
certificate upload to object storage (file itself never stored in MongoDB,
only the resulting URL), and Google Sheets sync (lower priority, acceptable
to lag behind the rest per the team's own plan).

---

## 7. Module D — Auth, Profile, Dashboard, Deployment (largely as planned)

Per file listings observed, controllers exist for auth, profile, dashboard,
and roles, plus middleware for auth, error handling, uploads, and
validation — suggesting active development, though not yet code-reviewed
in the depth Modules A and B have been. Scope per the original plan: JWT +
Google OAuth, a shared auth middleware every other module's protected
routes will eventually depend on, `GET /dashboard` aggregating Modules
A/B/C's own GET endpoints (not reading their collections directly), and
overall deployment/DevOps ownership.

---

## 8. Current Overall Status & What's Left

- **Module A: functionally complete and thoroughly tested**, including the
  cross-module contracts other modules depend on (`/skills/verify` is live
  and already being called by Module B)
- **Module B: functionally complete and well-tested**, blocked only on
  Module C's badge endpoint for full end-to-end verification, plus the two
  known issues above
- **Module C: in active development**, currently the critical path for
  unblocking Module B's full integration test
- **Module D: in development**, auth middleware not yet retrofitted across
  other modules (planned for the team's Phase 3 integration testing, per
  the team's Integration Plan document, using real JWTs rather than the
  shared `"dev-user-1"` placeholder used throughout development so far)

**Next milestones**, per the team's agreed Integration Plan: finish and
verify Module C's badge endpoint -> full backend merge into `main` -> a
structured cross-module integration test pass (including the auth-retrofit
work) -> frontend development, sequenced after backend is fully verified
together, not in parallel with it.
