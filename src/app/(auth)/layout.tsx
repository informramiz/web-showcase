import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server/session";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getCurrentUser()) redirect("/projects");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <span className="grid size-8 place-items-center rounded-md bg-accent text-accent-fg">T</span>
        TeamBoard
      </div>
      {children}
    </main>
  );
}
