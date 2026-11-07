import { expect, test, type Page } from "@playwright/test";

// README screenshots. Skipped in normal runs; `SCREENSHOTS=1 npx playwright test screenshots` writes docs/screenshots/.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture README screenshots");

const views = [
  { name: "desktop", viewport: { width: 1280, height: 800 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
] as const;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@teamboard.dev");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${view.name} ${scheme}`, async ({ page }) => {
      await page.setViewportSize(view.viewport);
      await page.emulateMedia({ colorScheme: scheme });
      const shot = (screen: string) =>
        page.screenshot({ path: `docs/screenshots/${view.name}-${scheme}-${screen}.png` });

      if (scheme === "light") {
        await page.goto("/login");
        await shot("login");
      }
      await signIn(page);
      await shot("projects");
      await page.getByRole("link", { name: /Website relaunch/ }).click();
      await expect(page.getByTestId("task-card").first()).toBeVisible();
      await shot("board");
      await page.getByRole("tab", { name: "List" }).click();
      await expect(page.getByRole("table")).toBeVisible();
      await shot("list");
    });
  }
}
