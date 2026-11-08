import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/server/session";
import { BillingCard } from "@/features/billing/ui/billing-card";
import { CreateProjectForm } from "@/features/projects/ui/create-project-form";
import { getContainer } from "@/server/runtime";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const { projects: projectService, billing } = getContainer();
  const [projects, plan] = await Promise.all([projectService.listForUser(user), billing.status(user)]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {projects.length === 0 && <p className="text-muted">No projects yet. Create your first one.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="card block h-full p-4 transition hover:border-accent">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{p.role}</span>
                </div>
                {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                <p className="mt-3 text-xs text-muted">
                  {p.openTaskCount} open {p.openTaskCount === 1 ? "task" : "tasks"} · {p.memberCount}{" "}
                  {p.memberCount === 1 ? "member" : "members"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <aside className="space-y-4">
        <CreateProjectForm />
        {plan.enabled && <BillingCard status={plan} />}
      </aside>
    </div>
  );
}
