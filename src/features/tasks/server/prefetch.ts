import "server-only";
import { dehydrate, QueryClient, type DehydratedState } from "@tanstack/react-query";
import type { User } from "@/features/auth/domain/types";
import { getContainer } from "@/server/runtime";
import { toTaskJson } from "../domain/types";
import { boardQuery, taskListOptions } from "../ui/queries";

/**
 * Loads the unfiltered board on the server so the first paint has cards instead of a spinner. The query function
 * calls the service directly (a relative API URL does not resolve on the server); the key matches the client's.
 */
export async function prefetchBoard(user: User, projectId: string): Promise<DehydratedState> {
  const queryClient = new QueryClient();
  const q = boardQuery();
  // Awaited and not swallowed: an unexpected failure belongs in the route error boundary.
  await queryClient.query({
    ...taskListOptions(projectId, q),
    queryFn: async () => {
      const page = await getContainer().tasks.list(user, projectId, q);
      return { ...page, items: page.items.map(toTaskJson) };
    },
  });
  return dehydrate(queryClient);
}
