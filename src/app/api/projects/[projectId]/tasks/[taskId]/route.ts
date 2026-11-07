import { NextResponse } from "next/server";
import { readJson, withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/tasks/[taskId]">;

export const PATCH = withUser<Ctx>(async (req, user, { params }) => {
  const { projectId, taskId } = await params;
  return NextResponse.json(await getContainer().tasks.update(user, projectId, taskId, await readJson(req)));
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  const { projectId, taskId } = await params;
  await getContainer().tasks.delete(user, projectId, taskId);
  return new NextResponse(null, { status: 204 });
});
