/**
 * Enters the shared demo workspace. A POST, because it creates a session: a GET must stay safe (link
 * prefetchers, crawlers and cross-site <img>/<a> requests must not be able to sign anyone in).
 * A plain HTML form, so it works without JavaScript and is not nested in the sign-in form.
 */
export function DemoEntry({ className = "btn-ghost w-full" }: { className?: string }) {
  return (
    <form action="/api/demo" method="post" className="w-full">
      <button type="submit" className={className}>
        Explore the live demo
      </button>
    </form>
  );
}
