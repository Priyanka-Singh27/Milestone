// server/src/controllers/dashboard.controller.js
//
// GET /api/v1/dashboard (auth required)
//
// Aggregates summary data from the other three modules by calling their
// published HTTP GET endpoints. Never reads their MongoDB collections directly.
//
// Returned shape (per PROJECT_TASKS.md §4.3):
// {
//   roadmap:      { totalTasks, completedTasks, progressPercent, phase } | null
//   fundamentals: { total, completed } | null
//   applications: { total, byStatus } | null
//   certificates: { total, badges, uploaded } | null
//   unavailable:  { roadmap?, fundamentals?, applications?, certificates? }
// }
//
// If a module is unreachable or returns an unexpected shape, that key is null
// and the corresponding unavailable.<module> = true flag is set. Dashboard
// always returns 200 even if every module is down.
//
// ── ASSUMPTIONS about B's and C's response shapes (UNVERIFIED until merge) ──
// These will be validated against the real implementations after the branch merge.
// They are documented here AND in the final report.
//
// Module B — GET /fundamentals?userId=<userId>
//   ASSUMED shape: { success: true, data: { areas: [{ topics: FundamentalsTopic[], progress: FundamentalsProgress[] }] } }
//   where FundamentalsProgress.status is a TaskStatus string ("completed" | "verified" = done)
//   ASSUMPTION: we count progress entries where status is "completed" or "verified" as done.
//
// Module C — GET /applications?userId=<userId>
//   ASSUMED shape: { success: true, data: { applications: Application[] } }
//   ASSUMPTION: each Application has a `status` string field; we group by it.
//
// Module C — GET /certificates?userId=<userId>
//   ASSUMED shape: { success: true, data: { certificates: Certificate[] } }
//   ASSUMPTION: each Certificate has a `type` field: "badge" | "uploaded".
//
// Module A — GET /roadmap/:userId
//   Shape is known (reviewed): { success: true, data: { roadmap: Roadmap } }
//   days[].tasks[].status: TaskStatus; days[].isBufferDay: bool
//   phase comes from days[0].phase (first non-buffer day).

const { ok } = require('../utils/respond');

const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://localhost:5000/api/v1';

/**
 * Fetch a module endpoint with the caller's auth token forwarded.
 * Returns { unavailable: boolean, data: any }
 *
 * Rules:
 *  - 404 or client not-found -> unavailable: false, data: null
 *  - 5xx, network error, timeout, non-JSON -> unavailable: true, data: null
 *  - 2xx with JSON -> unavailable: false, data: json.data
 */
async function fetchModule(path, authHeader) {
  try {
    const res = await fetch(`${INTERNAL_API_URL}${path}`, {
      headers: { Authorization: authHeader },
    });

    // 5xx: internal server / gateway error -> module failed
    if (res.status >= 500) {
      return { unavailable: true, data: null };
    }

    // Attempt to parse JSON. Non-JSON (e.g. HTML 502/404 error page, plain text) -> module failed
    let json;
    try {
      json = await res.json();
    } catch {
      return { unavailable: true, data: null };
    }

    // Handle 404 specifically:
    // A 404 whose error.code is ROUTE_NOT_FOUND or whose body is not the standard
    // { success: false, error: { ... } } shape means the route/module is unmounted or crashed.
    // Only a 404 from a real module handler (e.g. ROADMAP_NOT_FOUND) counts as "no data, unavailable = false".
    if (res.status === 404) {
      const isStandardError =
        json?.success === false &&
        json?.error &&
        typeof json.error === 'object' &&
        typeof json.error.code === 'string';

      if (!isStandardError) {
        return { unavailable: true, data: null };
      }

      if (json.error.code === 'ROUTE_NOT_FOUND') {
        return { unavailable: true, data: null };
      }

      return { unavailable: false, data: null };
    }

    if (!res.ok) {
      return { unavailable: true, data: null };
    }

    if (!json?.success) {
      return { unavailable: true, data: null };
    }

    return { unavailable: false, data: json.data ?? null };
  } catch {
    // Network errors (e.g. ECONNREFUSED) or timeouts (AbortError) -> module failed
    return { unavailable: true, data: null };
  }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseRoadmap(data) {
  try {
    if (!data) return null;
    const roadmap = data?.roadmap;
    if (!roadmap || !Array.isArray(roadmap.days)) return null;

    // Exclude buffer days when counting tasks
    const activeDays  = roadmap.days.filter((d) => !d.isBufferDay);
    const allTasks    = activeDays.flatMap((d) => d.tasks || []);
    const totalTasks  = allTasks.length;
    if (totalTasks === 0) return null; // Empty roadmap

    const doneTasks   = allTasks.filter((t) => t.status === 'completed' || t.status === 'verified').length;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // Phase from the first non-buffer day
    const firstDay = activeDays[0];
    const phase    = firstDay?.phase || null;

    return {
      totalTasks:      totalTasks,
      completedTasks:  doneTasks,
      progressPercent: progressPct,
      phase,
    };
  } catch {
    return null;
  }
}

function parseFundamentals(data) {
  try {
    if (!data) return null;
    const areas = data?.areas;
    if (!Array.isArray(areas) || areas.length === 0) return null;

    let total     = 0;
    let completed = 0;

    for (const area of areas) {
      const topics   = area?.topics   || [];
      const progress = area?.progress || [];
      total += topics.length;
      completed += progress.filter(
        (p) => p?.status === 'completed' || p?.status === 'verified'
      ).length;
    }

    if (total === 0) return null; // Empty curriculum

    return { total, completed };
  } catch {
    return null;
  }
}

function parseApplications(data) {
  try {
    if (!data) return null;
    const applications = data?.applications;
    if (!Array.isArray(applications) || applications.length === 0) return null; // Empty applications list

    const byStatus = {};
    for (const app of applications) {
      const s = app?.status || 'Unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    return { total: applications.length, byStatus };
  } catch {
    return null;
  }
}

function parseCertificates(data) {
  try {
    if (!data) return null;
    const certificates = data?.certificates;
    if (!Array.isArray(certificates) || certificates.length === 0) return null; // Empty certificates list

    const badges   = certificates.filter((c) => c?.type === 'badge').length;
    const uploaded = certificates.filter((c) => c?.type === 'uploaded').length;

    return { total: certificates.length, badges, uploaded };
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function getDashboard(req, res, next) {
  try {
    const { userId } = req.user;
    const authHeader  = req.headers['authorization'] || '';

    // Fire all four module calls in parallel — failures are isolated
    const [roadmapRes, fundamentalsRes, applicationsRes, certificatesRes] = await Promise.all([
      fetchModule(`/roadmap/${userId}`, authHeader),
      fetchModule(`/fundamentals?userId=${userId}`, authHeader),
      fetchModule(`/applications?userId=${userId}`, authHeader),
      fetchModule(`/certificates?userId=${userId}`, authHeader),
    ]);

    const roadmap      = roadmapRes.unavailable      ? null : parseRoadmap(roadmapRes.data);
    const fundamentals = fundamentalsRes.unavailable ? null : parseFundamentals(fundamentalsRes.data);
    const applications = applicationsRes.unavailable ? null : parseApplications(applicationsRes.data);
    const certificates = certificatesRes.unavailable ? null : parseCertificates(certificatesRes.data);

    const unavailable = {
      roadmap:      roadmapRes.unavailable,
      fundamentals: fundamentalsRes.unavailable,
      applications: applicationsRes.unavailable,
      certificates: certificatesRes.unavailable,
    };

    return ok(res, {
      roadmap,
      fundamentals,
      applications,
      certificates,
      unavailable,
    });

  } catch (err) {
    return next(err);
  }
}

module.exports = { getDashboard };
