import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_EMAIL } from "@/db/demo";
import { getCurrentUser, setSessionCookie } from "@/features/auth/server/session";
import { clientIp } from "@/server/http";
import { getContainer } from "@/server/runtime";

/**
 * Seamless, client-facing demo entry. A visitor opening the site is signed in as the seeded
 * demo user and dropped straight into populated boards — no login wall, no typing. The real
 * sign-in / register flow stays reachable at /login for anyone who wants to see auth itself.
 *
 * Guards:
 * - Cross-site requests are refused, so a third-party page cannot force a session onto a
 *   visitor's browser (login CSRF / session fixation).
 * - An already signed-in visitor is sent to their boards and never swapped onto the demo account.
 * - The session is minted directly (startDemoSession), bypassing the password failure limiter,
 *   so the shared demo account can't be locked out. Any failure falls back to /login.
 */
export async function GET() {
  const h = await headers();
  if (h.get("sec-fetch-site") === "cross-site") redirect("/login");
  if (await getCurrentUser()) redirect("/projects");

  try {
    const res = await getContainer().auth.startDemoSession(DEMO_EMAIL, { ip: clientIp(h) });
    await setSessionCookie(res.token, res.expiresAt);
  } catch {
    redirect("/login");
  }
  redirect("/projects");
}
