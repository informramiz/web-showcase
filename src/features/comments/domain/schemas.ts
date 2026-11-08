import { z } from "zod";

export const COMMENT_MAX = 2000;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(COMMENT_MAX),
});
