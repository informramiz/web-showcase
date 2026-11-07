"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/server/session";
import { toActionState, type ActionState } from "@/server/action-state";
import { getContainer } from "@/server/runtime";

export async function createProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id: string;
  try {
    const project = await getContainer().projects.create(user, {
      name: form.get("name"),
      description: form.get("description") ?? "",
    });
    id = project.id;
  } catch (e) {
    return toActionState(e);
  }
  redirect(`/projects/${id}`);
}

export async function addMemberAction(projectId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await getContainer().projects.addMember(user, projectId, { email: form.get("email") });
  } catch (e) {
    return toActionState(e);
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function removeMemberAction(projectId: string, userId: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    await getContainer().projects.removeMember(user, projectId, userId);
  } catch (e) {
    return toActionState(e);
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
