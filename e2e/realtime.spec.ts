import { expect, test } from "@playwright/test";
import { openBoard } from "./helpers";

// Locally the live channel is SSE; on Cloudflare the same hook uses the Durable Object WebSocket.
test("a task created by one member appears on another member's board without a reload", async ({ browser }) => {
  const demo = await browser.newContext();
  const sam = await browser.newContext();
  try {
    const a = await demo.newPage();
    const b = await sam.newPage();
    await openBoard(a, "demo@teamboard.dev", "Website relaunch");
    await openBoard(b, "sam@teamboard.dev", "Website relaunch");
    await expect(a.getByTestId("realtime-status")).toHaveText("Live");
    await expect(b.getByTestId("realtime-status")).toHaveText("Live");

    const title = `Realtime ${String(Date.now())}`;
    await a.getByLabel("New task title").fill(title);
    await a.getByLabel("New task title").press("Enter");

    const onB = b.getByTestId("column-todo").getByTestId("task-card").filter({ hasText: title });
    await expect(onB).toBeVisible({ timeout: 10_000 });

    // A move on B shows up on A too.
    await expect(onB).toHaveAttribute("draggable", "true");
    await onB.getByLabel(`Move "${title}"`).selectOption("done");
    await expect(a.getByTestId("column-done").getByTestId("task-card").filter({ hasText: title })).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await demo.close();
    await sam.close();
  }
});
