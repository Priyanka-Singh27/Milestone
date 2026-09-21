/**
 * validate-person-c.js
 * -----------------------------------------------------------------
 * Run this from the PROJECT ROOT (C:\Users\HP\Milestone) after placing
 * all Person C files, and after `npm install` has been run inside
 * server/. It does two things:
 *
 *   1. Syntax-checks every Person C file (fails fast on typos/broken JS).
 *   2. Actually require()'s the backend files so real problems show up
 *      immediately — bad import paths, missing dependencies (e.g. you
 *      forgot `npm install googleapis`), or a mongoose schema that
 *      throws on definition.
 *
 * Usage:
 *   node validate-person-c.js
 *
 * This does NOT start the server or touch the database — it only loads
 * modules to confirm they're wired correctly.
 * -----------------------------------------------------------------
 */

const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;

const FILES_TO_SYNTAX_CHECK = [
  'server/src/models/Application.model.js',
  'server/src/models/SheetMapping.model.js',
  'server/src/services/googleSheets.service.js',
  'server/src/controllers/applications.controller.js',
  'server/src/routes/applications.routes.js',
  'client/src/api/client.js',
  'client/src/api/applications.js',
  'client/src/pages/applications.jsx',
  'client/src/components/tracker/StatusBadge.jsx',
  'client/src/components/tracker/CustomStatusInput.jsx',
  'client/src/components/tracker/ApplicationFormModal.jsx',
  'client/src/components/tracker/ApplicationTable.jsx',
];

const BACKEND_MODULES_TO_LOAD = [
  'server/src/models/Application.model.js',
  'server/src/models/SheetMapping.model.js',
  'server/src/services/googleSheets.service.js',
  'server/src/controllers/applications.controller.js',
  'server/src/routes/applications.routes.js',
];

let failed = false;

console.log('=== Step 1: Syntax check (node --check equivalent via require) ===\n');
for (const rel of FILES_TO_SYNTAX_CHECK) {
  const full = path.join(ROOT, rel);
  try {
    // For .js CommonJS backend files, node --check works directly.
    // For frontend ESM/JSX files, node --check can't parse JSX/import
    // syntax, so we just confirm the file exists and is non-empty here —
    // real JSX/ESM validation happens when Vite runs it in dev mode.
    if (rel.startsWith('server/')) {
      execSync(`node --check "${full}"`, { stdio: 'pipe' });
      console.log(`PASS  ${rel}`);
    } else {
      const fs = require('fs');
      if (!fs.existsSync(full) || fs.statSync(full).size === 0) {
        throw new Error('file missing or empty');
      }
      console.log(`SKIP-SYNTAX (checked by Vite instead)  ${rel}`);
    }
  } catch (err) {
    failed = true;
    console.error(`FAIL  ${rel}`);
    console.error(err.stdout ? err.stdout.toString() : err.message);
  }
}

console.log('\n=== Step 2: Actually require() the backend modules (needs a live/mongoose-connected process to fully init, but this confirms all imports resolve and nothing throws at load time) ===\n');
for (const rel of BACKEND_MODULES_TO_LOAD) {
  const full = path.join(ROOT, rel);
  try {
    require(full);
    console.log(`LOAD OK  ${rel}`);
  } catch (err) {
    failed = true;
    console.error(`LOAD FAILED  ${rel}`);
    console.error(`  -> ${err.message}`);
  }
}

console.log('\n' + (failed ? '❌ Some checks failed — see above.' : '✅ All checks passed.'));
process.exit(failed ? 1 : 0);
