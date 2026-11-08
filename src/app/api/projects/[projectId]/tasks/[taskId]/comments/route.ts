import { NextResponse } from "next/server";
import { readJson, withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/tasks/[taskId]/comments">;

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { projectId, taskId } = await params;
  const comment = await getContainer().comments.add(user, projectId, taskId, await readJson(req));
  return NextResponse.json(comment, { status: 201 });
});
