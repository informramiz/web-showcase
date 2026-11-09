import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server/session";
import { DemoEntry } from "@/features/auth/ui/demo-entry";

// Signed-in users go to their boards. Everyone else gets one click into the live demo (a POST, see
// /api/demo) or the normal sign-in page.
export default async function Home() {
  if (await getCurrentUser()) redirect("/projects");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <span className="grid size-8 place-items-center rounded-md bg-accent text-accent-fg">T</span>
        TeamBoard
      </div>
      <div className="card w-full max-w-sm space-y-4 p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Team task boards, live</h1>
        <p className="text-sm text-muted">No sign-up needed. Open a populated workspace and try it.</p>
        <DemoEntry className="btn-primary w-full" />
        <Link href="/login" className="block text-sm font-medium text-accent hover:underline">
          Sign in instead
        </Link>
      </div>
    </main>
  );
}
