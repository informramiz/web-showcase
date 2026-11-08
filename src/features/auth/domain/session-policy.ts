/** How long a session lives without activity. The database row is authoritative; the cookie mirrors it. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend a session when less than half its lifetime is left. */
export const RENEW_BELOW_MS = SESSION_TTL_MS / 2;
