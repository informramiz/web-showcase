import { expect, test } from "@playwright/test";

test("sign in, create a task and move it across the board", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill("demo@teamboard.dev");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  await page.getByRole("link", { name: /Website relaunch/ }).click();
  await expect(page.getByRole("heading", { name: "Website relaunch" })).toBeVisible();

  const title = `E2E task ${Date.now()}`;
  await page.getByLabel("New task title").fill(title);
  await page.getByLabel("New task title").press("Enter");

  const todo = page.getByTestId("column-todo");
  const inProgress = page.getByTestId("column-in_progress");
  const done = page.getByTestId("column-done");
  const card = (col: typeof todo) => col.getByTestId("task-card").filter({ hasText: title });
  await expect(card(todo)).toBeVisible();
  // The optimistic card is not draggable until the server confirms it (matters on a real network).
  await expect(card(todo)).toHaveAttribute("draggable", "true");

  // Drag and drop to "In progress".
  await card(todo).dragTo(inProgress);
  await expect(card(inProgress)).toBeVisible();
  await expect(card(todo)).toHaveCount(0);

  // The keyboard/mobile path: the "Move" select on the card.
  await card(inProgress).getByLabel(`Move "${title}"`).selectOption("done");
  await expect(card(done)).toBeVisible();

  // The move was saved on the server, not just in the cache.
  await page.reload();
  await expect(card(done)).toBeVisible();
});

test("wrong password shows one generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@teamboard.dev");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Next adds its own empty role="alert" route announcer, so match by text.
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
});
