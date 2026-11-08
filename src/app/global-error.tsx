"use client"; // Error boundaries must be Client Components.

import "./globals.css";

/** Replaces the root layout when it fails, so it renders its own document. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-3 px-4 text-center font-sans">
        <title>Something went wrong · TeamBoard</title>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <button type="button" className="btn-primary" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
