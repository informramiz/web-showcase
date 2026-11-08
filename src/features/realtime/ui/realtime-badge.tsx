import type { RealtimeStatus } from "./use-project-events";

const LABEL: Record<RealtimeStatus, string> = { connecting: "Connecting…", live: "Live", polling: "Polling" };
const DOT: Record<RealtimeStatus, string> = {
  connecting: "bg-amber-500",
  live: "bg-emerald-500",
  polling: "bg-muted",
};

export function RealtimeBadge({ status }: { status: RealtimeStatus }) {
  return (
    <span data-testid="realtime-status" className="inline-flex items-center gap-1.5 ml-auto text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${DOT[status]}`} />
      {LABEL[status]}
    </span>
  );
}
