import { expect, test } from "@playwright/test";

test("GET /api/demo is safe: it never starts a session", async ({ request }) => {
  const res = await request.get("/api/demo", { maxRedirects: 0 });
  expect(res.status()).toBe(405);
  expect(res.headers()["set-cookie"]).toBeUndefined();
});

test("the demo button signs in through a POST", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Explore the live demo" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});
