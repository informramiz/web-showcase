import { NextResponse } from "next/server";
import { contentDisposition } from "@/features/attachments/server/content-disposition";
import { withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]">;

/**
 * Authorized download: the bucket is never public, every byte goes through the membership check. Always sent
 * as an attachment with nosniff so the browser can't be talked into rendering an uploaded file as a page.
 */
export const GET = withUser<Ctx>(async (_req, user, { params }) => {
  const { projectId, taskId, attachmentId } = await params;
  const { attachment, body } = await getContainer().attachments.download(user, projectId, taskId, attachmentId);
  return new Response(body, {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Length": String(attachment.size),
      "Content-Disposition": contentDisposition(attachment.name),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

export const DELETE = withUser<Ctx>(async (_req, user, { params }) => {
  const { projectId, taskId, attachmentId } = await params;
  await getContainer().attachments.delete(user, projectId, taskId, attachmentId);
  return new NextResponse(null, { status: 204 });
});
