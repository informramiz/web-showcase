import Link from "next/link";
import { logoutAction } from "@/features/auth/server/actions";
import { requireUser } from "@/features/auth/server/session";
import { Avatar } from "@/components/avatar";

export default async function ProjectsLayout({ children }: LayoutProps<"/projects">) {
  const user = await requireUser();
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link href="/projects" className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-md bg-accent text-sm text-accent-fg">T</span>
            TeamBoard
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Avatar name={user.name} size="sm" />
            <span className="hidden text-sm sm:inline">{user.name}</span>
            <form action={logoutAction}>
              <button className="btn-ghost py-1.5">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
