import { expect, type Page } from "@playwright/test";

/** Signs in with a seeded account and opens a project board. */
export async function openBoard(page: Page, email: string, project: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(project) }).click();
  await expect(page.getByRole("heading", { name: project })).toBeVisible();
}
