/* ==================================================
   ERROR CODE -> FRIENDLY MESSAGE (one table)
   Raw codes and stack traces are never shown. For codes
   marked `useServer`, the server's own message is the
   most helpful text, so it is used.
================================================== */

const T = {
  /* auth */
  MISSING_FIELDS: "Please fill in every field.",
  INVALID_EMAIL: "That email doesn't look right. Please check it.",
  WEAK_PASSWORD: "Choose a password with at least 8 characters.",
  EMAIL_TAKEN: "That email is already registered.",
  INVALID_CREDENTIALS: "That email and password don't match. Please try again.",
  USE_GOOGLE_LOGIN: "This account uses Google sign-in. Use the “Continue with Google” button.",
  NO_TOKEN: "Please log in to continue.",
  INVALID_TOKEN: "Please log in again.",
  SESSION_EXPIRED: "Your session expired — please log in again.",

  /* profile */
  NOTHING_TO_UPDATE: "You haven't changed anything yet.",
  INVALID_NAME: "Please enter a name (up to 80 characters).",
  UNKNOWN_ROLE: "That role no longer exists. Please pick another.",

  /* roles / skills / roadmap */
  ROLE_NOT_FOUND: "We couldn't find that role. Please go back and choose it again.",
  UNKNOWN_TOPIC_IDS: "Something went out of sync with the topics. Please go back to the first step and start again.",
  ROADMAP_NOT_FOUND: "You don't have a roadmap yet.",
  ROADMAP_EXISTS: "You already have a roadmap.",
  TASK_NOT_FOUND: "That task no longer exists. Refresh the page to see your latest plan.",
  TASK_VERIFIED: "This task is quiz-verified and can't be changed.",
  MISSING_FILE: "Please choose a file first.",
  FILE_PARSE_ERROR: "We couldn't read that file. Try another PDF or DOCX, or enter your skills manually.",
  EMPTY_RESUME_TEXT: "That file has no readable text (it may be a scanned image). Upload a text-based PDF, or enter your skills manually.",
  FILE_TOO_LARGE: "That file is too large.",
  INVALID_FILE_TYPE: "That file type isn't supported.",
  UPLOAD_ERROR: "The upload failed. The file may be too large (max 10 MB).",

  /* quizzes */
  TOPIC_NOT_COMPLETE: "Finish every lesson of this topic first.",
  TOPIC_NOT_FOUND: "That topic isn't part of your roadmap or the fundamentals.",
  TOPIC_NOT_QUIZ_ELIGIBLE: "This topic doesn't have a quiz.",
  ALREADY_PASSED: "You already passed this quiz and earned the badge.",
  MAX_ATTEMPTS_REACHED: "You've used all your attempts for this quiz.",
  QUIZ_GENERATION_FAILED: "We couldn't prepare the quiz just now. Please try again in a moment.",

  /* applications / certificates / sheets */
  FORBIDDEN: "You can't do that.",
  NOT_FOUND: "That item no longer exists. Refresh the list.",
  INVALID_ID: "That item no longer exists. Refresh the list.",
  SHEETS_NOT_CONNECTED: "Connect Google Sheets first.",
  SHEETS_AUTH_EXPIRED: "Google access ended. Please connect again.",
  SHEETS_NOT_CONFIGURED: "Sheets sync isn't available right now.",

  /* generic */
  RATE_LIMITED: "You're going a bit fast. Please wait a moment and try again.",
  PAYLOAD_TOO_LARGE: "That is too much data to send at once.",
  INVALID_JSON: "Something went wrong sending that. Please try again.",
  NETWORK_ERROR: "Can't reach the server. Check your internet connection and try again.",
  TIMEOUT: "That took longer than expected. Please try again.",
  SERVER_ERROR: "Something went wrong on our side. Please try again.",
};

/** Codes where the server's own message is more specific than ours. */
const USE_SERVER = new Set([
  "VALIDATION_ERROR",
  "INVALID_INPUT",
  "INVALID_STATUS",
  "COOLDOWN_ACTIVE",
  "LIMIT_REACHED",
]);

export const GOOGLE_ERRORS = {
  GOOGLE_STATE_MISMATCH: "Google sign-in could not be verified. Please try again.",
  GOOGLE_TOKEN_FAILED: "Google didn't accept the sign-in. Please try again.",
  GOOGLE_EMAIL_UNVERIFIED: "Your Google email isn't verified, so we can't use it to sign in.",
  GOOGLE_FAILED: "Google sign-in didn't complete. Please try again.",
};

/**
 * @param {Error & {code?: string}} err
 * @param {Record<string,string>} [overrides] per-screen wording, keyed by code
 */
export function friendlyError(err, overrides = {}) {
  const code = err?.code;
  if (code && overrides[code]) return overrides[code];
  if (code && USE_SERVER.has(code) && err.message) return err.message;
  if (code && T[code]) return T[code];
  if (err?.message && err.status && err.status < 500) return err.message;
  return T.SERVER_ERROR;
}
