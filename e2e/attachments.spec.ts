import { expect, test } from "@playwright/test";
import { openBoard } from "./helpers";

test("upload a file to a task, download it, then delete it", async ({ page }) => {
  await openBoard(page, "demo@teamboard.dev", "Website relaunch");

  const title = `Files ${String(Date.now())}`;
  await page.getByLabel("New task title").fill(title);
  await page.getByLabel("New task title").press("Enter");
  const card = page.getByTestId("task-card").filter({ hasText: title });
  await expect(card).toHaveAttribute("draggable", "true");
  await card.getByRole("button", { name: title, exact: true }).click();

  const detail = page.getByTestId("task-detail");
  await expect(detail.getByText("No files yet.")).toBeVisible();
  const content = "id,name\n1,TeamBoard\n";
  await detail.getByTestId("attachment-input").setInputFiles({
    name: "notes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });
  const row = detail.getByTestId("attachment").filter({ hasText: "notes.csv" });
  await expect(row).toBeVisible();

  const download = page.waitForEvent("download");
  await row.getByRole("link", { name: "notes.csv" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("notes.csv");
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString()).toBe(content);

  // The upload is in the audit trail and survives a reload.
  await page.reload();
  await page
    .getByTestId("task-card")
    .filter({ hasText: title })
    .getByRole("button", { name: title, exact: true })
    .click();
  await expect(page.getByTestId("attachment").filter({ hasText: "notes.csv" })).toBeVisible();

  await page.getByRole("button", { name: "Delete notes.csv" }).click();
  await expect(page.getByTestId("task-detail").getByText("No files yet.")).toBeVisible();
});
