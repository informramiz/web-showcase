import { NextResponse } from "next/server";
import { AppError } from "@/core/errors";
import { MAX_ATTACHMENT_BYTES } from "@/features/attachments/domain/limits";
import { readBodyLimited, withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/tasks/[taskId]/attachments">;

/** Room for the multipart boundaries and headers around the file itself. */
const MULTIPART_OVERHEAD = 64 * 1024;

/**
 * Multipart upload with one `file` field. The body is read through a byte-counting limit before it is parsed,
 * so an oversized or mislabelled request is cut off instead of being buffered whole by formData().
 */
export const POST = withUser<Ctx>(async (req, user, { params }) => {
  const { projectId, taskId } = await params;
  const body = await readBodyLimited(req, MAX_ATTACHMENT_BYTES + MULTIPART_OVERHEAD);
  const multipart = new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } });
  const form = await multipart.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("validation", "Choose a file", { file: ["Choose a file"] });
  const attachment = await getContainer().attachments.upload(user, projectId, taskId, {
    name: file.name,
    contentType: file.type,
    data: await file.arrayBuffer(),
  });
  return NextResponse.json(attachment, { status: 201 });
});
