import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found" };

/** Unknown URLs, and projects the user is not a member of (the service reports both as not_found). */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">It does not exist, or you do not have access to it.</p>
      <Link href="/projects" className="btn-primary">
        Back to projects
      </Link>
    </main>
  );
}
