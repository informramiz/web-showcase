import { NextResponse } from "next/server";
import { withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/realtime">;

/** Tells the browser how to receive live updates: a ticketed WebSocket URL, an SSE URL, or a poll interval. */
export const GET = withUser<Ctx>(async (_req, user, { params }) => {
  const { projectId } = await params;
  const connection = await getContainer().realtime.connection(user, projectId);
  return NextResponse.json(connection, { headers: { "Cache-Control": "no-store" } });
});
