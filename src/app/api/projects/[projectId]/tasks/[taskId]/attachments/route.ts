import { NextResponse } from "next/server";
import { AppError } from "@/core/errors";
import { MAX_ATTACHMENT_BYTES } from "@/features/attachments/domain/limits";
import { withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/tasks/[taskId]/attachments">;

/** Room for the multipart boundaries and headers around the file itself. */
const MULTIPART_OVERHEAD = 64 * 1024;

/** Multipart upload with one `file` field. The declared length is checked before the body is buffered. */
export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { projectId, taskId } = await params;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES + MULTIPART_OVERHEAD)
    throw new AppError("too_large", "Files can be at most 5 MB");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("validation", "Choose a file", { file: ["Choose a file"] });
  const attachment = await getContainer().attachments.upload(user, projectId, taskId, {
    name: file.name,
    contentType: file.type,
    data: await file.arrayBuffer(),
  });
  return NextResponse.json(attachment, { status: 201 });
});
