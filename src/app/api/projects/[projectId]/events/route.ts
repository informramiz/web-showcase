import { withUser } from "@/server/http";
import { getContainer } from "@/server/runtime";

type Ctx = RouteContext<"/api/projects/[projectId]/events">;

/** Keeps idle proxies from closing the stream. */
const HEARTBEAT_MS = 25_000;

/** Local Server-Sent Events stream (developer.mozilla.org/docs/Web/API/Server-sent_events). */
export const GET = withUser<Ctx>(async (req, user, { params }) => {
  const { projectId } = await params;
  const encoder = new TextEncoder();
  let send: (text: string) => void = () => undefined;
  // Subscribe before answering, so a membership or transport failure is a normal error response, not a 200.
  const unsubscribe = await getContainer().realtime.subscribe(user, projectId, (event) =>
    send(`data: ${JSON.stringify(event)}\n\n`),
  );
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send = (text) => controller.enqueue(encoder.encode(text));
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      req.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
      send(": connected\n\n");
    },
    cancel: cleanup,
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" },
  });
});
