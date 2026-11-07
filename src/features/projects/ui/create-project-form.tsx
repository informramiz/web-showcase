"use client";

import { useActionState } from "react";
import { FormError } from "@/components/field";
import type { ActionState } from "@/server/action-state";
import { createProjectAction } from "../server/actions";

export function CreateProjectForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createProjectAction, {});
  return (
    <form action={action} className="card space-y-3 p-4">
      <h2 className="font-semibold">New project</h2>
      <FormError message={state.fields?.name?.[0] ?? (state.fields ? undefined : state.error)} />
      <input name="name" placeholder="Project name" aria-label="Project name" className="input" required />
      <input name="description" placeholder="Short description (optional)" aria-label="Description" className="input" />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
