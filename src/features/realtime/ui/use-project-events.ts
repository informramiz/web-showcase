"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ProjectEvent, RealtimeConnection } from "../domain/types";

export type RealtimeStatus = "connecting" | "live" | "polling";

/** After this many failed connects in a row, stop retrying the push channel and poll instead. */
const MAX_FAILURES = 5;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 15_000;
/** Keeps intermediaries from dropping an idle socket; the Durable Object answers without waking up. */
const SOCKET_PING_MS = 30_000;
const FALLBACK_POLL_MS = 10_000;

/**
 * Keeps a project's task queries fresh while the page is open. Events only say "something changed"; the hook
 * invalidates the cached queries and React Query refetches through the normal authorized API.
 */
export function useProjectEvents(projectId: string, currentUserId: string): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    let stopped = false;
    let failures = 0;
    let teardown: () => void = () => undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      void qc.invalidateQueries({ queryKey: ["task-detail", projectId] });
    };
    const onEvent = (data: string) => {
      const event = JSON.parse(data) as ProjectEvent;
      // Our own mutations already invalidate on success.
      if (event.actorId !== currentUserId) refresh();
    };
    const poll = (intervalMs: number) => {
      setStatus("polling");
      const id = setInterval(refresh, intervalMs);
      teardown = () => clearInterval(id);
    };
    const retry = () => {
      teardown();
      if (stopped) return;
      failures += 1;
      if (failures >= MAX_FAILURES) return poll(FALLBACK_POLL_MS);
      setStatus("connecting");
      retryTimer = setTimeout(() => void connect(), Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** failures));
    };
    const opened = () => {
      failures = 0;
      setStatus("live");
      // Catch up on anything missed while disconnected.
      refresh();
    };

    async function connect() {
      let descriptor: RealtimeConnection;
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/realtime`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        descriptor = (await res.json()) as RealtimeConnection;
      } catch {
        return retry();
      }
      if (stopped) return;

      if (descriptor.transport === "poll") return poll(descriptor.intervalMs);
      if (descriptor.transport === "sse") {
        const source = new EventSource(descriptor.url);
        source.onopen = opened;
        source.onmessage = (e: MessageEvent<string>) => onEvent(e.data);
        // EventSource reconnects by itself, but our fresh-descriptor + backoff policy is easier to reason about.
        source.onerror = retry;
        teardown = () => source.close();
        return;
      }
      const url = new URL(descriptor.url, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url);
      const ping = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send("ping");
      }, SOCKET_PING_MS);
      socket.onopen = opened;
      socket.onmessage = (e: MessageEvent<string>) => {
        if (e.data !== "pong") onEvent(e.data);
      };
      socket.onclose = retry;
      teardown = () => {
        clearInterval(ping);
        socket.onclose = null;
        socket.close();
      };
    }

    void connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      teardown();
    };
  }, [qc, projectId, currentUserId]);

  return status;
}
