"use client";

import { useActionState, useState, useTransition } from "react";
import { FormError } from "@/components/field";
import type { ActionState } from "@/server/action-state";
import type { Member, Role } from "../domain/types";
import { addMemberAction, removeMemberAction } from "../server/actions";
import { Avatar } from "@/components/avatar";

export function MembersPanel({ projectId, members, role }: { projectId: string; members: Member[]; role: Role }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addMemberAction.bind(null, projectId), {});
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string>();
  const isOwner = role === "owner";

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Members</h2>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-sm">
            <Avatar name={m.name} />
            <span className="min-w-0 flex-1 truncate">
              {m.name}
              <span className="block truncate text-xs text-muted">{m.email}</span>
            </span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{m.role}</span>
            {isOwner && m.role !== "owner" && (
              <button
                type="button"
                className="text-xs text-muted hover:text-danger"
                disabled={removing}
                onClick={() =>
                  startRemove(async () => {
                    setRemoveError((await removeMemberAction(projectId, m.id)).error);
                  })
                }
                aria-label={`Remove ${m.name}`}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <FormError message={removeError} />
      {isOwner && (
        <form action={action} className="space-y-2 border-t border-border pt-3">
          <FormError message={state.fields?.email?.[0] ?? state.error} />
          <div className="flex gap-2">
            <input
              name="email"
              type="email"
              placeholder="teammate@company.com"
              aria-label="Member email"
              className="input"
              required
            />
            <button className="btn-ghost shrink-0" disabled={pending}>
              Add
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
