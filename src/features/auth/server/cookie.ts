import { SESSION_TTL_MS } from "../domain/session-policy";

export const SESSION_COOKIE = "tb_session";

/**
 * One definition of the session cookie, shared by the DAL (sets it at sign-in) and the proxy (slides its expiry).
 * Lax keeps the cookie off cross-site POST/PATCH/DELETE; the JSON API also checks Origin (see server/http.ts).
 */
export function sessionCookieOptions(expires: Date = new Date(Date.now() + SESSION_TTL_MS)) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  } as const;
}
