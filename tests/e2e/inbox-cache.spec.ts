import { expect, test } from "@playwright/test";

interface CachedInboxItem {
  title: string;
  repoFullName: string;
  compositeId: string;
}

interface ProjectTag {
  id: string;
  name: string;
  color: string;
  repos: string[];
}

interface Repo {
  full_name: string;
}

interface ReposResponse {
  repos: Repo[];
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

test("rapid repo project assignments settle to server-canonical project state", async ({ page, request }) => {
  const originalTags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
  const projectName = `e2e-project-${Date.now()}`;
  const testProject: ProjectTag = {
    id: `proj-e2e-${Date.now()}`,
    name: projectName,
    color: "#3b82f6",
    repos: []
  };

  await request.post("/api/github/projects", {
    data: { tags: [...originalTags, testProject] }
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();

    const assignmentSelects = page.getByTestId("repo-card-project-select");
    await expect.poll(() => assignmentSelects.count()).toBeGreaterThan(2);

    await assignmentSelects.evaluateAll((selects, projectId) => {
      selects.slice(0, 3).forEach((select) => {
        const element = select as HTMLSelectElement;
        element.value = projectId as string;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }, testProject.id);

    await expect(page.getByText(/Saving|Queued/).first()).toBeVisible();
    await expect.poll(async () => {
      const tags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
      return tags.find((tag) => tag.id === testProject.id)?.repos.length ?? 0;
    }).toBe(3);
  } finally {
    await request.post("/api/github/projects", {
      data: { tags: originalTags }
    });
  }
});

test("opening a project dashboard does not apply the explorer project filter", async ({ page, request }) => {
  const originalTags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
  const reposResponse = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const projectName = `e2e-dashboard-${Date.now()}`;
  const projectRepo = reposResponse.repos[0].full_name;
  const testProject: ProjectTag = {
    id: `proj-dashboard-${Date.now()}`,
    name: projectName,
    color: "#10b981",
    repos: [projectRepo]
  };

  await request.post("/api/github/projects", {
    data: { tags: [...originalTags, testProject] }
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    await page.getByRole("button", { name: projectName }).first().click();

    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByTestId("project-dashboard-repo").filter({ hasText: projectRepo })).toBeVisible();
    await expect(page.getByText("Explorer filter:")).toBeVisible();
    await expect(page.getByText("Unchanged")).toBeVisible();
    await expect(page.getByText("Project:")).toHaveCount(0);
  } finally {
    await request.post("/api/github/projects", {
      data: { tags: originalTags }
    });
  }
});
