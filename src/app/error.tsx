"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";

/** Unexpected errors in any route below the root layout. Server errors arrive with a digest, not the details. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">The page could not be loaded. Try again in a moment.</p>
      {digest && <p className="text-xs text-muted">Reference: {digest}</p>}
      <button type="button" className="btn-primary" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
