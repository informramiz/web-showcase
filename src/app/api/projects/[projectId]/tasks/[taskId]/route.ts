import { NextResponse } from "next/server";
import { readJson, withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/tasks/[taskId]">;

/** Task detail: the task plus its comments, files and audit trail, in one round trip. */
export const GET = withUser<Ctx>(async (_req, user, { params }) => {
  const { projectId, taskId } = await params;
  const c = getContainer();
  const task = await c.tasks.get(user, projectId, taskId);
  const [comments, attachments, activity] = await Promise.all([
    c.comments.list(user, projectId, taskId),
    c.attachments.list(user, projectId, taskId),
    c.activity.listForTask(user, projectId, taskId),
  ]);
  return NextResponse.json({
    task,
    comments,
    attachments,
    activity,
    attachmentsEnabled: c.attachments.enabled,
  });
});

export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const { projectId, taskId } = await params;
  return NextResponse.json(await getContainer().tasks.update(user, projectId, taskId, await readJson(req)));
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  const { projectId, taskId } = await params;
  await getContainer().tasks.delete(user, projectId, taskId);
  return new NextResponse(null, { status: 204 });
});
