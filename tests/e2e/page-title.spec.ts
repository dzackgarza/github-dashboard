import { expect, test } from "@playwright/test";

test("root page uses the dashboard browser tab title", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("GitHub PR Dashboard");
});
