import { expect, test, type APIRequestContext } from "@playwright/test";
import { normalizeProjectTopicName } from "../../src/utils/projectTopics";

interface CachedInboxItem {
  number: number;
  title: string;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  repoFullName: string;
  repoName: string;
  body: string;
  compositeId: string;
  comments: number;
  labels: {
    name: string;
    color: string;
  }[];
  type: "issue" | "pr";
}

interface ProjectTag {
  id: string;
  name: string;
  color: string;
  repos: string[];
}

interface Repo {
  name: string;
  full_name: string;
  html_url: string;
  updated_at: string;
  latest_commit_at: string | null;
  private: boolean;
}

interface BranchSummary {
  name: string;
  commit: {
    sha: string;
    date: string;
  };
}

interface ApiIssueLike {
  number: number;
  title: string;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  comments: number;
  labels: {
    name: string;
    color: string;
  }[];
  body: string | null;
}

interface ApiPullRequest {
  number: number;
  title: string;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  comments: number;
  labels: {
    name: string;
    color: string;
  }[];
  body: string | null;
}

interface OpenPRSelection {
  owner: string;
  name: string;
  fullName: string;
  number: number;
  title: string;
  body: string;
}

interface OpenItemSelection {
  owner: string;
  name: string;
  fullName: string;
  number: number;
  title: string;
  body: string;
}

interface ReposResponse {
  repos: Repo[];
}

interface PRDetailsResponse {
  ci_status?: {
    security_alerts?: {
      dependabotOpen: number;
      codeScanningOpen: number;
      secretScanningOpen: number;
      totalOpen: number;
    };
    runs?: unknown[];
  };
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} is not a valid timestamp: ${value}`);
  }
  return parsed;
}

function sortableLatestCommit(repo: Repo): number {
  if (repo.latest_commit_at === null) {
    return Number.NEGATIVE_INFINITY;
  }
  return parseTimestamp(`${repo.full_name} latest_commit_at`, repo.latest_commit_at);
}

function expectedLatestCommitOrder(repos: Repo[]): string[] {
  return [...repos]
    .sort((left, right) => {
      const rightTime = sortableLatestCommit(right);
      const leftTime = sortableLatestCommit(left);
      return rightTime - leftTime || left.full_name.localeCompare(right.full_name);
    })
    .map((repo) => repo.full_name);
}

function isIssueListPath(pathname: string): boolean {
  return /^\/api\/github\/repos\/[^/]+\/[^/]+\/issues(?:\?.*)?$/.test(pathname);
}

function isIssueSinglePath(pathname: string): boolean {
  return /^\/api\/github\/repos\/[^/]+\/[^/]+\/issues\/\d+$/.test(pathname);
}

function isPullListPath(pathname: string): boolean {
  return /^\/api\/github\/repos\/[^/]+\/[^/]+\/prs(?:\?.*)?$/.test(pathname);
}

function isPullSinglePath(pathname: string): boolean {
  return /^\/api\/github\/repos\/[^/]+\/[^/]+\/prs\/\d+$/.test(pathname);
}

test("repos endpoint exposes latest branch-head commit activity and sorts newest first", async ({ request }) => {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  if (reposPayload.repos.length < 2) {
    throw new Error("At least two live repositories are required to prove Explorer activity sorting.");
  }

  reposPayload.repos.forEach(sortableLatestCommit);

  expect(reposPayload.repos.map((repo) => repo.full_name)).toEqual(expectedLatestCommitOrder(reposPayload.repos));

  const witness = reposPayload.repos.find((repo) => repo.latest_commit_at !== null);
  if (!witness) {
    throw new Error("No live repository with branch-head commits was available to prove latest commit activity.");
  }
  const [owner, name] = witness.full_name.split("/");
  const branchesPayload = await (await request.get(`/api/github/repos/${owner}/${name}/branches`)).json() as BranchSummary[];
  if (branchesPayload.length === 0) {
    throw new Error(`Repository ${witness.full_name} has no branches to prove latest commit activity.`);
  }

  const latestBranchHeadCommit = Math.max(
    ...branchesPayload.map((branch) => parseTimestamp(`${witness.full_name}/${branch.name}`, branch.commit.date))
  );
  expect(sortableLatestCommit(witness)).toBe(latestBranchHeadCommit);
});

test("repository explorer cards use latest commit ordering and omit visibility labels", async ({ page, request }) => {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  if (reposPayload.repos.length < 2) {
    throw new Error("At least two live repositories are required to prove Explorer card ordering.");
  }
  const expectedNames = expectedLatestCommitOrder(reposPayload.repos)
    .slice(0, Math.min(6, reposPayload.repos.length))
    .map((fullName) => {
      const repo = reposPayload.repos.find((item) => item.full_name === fullName);
      if (!repo) {
        throw new Error(`Expected repository ${fullName} was not present in the live repo payload.`);
      }
      return repo.name;
    });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Repos \d+/ }).click();

  const explorerSurface = page.locator(".dockview-theme-abyss");
  await expect(explorerSurface.getByText("Newest branch-head commits first")).toBeVisible();
  await expect(explorerSurface.getByText(/\b(?:Private|Public)\b/)).toHaveCount(0);
  await expect(explorerSurface.getByText(expectedNames[0], { exact: true })).toBeVisible();
  await expect.poll(async () => explorerSurface.locator("h3").count()).toBeGreaterThanOrEqual(expectedNames.length);

  const visibleCardNames = (await explorerSurface.locator("h3").allTextContents())
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, expectedNames.length);
  expect(visibleCardNames).toEqual(expectedNames);
});

test("project mutation toasts show a spinner while the background topic write is running", async ({ page, request }) => {
  const reposResponse = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const projectName = `e2e-toast-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);
  const projectRepo = reposResponse.repos[0].full_name;
  let releaseTopicWrite: () => void = () => {};
  const topicWriteGate = new Promise<void>((resolve) => {
    releaseTopicWrite = resolve;
  });

  await page.route(/\/api\/github\/repos\/[^/]+\/[^/]+\/topics$/, async (route) => {
    await topicWriteGate;
    await route.continue();
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    await page.getByTestId(`sidebar-repo-${projectRepo.replace(/\//g, "-")}`).click({ button: "right" });
    await page.getByTestId("context-create-project-input").fill(projectName);
    await page.getByTestId("context-create-project-button").click();

    const savingToast = page.getByText("Saving").locator("xpath=ancestor::div[contains(@class, 'border')][1]");
    await expect(savingToast).toBeVisible();
    await expect(savingToast.locator(".animate-spin")).toHaveCount(1);
  } finally {
    releaseTopicWrite();
    await expect.poll(async () => {
      const tags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
      return tags.some((tag) => tag.id === projectTopic);
    }).toBe(true);
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});

async function discoverOpenPullRequest(request: APIRequestContext): Promise<OpenPRSelection | null> {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  for (const repo of reposPayload.repos) {
    const [owner, name] = repo.full_name.split("/");
    const prsPayload = await (await request.get(`/api/github/repos/${owner}/${name}/prs`)).json() as ApiPullRequest[] | { error: string };
    if (Array.isArray(prsPayload) && prsPayload.length > 0) {
      return {
        owner,
        name,
        fullName: repo.full_name,
        number: prsPayload[0].number,
        title: prsPayload[0].title,
        body: prsPayload[0].body || ""
      };
    }
  }
  return null;
}

async function discoverOpenIssue(request: APIRequestContext): Promise<OpenItemSelection | null> {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  for (const repo of reposPayload.repos) {
    const [owner, name] = repo.full_name.split("/");
    const issuesPayload = await (await request.get(`/api/github/repos/${owner}/${name}/issues`)).json() as ApiIssueLike[] | { error: string };
    if (Array.isArray(issuesPayload) && issuesPayload.length > 0 && isApiIssueLike(issuesPayload[0])) {
      return {
        owner,
        name,
        fullName: repo.full_name,
        number: issuesPayload[0].number,
        title: issuesPayload[0].title,
        body: issuesPayload[0].body || ""
      };
    }
  }
  return null;
}

function isApiIssueLike(value: unknown): value is ApiIssueLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  if (
    typeof item.number !== "number" ||
    typeof item.title !== "string" ||
    item.state !== "open" &&
    item.state !== "closed" ||
    typeof item.created_at !== "string" ||
    typeof item.updated_at !== "string" ||
    !item.user ||
    typeof item.user !== "object" ||
    typeof (item.user as Record<string, unknown>).login !== "string" ||
    typeof (item.user as Record<string, unknown>).avatar_url !== "string"
  ) {
    return false;
  }

  if (typeof item.comments !== "number" || !Array.isArray(item.labels) ||
    !((typeof item.body === "string" || item.body === null))
  ) {
    return false;
  }

  return item.labels.every((label) =>
    label && typeof label === "object" &&
    typeof (label as Record<string, unknown>).name === "string" &&
    typeof (label as Record<string, unknown>).color === "string"
  );
}

test("reopened Inbox renders cached items while live refresh is active", async ({ page }) => {
  const config = await page.request.get("/api/github/config");
  const payload = await config.json();
  if (!payload?.user?.login) {
    throw new Error("GitHub user context was not available while building cache assertions.");
  }

  const reposPayload = await (await page.request.get("/api/github/repos")).json() as ReposResponse;
  const signature = reposPayload.repos
    .map((repo) => `${repo.full_name}:${repo.latest_commit_at}`)
    .sort()
    .join("|");

  let cacheCandidate: CachedInboxItem | null = null;
  for (const repo of reposPayload.repos) {
    const [owner, name] = repo.full_name.split("/");
    const issuesPayload = await (await page.request.get(`/api/github/repos/${owner}/${name}/issues`)).json() as
      ApiIssueLike[] | { error: string };
    if (Array.isArray(issuesPayload) && issuesPayload.length > 0 && isApiIssueLike(issuesPayload[0])) {
      const issue = issuesPayload[0];
      cacheCandidate = {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        user: {
          login: issue.user.login,
          avatar_url: issue.user.avatar_url
        },
        repoName: name,
        repoFullName: repo.full_name,
        body: issue.body || "",
        compositeId: `issue-${repo.full_name}-${issue.number}`,
        comments: issue.comments,
        labels: issue.labels.map((label) => ({ name: label.name, color: label.color })),
        type: "issue"
      };
      break;
    }

    const prsPayload = await (await page.request.get(`/api/github/repos/${owner}/${name}/prs`)).json() as
      | ApiPullRequest[]
      | { error: string };
    if (Array.isArray(prsPayload) && prsPayload.length > 0 && isApiIssueLike(prsPayload[0])) {
      const pr = prsPayload[0];
      cacheCandidate = {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        user: {
          login: pr.user.login,
          avatar_url: pr.user.avatar_url
        },
        repoName: name,
        repoFullName: repo.full_name,
        body: pr.body || "",
        comments: pr.comments as number,
        labels: pr.labels.map((label) => ({ name: label.name, color: label.color })),
        type: "pr",
        compositeId: `pr-${repo.full_name}-${pr.number}`
      };
      break;
    }
  }

  if (!cacheCandidate) {
    throw new Error("No live open issue or PR found to build a deterministic inbox cache fixture.");
  }

  const cacheKey = `github_dashboard_inbox_cache:${payload.user.login}`;
  const seededCache = {
    repoSignature: signature,
    cachedAt: new Date().toISOString(),
    items: [cacheCandidate]
  };
  await page.addInitScript(({ key, cache }) => {
    localStorage.setItem(key, JSON.stringify(cache));
  }, { key: cacheKey, cache: seededCache });

  let delayedLiveRefreshCalls = 0;
  let releaseRefresh: () => void = () => {};
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });

  await page.route(/\/api\/github\/repos\/[^/]+\/[^/]+\/(issues|prs)$/, async (route) => {
    delayedLiveRefreshCalls += 1;
    await refreshGate;
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByText(/Updating cached Inbox/)).toBeVisible();
  await expect(page.getByText(/Cached .* ago/)).toBeVisible();
  await expect(page.getByText(cacheCandidate.title).first()).toBeVisible();

  releaseRefresh();
  await expect.poll(() => delayedLiveRefreshCalls).toBeGreaterThan(0);
});

test("real PR detail layout can be resized without obscuring security sidebar", async ({ page, request }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const selectedPR = await discoverOpenPullRequest(request);
  if (!selectedPR) {
    throw new Error("No open pull request fixture found for live PR layout e2e proof.");
  }

  await page.getByRole("button", { name: /^Repos \d+/ }).click();

  const normalizedRepo = selectedPR.fullName.replace(/\//g, "-");
  const repoRow = page.getByTestId(`sidebar-repo-${normalizedRepo}`);
  await expect(repoRow).toBeVisible();
  await repoRow.click();

  const prSubfolderRow = page.getByTestId(`sidebar-subfolder-${normalizedRepo}-prs`);
  await prSubfolderRow.scrollIntoViewIfNeeded();
  await expect(prSubfolderRow).toBeVisible();
  await prSubfolderRow.click();

  const prRow = page.getByTestId(`sidebar-pr-${normalizedRepo}-${selectedPR.number}`);
  await expect(prRow).toBeVisible();
  await prRow.click();

  const leftPanel = page.getByTestId("pr-detail-main-panel");
  const rightPanel = page.getByTestId("pr-detail-sidebar");
  const handle = page.locator(".cursor-col-resize").first();
  await expect(page.getByText(`Pull Request #${selectedPR.number}`)).toBeVisible();
  await expect(leftPanel).toBeVisible();
  await expect(rightPanel).toBeVisible();
  await expect(handle).toBeVisible();

  const leftBoxBefore = await leftPanel.boundingBox();
  const rightBoxBefore = await rightPanel.boundingBox();
  if (!leftBoxBefore || !rightBoxBefore) {
    throw new Error("Unable to measure PR detail panel dimensions.");
  }
  expect(leftBoxBefore.x + leftBoxBefore.width).toBeLessThanOrEqual(rightBoxBefore.x + 1);

  const handleBox = await handle.boundingBox();
  if (!handleBox) {
    throw new Error("Resize handle test target was not visible.");
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 150, handleBox.y + handleBox.height / 2, { steps: 12 });
  await page.mouse.up();

  const rightBoxAfter = await rightPanel.boundingBox();
  const leftBoxAfter = await leftPanel.boundingBox();
  if (!rightBoxAfter || !leftBoxAfter) {
    throw new Error("Unable to measure PR detail panel dimensions after resize.");
  }
  expect(rightBoxAfter.width).toBeGreaterThan(rightBoxBefore.width);
  expect(rightBoxAfter.width).toBeGreaterThan(0);
  expect(leftBoxAfter.x + leftBoxAfter.width).toBeLessThanOrEqual(rightBoxAfter.x + 1);

  await expect(rightPanel.getByText("Security Alerts", { exact: true })).toBeVisible();
  await expect(rightPanel.getByText(/CI Check suites/i)).toBeVisible();
  await expect(rightPanel.getByText(/No GitHub security alerts reported|\d+ security alerts/)).toBeVisible();
});

test("PR details endpoint fails loudly when security telemetry is unavailable", async ({ request }) => {
  const selectedPR = await discoverOpenPullRequest(request);
  if (!selectedPR) {
    throw new Error("No open pull request fixture found for PR details endpoint proof.");
  }

  const detailsResponse = await request.get(`/api/github/repos/${selectedPR.owner}/${selectedPR.name}/prs/${selectedPR.number}/details`);
  if (!detailsResponse.ok()) {
    expect(detailsResponse.status()).toBeGreaterThanOrEqual(400);
    return;
  }

  const detailsPayload = await detailsResponse.json() as PRDetailsResponse;
  expect(detailsPayload.ci_status).toBeTruthy();
  expect(detailsPayload.ci_status?.security_alerts).toBeDefined();
  expect(detailsPayload.ci_status?.security_alerts?.totalOpen).toBeGreaterThanOrEqual(0);
});

test("issue and PR detail views load summary from single-item endpoints", async ({ page, request }) => {
  const selectedIssue = await discoverOpenIssue(request);
  if (!selectedIssue) {
    throw new Error("No open issue fixture found for single-item issue loading e2e proof.");
  }

  const selectedPR = await discoverOpenPullRequest(request);
  if (!selectedPR) {
    throw new Error("No open pull request fixture found for single-item PR loading e2e proof.");
  }

  const calls = {
    issueList: 0,
    issueSingle: 0,
    issueComments: 0,
    prList: 0,
    prSingle: 0
  };

  await page.route(/\/api\/github\/repos\/[^/]+\/[^/]+\/(issues|prs).*/, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (isIssueSinglePath(pathname)) {
      calls.issueSingle += 1;
    } else if (isIssueListPath(pathname)) {
      calls.issueList += 1;
    } else if (pathname.endsWith("/comments") || /\/issues\/\d+\/comments$/.test(pathname)) {
      calls.issueComments += 1;
    } else if (isPullSinglePath(pathname)) {
      calls.prSingle += 1;
    } else if (isPullListPath(pathname)) {
      calls.prList += 1;
    } else if (pathname.endsWith("/files") || /\/prs\/\d+\/details$/.test(pathname)) {
      // passthrough for additional PR detail requests.
    }

    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Repos \d+/ }).click();

  const issueRepo = selectedIssue.fullName.replace(/\//g, "-");
  const issueRepoRow = page.getByTestId(`sidebar-repo-${issueRepo}`);
  await expect(issueRepoRow).toBeVisible();
  await issueRepoRow.click();

  await page.getByTestId(`sidebar-subfolder-${issueRepo}-issues`).click();
  calls.issueList = 0;
  calls.issueSingle = 0;
  calls.issueComments = 0;
  calls.prList = 0;
  calls.prSingle = 0;

  const issueRow = page.getByTestId(`sidebar-issue-${issueRepo}-${selectedIssue.number}`);
  await expect(issueRow).toBeVisible();
  await issueRow.first().click();

  await expect(page.getByText(`Issue #${selectedIssue.number}`)).toBeVisible();
  expect(calls.issueSingle).toBeGreaterThan(0);
  expect(calls.issueList).toBe(0);

  const prRepo = selectedPR.fullName.replace(/\//g, "-");
  const prRepoRow = page.getByTestId(`sidebar-repo-${prRepo}`);
  await prRepoRow.click();
  await page.getByTestId(`sidebar-subfolder-${prRepo}-prs`).click();

  calls.issueList = 0;
  calls.issueSingle = 0;
  calls.issueComments = 0;
  calls.prList = 0;
  calls.prSingle = 0;

  const prRow = page.getByTestId(`sidebar-pr-${prRepo}-${selectedPR.number}`);
  await expect(prRow).toBeVisible();
  await prRow.first().click();

  await expect(page.getByText(`Pull Request #${selectedPR.number}`)).toBeVisible();
  expect(calls.prSingle).toBeGreaterThan(0);
  expect(calls.prList).toBe(0);
});

test("single-item endpoints fail loudly when resource shape or id is wrong", async ({ request }) => {
  const selectedIssue = await discoverOpenIssue(request);
  if (!selectedIssue) {
    throw new Error("No open issue fixture found for single-item negative-path e2e proof.");
  }

  const selectedPR = await discoverOpenPullRequest(request);
  if (!selectedPR) {
    throw new Error("No open pull request fixture found for single-item negative-path e2e proof.");
  }

  const issueShapeRes = await request.get(`/api/github/repos/${selectedPR.owner}/${selectedPR.name}/issues/${selectedPR.number}`);
  expect(issueShapeRes.status()).toBe(400);

  const missingIssueRes = await request.get(`/api/github/repos/${selectedIssue.owner}/${selectedIssue.name}/issues/0`);
  expect(missingIssueRes.ok()).toBeFalsy();

  const missingPrRes = await request.get(`/api/github/repos/${selectedIssue.owner}/${selectedIssue.name}/prs/0`);
  expect(missingPrRes.ok()).toBeFalsy();
});

test("rapid repo project assignments settle to server-canonical project state", async ({ page, request }) => {
  const projectName = `e2e-project-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);
  const reposResponse = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const targetRepos = reposResponse.repos.slice(0, 3).map((repo) => repo.full_name);

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    for (const repoFullName of targetRepos) {
      await page.getByTestId(`sidebar-repo-${repoFullName.replace(/\//g, "-")}`).click({ button: "right" });
      await page.getByTestId("context-create-project-input").fill(projectName);
      await page.getByTestId("context-create-project-button").click();
    }

    await expect.poll(async () => {
      const tags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
      return tags.find((tag) => tag.id === projectTopic)?.repos.length ?? 0;
    }).toBe(3);
  } finally {
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});

test("opening a project dashboard does not apply the explorer project filter", async ({ page, request }) => {
  const reposResponse = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const projectName = `e2e-dashboard-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);
  const projectRepo = reposResponse.repos[0].full_name;

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    const normalizedProjectRepo = projectRepo.replace(/\//g, "-");
    await page.getByTestId(`sidebar-repo-${normalizedProjectRepo}`).click({ button: "right" });
    await page.getByTestId("context-create-project-input").fill(projectName);
    await page.getByTestId("context-create-project-button").click();
    await page.getByRole("button", { name: projectTopic }).first().click();

    await expect(page.getByRole("heading", { name: projectTopic })).toBeVisible();
    await expect(page.getByTestId("project-dashboard-repo").filter({ hasText: projectRepo })).toBeVisible();
    await expect(page.getByText("Explorer filter:")).toBeVisible();
    await expect(page.getByText("Unchanged")).toBeVisible();
    await expect(page.getByText("Project:")).toHaveCount(0);
  } finally {
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});

test("repo right-click menu can create a project containing that repo", async ({ page, request }) => {
  const reposResponse = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const projectName = `e2e-context-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);
  const projectRepo = reposResponse.repos[0].full_name;
  const projectRepoUrl = reposResponse.repos[0].html_url;

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    const normalizedProjectRepo = projectRepo.replace(/\//g, "-");
    await page.getByTestId(`sidebar-repo-${normalizedProjectRepo}`).click({ button: "right" });
    await expect(page.getByTestId("context-open-github")).toHaveAttribute("href", projectRepoUrl);
    await page.getByTestId("context-create-project-input").fill(projectName);
    await page.getByTestId("context-create-project-button").click();

    await expect.poll(async () => {
      const tags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
      return tags.find((tag) => tag.name === projectTopic)?.repos;
    }).toEqual([projectRepo]);
  } finally {
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});
