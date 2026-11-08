import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/server/cookie";

/**
 * Optimistic check only (per the Next.js auth guide): reads the cookie, never the database.
 * No cookie: redirect to /login before rendering. Cookie present: slide its expiry on page navigations so an
 * active user stays signed in. Whether the session is valid, and what the user may see, is decided in the DAL.
 */
export function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  const res = NextResponse.next();
  // GET only: Server Action POSTs (sign-out) set or clear the cookie themselves.
  if (req.method === "GET") res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

export const config = { matcher: ["/projects/:path*"] };
