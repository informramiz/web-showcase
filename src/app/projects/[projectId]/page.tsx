import { HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isAppError } from "@/core/errors";
import { requireUser } from "@/features/auth/server/session";
import type { ProjectDetail } from "@/features/projects/domain/types";
import { MembersPanel } from "@/features/projects/ui/members-panel";
import { prefetchBoard } from "@/features/tasks/server/prefetch";
import { TaskWorkspace } from "@/features/tasks/ui/task-workspace";
import { getContainer } from "@/server/runtime";

/** Memoized per request, so generateMetadata and the page share one database read. */
const getProject = cache(async (projectId: string): Promise<ProjectDetail> => {
  const user = await requireUser();
  try {
    return await getContainer().projects.get(user, projectId);
  } catch (e) {
    if (isAppError(e) && e.kind === "not_found") notFound();
    throw e;
  }
});

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const project = await getProject((await params).projectId);
  return { title: project.name };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const user = await requireUser();
  const project = await getProject(projectId);
  const board = await prefetchBoard(user, project.id);
  const members = project.members.map(({ id, name }) => ({ id, name }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-muted hover:text-text">
          ← Projects
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
        {project.description && <p className="text-sm text-muted">{project.description}</p>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
        <HydrationBoundary state={board}>
          <TaskWorkspace projectId={project.id} members={members} role={project.role} currentUserId={user.id} />
        </HydrationBoundary>
        <aside>
          <MembersPanel projectId={project.id} members={project.members} role={project.role} />
        </aside>
      </div>
    </div>
  );
}
