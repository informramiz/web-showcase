import { NextResponse } from "next/server";
import { readJson, withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/tasks">;

/** GET ?search=&status=&assigneeId=&page=&pageSize= */
export const GET = withUser<Ctx>(async (req, user, { params }) => {
  const { projectId } = await params;
  const query = Object.fromEntries(req.nextUrl.searchParams);
  return NextResponse.json(await getContainer().tasks.list(user, projectId, query));
});

export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { projectId } = await params;
  const task = await getContainer().tasks.create(user, projectId, await readJson(req));
  return NextResponse.json(task, { status: 201 });
});
