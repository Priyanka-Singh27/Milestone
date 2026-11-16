# server-changes

Overlay these files onto the ORIGINAL `server/` folder (same relative paths).

Then:
  cd server
  npm install            # adds helmet + express-rate-limit (already in package.json)
  node --test tests/security.test.js tests/routes.test.js tests/auth.middleware.test.js tests/quiz.test.js tests/fundamentals.test.js
  # (111 tests pass without a database)
  # DB-backed tests (auth.integration, personC.integration, ...) need mongodb-memory-server
  # to be able to download MongoDB, so they were UPDATED but NOT RUN yet. Run them.

New env vars: see server-changes/.env.example and render.yaml.
If your database already has duplicate roadmaps, run: node scripts/dedupeRoadmaps.js  (dry run first)
