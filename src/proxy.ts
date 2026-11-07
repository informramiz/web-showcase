import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/features/auth/server/cookie-name";

/**
 * Optimistic check only: sends visitors without a session cookie to /login before rendering.
 * The real check (is the session valid, may this user see this project) happens on the server.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.has(SESSION_COOKIE)) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/projects/:path*"] };
