import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name").max(80),
  description: z.string().trim().max(500).default(""),
});

export const updateProjectSchema = createProjectSchema.partial();

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
});
