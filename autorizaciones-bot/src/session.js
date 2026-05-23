/**
 * In-memory session per Telegram user. Resets when bot restarts (fine for Phase 1).
 *
 * Shape of a session:
 * {
 *   pendingRule: <rule from sheet>,    // apto matched, waiting for screenshot
 *   pendingData: <ocr result>,         // ocr done, waiting for confirmation
 *   pendingScreenshot: <Buffer>,       // raw image for attaching to email
 *   awaitingMissingField: "fechas" | "cedulas" | null
 * }
 */
const sessions = new Map();

export function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, {});
  return sessions.get(userId);
}

export function setSession(userId, patch) {
  const s = getSession(userId);
  Object.assign(s, patch);
  return s;
}

export function clearSession(userId) {
  sessions.delete(userId);
}
