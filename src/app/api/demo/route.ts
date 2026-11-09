import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { DEMO_EMAIL } from "@/db/demo";
import { getCurrentUser, setSessionCookie } from "@/features/auth/server/session";
import { clientIp, isCrossSite } from "@/server/http";
import { getContainer } from "@/server/runtime";

/** 303 so the browser follows with GET; a relative Location keeps the public host, whatever the proxy sees. */
const see = (path: string) => new NextResponse(null, { status: 303, headers: { location: path } });

/**
 * Loginless demo entry: signs the visitor in as the seeded demo user and sends them to the populated boards.
 * It is a POST because it creates a session; GET is deliberately not exported, so Next answers 405 and
 * prefetchers, crawlers and cross-site <img>/<a> requests can't trigger it.
 *
 * Guards:
 * - Cross-site requests are refused (Origin vs Host, plus Sec-Fetch-Site), so a third-party page can't force a
 *   session onto a visitor's browser (login CSRF / session fixation).
 * - An already signed-in visitor is sent to their boards and never swapped onto the demo account.
 * - The session is minted directly (startDemoSession), bypassing the password failure limiter, so the shared
 *   demo account can't be locked out. Any failure falls back to /login.
 */
export async function POST(req: Request) {
  const h = await headers();
  if (isCrossSite(req) || h.get("sec-fetch-site") === "cross-site") return see("/login");
  if (await getCurrentUser()) return see("/projects");

  try {
    const res = await getContainer().auth.startDemoSession(DEMO_EMAIL, { ip: clientIp(h) });
    await setSessionCookie(res.token, res.expiresAt);
  } catch {
    return see("/login");
  }
  return see("/projects");
}
