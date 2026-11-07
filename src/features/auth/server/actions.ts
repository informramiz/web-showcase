"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, toActionState, type ActionState } from "@/server/action-state";
import { getContainer } from "@/server/runtime";
import { SESSION_COOKIE } from "./cookie-name";
import { clearSessionCookie, setSessionCookie } from "./session";

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const client = { ip: clientIp(await headers()) };
    const res = await getContainer().auth.login({ email: form.get("email"), password: form.get("password") }, client);
    await setSessionCookie(res.token, res.expiresAt);
  } catch (e) {
    return toActionState(e);
  }
  redirect("/projects");
}

export async function registerAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const client = { ip: clientIp(await headers()) };
    const res = await getContainer().auth.register(
      { name: form.get("name"), email: form.get("email"), password: form.get("password") },
      client,
    );
    await setSessionCookie(res.token, res.expiresAt);
  } catch (e) {
    return toActionState(e);
  }
  redirect("/projects");
}

export async function logoutAction(): Promise<void> {
  await getContainer().auth.logout((await cookies()).get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  redirect("/login");
}
