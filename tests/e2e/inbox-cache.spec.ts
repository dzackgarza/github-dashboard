import { expect, test } from "@playwright/test";

interface CachedInboxItem {
  title: string;
  repoFullName: string;
  compositeId: string;
}

test("reopened Inbox renders cached items while live refresh is active", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const cachedItem = await page.waitForFunction(() => {
    const cacheKey = Object.keys(localStorage).find((key) =>
      key.startsWith("github_dashboard_inbox_cache:"),
    );
    if (!cacheKey) {
      return null;
    }

    const payload = JSON.parse(localStorage.getItem(cacheKey) ?? "");
    const firstItem = payload.items?.[0];
    if (!firstItem?.title || !firstItem?.repoFullName || !firstItem?.compositeId) {
      return null;
    }

    return {
      title: firstItem.title,
      repoFullName: firstItem.repoFullName,
      compositeId: firstItem.compositeId,
    };
  });

  const firstItem = await cachedItem.jsonValue() as CachedInboxItem;
  let delayedLiveRefreshCalls = 0;

  await page.route(/\/api\/github\/repos\/[^/]+\/[^/]+\/(issues|prs)$/, async (route) => {
    delayedLiveRefreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.continue();
  });

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByText(/Updating cached Inbox/)).toBeVisible();
  await expect(page.getByText(/Cached .* ago/)).toBeVisible();
  await expect(page.getByText(firstItem.title).first()).toBeVisible();
  await expect
    .poll(() => delayedLiveRefreshCalls, {
      message: `background refresh should request live issue or PR data after rendering cached item ${firstItem.compositeId} from ${firstItem.repoFullName}`,
    })
    .toBeGreaterThan(0);
});
