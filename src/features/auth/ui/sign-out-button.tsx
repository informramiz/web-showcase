"use client";

import { useQueryClient } from "@tanstack/react-query";
import { logoutAction } from "../server/actions";

/** Signs out and drops the browser query cache, so the next user in this tab never sees cached data. */
export function SignOutButton() {
  const queryClient = useQueryClient();
  return (
    <form action={logoutAction} onSubmit={() => queryClient.clear()}>
      <button className="btn-ghost py-1.5">Sign out</button>
    </form>
  );
}
