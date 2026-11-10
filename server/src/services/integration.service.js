// server/src/services/integration.service.js
//
// Cross-module integration caller for Person B.
// Calls Person A's skill verification endpoint and Person C's badge endpoint
// over HTTP without writing directly into other modules' database tables.

function getBaseUrl() {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL.replace(/\/$/, '');
  }
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}`;
}

/**
 * Calls Person A's PATCH /api/v1/skills/verify
 * @param {Object} params - { userId, topicId }
 * @returns {Promise<{ success: boolean, data?: any, error?: any }>}
 */
async function verifySkillWithPersonA({ userId, topicId }) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/v1/skills/verify`;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, topicId }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      console.warn(`[integration.service] Person A skill verification returned status ${res.status}:`, body.error || body);
      return { success: false, error: body.error || { code: 'VERIFICATION_FAILED', message: `Status ${res.status}` } };
    }

    return { success: true, data: body.data };
  } catch (err) {
    console.warn(`[integration.service] Error calling Person A /skills/verify at ${url}:`, err.message);
    return { success: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}

/**
 * Calls Person C's POST /api/v1/certificates/badge
 * Note: Person C's endpoint is a documented external dependency in PROJECT_TASKS.md.
 * If Person C's endpoint has not been implemented yet or fails, this returns { success: false }
 * gracefully so the passed quiz result remains safely recorded.
 *
 * @param {Object} params - { userId, topicId, title, quizScore }
 * @returns {Promise<{ success: boolean, data?: any, error?: any }>}
 */
async function issueBadgeWithPersonC({ userId, topicId, title, quizScore }) {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/api/v1/certificates/badge`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, topicId, title, quizScore }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) {
      console.warn(`[integration.service] Person C badge endpoint returned status ${res.status} (pending implementation):`, body.error || body);
      return { success: false, error: body.error || { code: 'BADGE_CREATION_FAILED', message: `Status ${res.status}` } };
    }

    return { success: true, data: body.data };
  } catch (err) {
    console.warn(`[integration.service] Person C /certificates/badge is unreachable at ${url} (external dependency pending):`, err.message);
    return { success: false, error: { code: 'DEPENDENCY_PENDING', message: err.message } };
  }
}

module.exports = {
  verifySkillWithPersonA,
  issueBadgeWithPersonC,
  getBaseUrl,
};
