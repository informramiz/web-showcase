import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/db/demo";
import { setSessionCookie } from "@/features/auth/server/session";
import { clientIp } from "@/server/http";
import { getContainer } from "@/server/runtime";

/**
 * Seamless, client-facing demo entry. A visitor opening the site is signed in as the seeded
 * demo user and dropped straight into populated boards — no login wall, no typing. The real
 * sign-in / register flow stays reachable at /login for anyone who wants to see auth itself.
 */
export async function GET() {
  const res = await getContainer().auth.login(
    { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    { ip: clientIp(await headers()) },
  );
  await setSessionCookie(res.token, res.expiresAt);
  redirect("/projects");
}
