/** Streams instantly on navigation inside /projects while the page's data loads. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-28 animate-pulse bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
