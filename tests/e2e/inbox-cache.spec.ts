import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import assert from "node:assert/strict";
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
  archived: boolean;
  topics: string[];
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

interface TemporaryPullRequestSelection extends OpenItemSelection {
  branchName: string;
}

type LabeledItemCleanup =
  | { kind: "none" }
  | { kind: "temporary-label" }
  | { kind: "temporary-pr-and-label"; branchName: string };

interface LabeledItemSelection extends OpenItemSelection {
  label: string;
  cleanup: LabeledItemCleanup;
}

interface ReposResponse {
  repos: Repo[];
  projectTags: ProjectTag[];
}

interface GitHubRepoDetails {
  default_branch: string;
}

interface GitHubRefResponse {
  object: {
    sha: string;
  };
}

interface GitHubPullRequestResponse {
  number: number;
  title: string;
  body: string | null;
}

interface GitHubRepoTruth {
  full_name: string;
  archived: boolean;
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

function githubApiHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  assert(typeof token === "string" && token.trim().length > 0, "GITHUB_TOKEN is required for live GitHub API truth.");
  return {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "GitHub-PR-Issue-Manager-Dashboard"
  };
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
  const githubReposResponse = await request.get("https://api.github.com/user/repos?per_page=100&sort=updated", {
    headers: githubApiHeaders()
  });
  if (!githubReposResponse.ok()) {
    throw new Error(`GitHub repository truth request failed with HTTP ${githubReposResponse.status()}.`);
  }
  const githubRepos = await githubReposResponse.json() as GitHubRepoTruth[];
  const expectedActiveRepoNames = githubRepos
    .filter((repo) => !repo.archived)
    .map((repo) => repo.full_name)
    .sort((left, right) => left.localeCompare(right));
  const indexedRepoNames = reposPayload.repos
    .map((repo) => repo.full_name)
    .sort((left, right) => left.localeCompare(right));

  expect(indexedRepoNames).toEqual(expectedActiveRepoNames);
  expect(reposPayload.repos.filter((repo) => repo.archived).map((repo) => repo.full_name)).toEqual([]);

  const indexedRepoNameSet = new Set(indexedRepoNames);
  const projectReposOutsideIndex = [...new Set(reposPayload.projectTags.flatMap((tag) => tag.repos))]
    .filter((fullName) => !indexedRepoNameSet.has(fullName))
    .sort((left, right) => left.localeCompare(right));
  expect(projectReposOutsideIndex).toEqual([]);

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

test("repository and project navigation uses canonical dashboard actions and standard copy", async ({ page, request }) => {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const targetRepo = reposPayload.repos.find((repo) => repo.latest_commit_at !== null) ?? reposPayload.repos[0];
  if (!targetRepo) {
    throw new Error("At least one live repository is required to prove repository navigation.");
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: /^Projects \d+/ }).click();
  const explorerSurface = page.locator(".dockview-theme-abyss");
  await expect(explorerSurface.getByTestId("projects-dashboard")).toBeVisible();
  await expect(explorerSurface.getByTestId("project-card").first()).toBeVisible();
  await expect(explorerSurface.getByTestId("repo-card").filter({ hasText: targetRepo.name })).toHaveCount(0);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Repos \d+/ }).click();

  await expect(explorerSurface.getByPlaceholder("Search repositories")).toBeVisible();
  await expect(explorerSurface.getByText("Fuzzy match / character subsequence")).toHaveCount(0);

  const firstRepoCard = explorerSurface.locator("[data-testid='repo-card']").first();
  await expect(firstRepoCard).toBeVisible();
  await expect(firstRepoCard.getByRole("button", { name: /^Open repository dashboard/ })).toBeVisible();
  await expect(firstRepoCard.getByRole("img")).toHaveCount(0);

  await firstRepoCard.getByRole("button", { name: /^Open repository dashboard/ }).click();
  await expect(explorerSurface.getByText("Last updated:")).toBeVisible();
  await expect(explorerSurface.getByText("Sync:")).toHaveCount(0);
  await expect(explorerSurface.getByText("Pull Request Branches")).toHaveCount(0);
  await expect(explorerSurface.getByText("Active Branches")).toHaveCount(0);
  await expect(explorerSurface.getByText(/^PRs \(/)).toBeVisible();
  await expect(explorerSurface.getByText(/^Branches \(/)).toBeVisible();
});

test("repo and project cards use the canonical assignment dialog without body navigation", async ({ page, request }) => {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const targetRepo = reposPayload.repos[0];
  if (!targetRepo) {
    throw new Error("At least one live repository is required to prove canonical card behavior.");
  }
  const projectName = `e2e-card-dialog-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);

  try {
    await addTopicToRepo(request, targetRepo, projectTopic);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    const explorerSurface = page.locator(".dockview-theme-abyss");

    await expect(explorerSurface.getByTestId("repo-card-project-select")).toHaveCount(0);
    await expect(explorerSurface.getByTestId("repo-dashboard-project-select")).toHaveCount(0);

    const repoCard = explorerSurface.getByTestId("repo-card").filter({ hasText: targetRepo.name }).first();
    await expect(repoCard).toBeVisible();
    await expect(repoCard.getByRole("button", { name: "Manage projects" })).toBeVisible({ timeout: 5_000 });
    await repoCard.getByRole("button", { name: "Manage projects" }).click();
    await expect(page.getByTestId("project-assignment-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel assignment" }).click();

    await repoCard.getByRole("button", { name: /^Open repository dashboard/ }).click();
    await expect(explorerSurface.getByRole("button", { name: "Manage projects" })).toBeVisible({ timeout: 5_000 });
    await explorerSurface.getByRole("button", { name: "Manage projects" }).click();
    await expect(page.getByTestId("project-assignment-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel assignment" }).click();

    await page.getByRole("button", { name: projectTopic }).first().click();
    const projectRepoCard = explorerSurface.getByTestId("repo-card").filter({ hasText: targetRepo.full_name }).first();
    await expect(projectRepoCard).toBeVisible();
    await projectRepoCard.click();
    await expect(explorerSurface.getByTestId("project-dashboard")).toBeVisible();
    await expect(explorerSurface.getByText("Project Repositories")).toBeVisible();
  } finally {
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});

test("workspace breadcrumbs open parent dashboards through workspace tabs", async ({ page, request }) => {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const selectedIssue = await discoverOpenIssue(request);
  if (!selectedIssue) {
    throw new Error("No open issue fixture found for workspace breadcrumb proof.");
  }
  const targetRepo = reposPayload.repos.find((repo) => repo.full_name === selectedIssue.fullName);
  if (!targetRepo) {
    throw new Error(`Issue repository ${selectedIssue.fullName} was not present in the repository index.`);
  }
  const projectName = `e2e-breadcrumb-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);

  try {
    await addTopicToRepo(request, targetRepo, projectTopic);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    const explorerSurface = page.locator(".dockview-theme-abyss");

    await page.getByTestId(`sidebar-repo-${normalizedRepoTestId(selectedIssue.fullName)}`).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open Repo Dashboard" }).click();
    const repoBreadcrumbs = explorerSurface.getByTestId("workspace-breadcrumbs");
    await expect(repoBreadcrumbs.getByRole("button", { name: "Repositories" })).toBeVisible();
    await repoBreadcrumbs.getByRole("button", { name: "Repositories" }).click();
    await expect(explorerSurface.getByPlaceholder("Search repositories")).toBeVisible();

    await page.getByRole("button", { name: projectTopic }).first().click();
    const projectBreadcrumbs = explorerSurface.getByTestId("workspace-breadcrumbs");
    await expect(projectBreadcrumbs.getByRole("button", { name: "Projects" })).toBeVisible();
    await projectBreadcrumbs.getByRole("button", { name: "Projects" }).click();
    await expect(explorerSurface.getByTestId("projects-dashboard")).toBeVisible();

    await page.getByTestId(`sidebar-repo-${normalizedRepoTestId(selectedIssue.fullName)}`).click({ position: { x: 8, y: 8 } });
    await page.getByTestId(`sidebar-subfolder-${normalizedRepoTestId(selectedIssue.fullName)}-issues`).click();
    await page.getByTestId(`sidebar-issue-${normalizedRepoTestId(selectedIssue.fullName)}-${selectedIssue.number}`).click();
    const issueBreadcrumbs = page.getByTestId("workspace-breadcrumbs");
    await expect(issueBreadcrumbs.getByRole("button", { name: "Repositories" })).toBeVisible();
    await expect(issueBreadcrumbs.getByRole("button", { name: selectedIssue.fullName })).toBeVisible();
    await issueBreadcrumbs.getByRole("button", { name: selectedIssue.fullName }).click();
    await expect(explorerSurface.getByText("Last updated:")).toBeVisible();
  } finally {
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});

test("sidebar context menus own tree actions and topic deletion", async ({ page, request }) => {
  const reposResponse = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const projectName = `e2e-sidebar-menu-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);
  const projectRepo = reposResponse.repos[0]?.full_name;
  if (!projectRepo) {
    throw new Error("At least one live repository is required to prove sidebar context menus.");
  }
  let projectCreated = false;

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();

    await expect(page.getByTestId("sidebar-all-repos-header")).toBeVisible();
    await page.getByTestId("sidebar-all-repos-header").click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Open Repositories Dashboard" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Expand all repos" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Collapse all repos" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Open Repositories Dashboard" })).toHaveCount(0);

    await createProjectFromAssignmentDialog(page, projectRepo, projectName);
    await expect.poll(async () => {
      const tags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
      return tags.some((tag) => tag.id === projectTopic);
    }, { timeout: 30_000 }).toBe(true);
    projectCreated = true;

    await expect(page.getByTestId("sidebar-projects-header")).toBeVisible();
    await page.getByTestId("sidebar-projects-header").click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Open Projects Dashboard" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Expand all projects" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Collapse all projects" })).toBeVisible();
    await page.keyboard.press("Escape");

    const projectRow = page.getByTestId(`sidebar-project-${projectTopic}`);
    await expect(projectRow).toBeVisible({ timeout: 30_000 });
    await projectRow.scrollIntoViewIfNeeded();
    await projectRow.click({ button: "right" });
    const manageProject = page.getByRole("menuitem", { name: "Manage Project" });
    await expect(manageProject).toBeVisible({ timeout: 5_000 });
    await manageProject.click();
    const projectDialog = page.getByTestId("project-assignment-dialog");
    await expect(projectDialog.getByRole("button", { name: "Remove topic from all repos" })).toBeVisible();
    await expect(page.locator("text=Create topics from a repository menu")).toHaveCount(0);
    await projectDialog.getByRole("button", { name: "Remove topic from all repos" }).click();
    await expect.poll(async () => {
      const tags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
      return tags.some((tag) => tag.id === projectTopic);
    }, { timeout: 30_000 }).toBe(false);
    projectCreated = false;
  } finally {
    if (projectCreated) {
      await request.delete(`/api/github/projects/${projectTopic}`);
    }
  }
});

test("inbox exposes label filtering without redundant open-state or avatar chrome", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("github-user-avatar")).toHaveCount(0);
  await expect(page.getByText("Open Issues")).toHaveCount(0);
  await expect(page.getByText("Open PRs")).toHaveCount(0);

  const labelFilter = page.getByTestId("inbox-label-filter");
  await expect(labelFilter).toBeVisible();
  const renderedLabel = page.getByTestId("inbox-item-label").first();
  await expect(renderedLabel).toBeVisible({ timeout: 60_000 });
  const labelText = (await renderedLabel.textContent())?.trim();
  assert(typeof labelText === "string" && labelText.length > 0, "Rendered inbox label text is required to prove label filtering.");

  await labelFilter.selectOption(labelText);
  const filteredItem = page.locator("[data-testid^='inbox-item-']").first();
  await expect(filteredItem).toBeVisible();
  await expect(filteredItem.getByTestId("inbox-item-label").filter({ hasText: labelText }).first()).toBeVisible();
  await expect(page.getByText(/^Showing \d+ items$/)).toBeVisible();
});

test("shared label filters constrain inbox repo and project issue and PR lists", async ({ page, request }) => {
  const labeledIssue = await discoverLabeledIssue(request);
  const labeledPR = await discoverLabeledPullRequest(request);
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  const projectName = `e2e-label-filter-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);
  const projectRepoNames = [...new Set([labeledIssue.fullName, labeledPR.fullName])];

  try {
    for (const repoFullName of projectRepoNames) {
      const repo = reposPayload.repos.find((item) => item.full_name === repoFullName);
      assert(repo, `Repository ${repoFullName} must exist in indexed repos for label filter setup.`);
      await addTopicToRepo(request, repo, projectTopic);
    }

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const inboxLabelFilter = page.getByTestId("inbox-label-filter");
    await inboxLabelFilter.selectOption(labeledIssue.label);
    await assertVisibleRowsCarryLabel(
      page.locator("[data-testid^='inbox-item-issue-'], [data-testid^='inbox-item-pr-']"),
      "inbox-item-label",
      labeledIssue.label
    );

    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    const explorerSurface = page.locator(".dockview-theme-abyss");

    await page.getByTestId(`sidebar-repo-${normalizedRepoTestId(labeledIssue.fullName)}`).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open Repo Dashboard" }).click();
    const repoIssuesLabelFilter = explorerSurface.getByTestId("repo-issues-label-filter");
    await expect(repoIssuesLabelFilter).toBeVisible({ timeout: 5_000 });
    await repoIssuesLabelFilter.selectOption(labeledIssue.label);
    await assertVisibleRowsCarryLabel(explorerSurface.getByTestId("repo-issue-row"), "issue-row-label", labeledIssue.label);

    await page.getByTestId(`sidebar-repo-${normalizedRepoTestId(labeledPR.fullName)}`).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open Repo Dashboard" }).click();
    const repoPrsLabelFilter = explorerSurface.getByTestId("repo-prs-label-filter");
    await expect(repoPrsLabelFilter).toBeVisible({ timeout: 5_000 });
    await repoPrsLabelFilter.selectOption(labeledPR.label);
    await assertVisibleRowsCarryLabel(explorerSurface.getByTestId("repo-pr-row"), "pr-row-label", labeledPR.label);

    await expect(page.getByRole("button", { name: projectTopic }).first()).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: projectTopic }).first().click();

    const projectIssuesLabelFilter = explorerSurface.getByTestId("project-issues-label-filter");
    await expect(projectIssuesLabelFilter).toBeVisible({ timeout: 5_000 });
    await projectIssuesLabelFilter.selectOption(labeledIssue.label);
    await assertVisibleRowsCarryLabel(explorerSurface.getByTestId("project-issue-row"), "issue-row-label", labeledIssue.label);

    const projectPrsLabelFilter = explorerSurface.getByTestId("project-prs-label-filter");
    await expect(projectPrsLabelFilter).toBeVisible({ timeout: 5_000 });
    await projectPrsLabelFilter.selectOption(labeledPR.label);
    await assertVisibleRowsCarryLabel(explorerSurface.getByTestId("project-pr-row"), "pr-row-label", labeledPR.label);
  } finally {
    await request.delete(`/api/github/projects/${projectTopic}`);
    await removeTemporaryLabel(request, labeledIssue);
    await removeTemporaryLabel(request, labeledPR);
  }
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
    const dialog = await openSidebarAssignmentDialog(page, projectRepo);
    await dialog.getByTestId("project-assignment-create-input").fill(projectName);
    await dialog.getByTestId("project-assignment-create-button").click();

    const savingToast = page.getByText("Saving").locator("xpath=ancestor::div[contains(@class, 'border')][1]");
    await expect(savingToast).toBeVisible();
    await expect(savingToast.locator(".animate-spin")).toHaveCount(1);
  } finally {
    releaseTopicWrite();
    await expect.poll(async () => {
      const tags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
      return tags.some((tag) => tag.id === projectTopic);
    }, { timeout: 45_000 }).toBe(true);
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});

test("initial repo load shows a spinner toast until the repository index arrives", async ({ page }) => {
  let releaseRepos: () => void = () => {};
  let repoIndexRequests = 0;
  const repoIndexGate = new Promise<void>((resolve) => {
    releaseRepos = resolve;
  });

  await page.route("**/api/github/repos", async (route) => {
    repoIndexRequests += 1;
    await repoIndexGate;
    await route.continue();
  });

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(() => repoIndexRequests).toBeGreaterThan(0);

    const loadingToast = page.getByTestId("initial-repo-loading-toast");
    await expect(loadingToast).toBeVisible();
    await expect(loadingToast.locator(".animate-spin")).toHaveCount(1);

    releaseRepos();
    await expect(loadingToast).toHaveCount(0);
  } finally {
    releaseRepos();
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

function normalizedRepoTestId(fullName: string): string {
  return fullName.replace(/\//g, "-");
}

async function discoverLabeledIssue(request: APIRequestContext): Promise<LabeledItemSelection> {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  let unlabeledIssue: OpenItemSelection | null = null;
  for (const repo of reposPayload.repos) {
    const [owner, name] = repo.full_name.split("/");
    const issuesPayload = await (await request.get(`/api/github/repos/${owner}/${name}/issues`)).json() as
      ApiIssueLike[] | { error: string };
    if (Array.isArray(issuesPayload)) {
      const issue = issuesPayload.find((candidate) => candidate.labels.length > 0 && isApiIssueLike(candidate));
      if (issue) {
        return {
          owner,
          name,
          fullName: repo.full_name,
          number: issue.number,
          title: issue.title,
          body: issue.body || "",
          label: issue.labels[0].name,
          cleanup: { kind: "none" }
        };
      }
      const unlabeled = issuesPayload.find((candidate) => candidate.labels.length === 0 && isApiIssueLike(candidate));
      if (!unlabeledIssue && unlabeled) {
        unlabeledIssue = {
          owner,
          name,
          fullName: repo.full_name,
          number: unlabeled.number,
          title: unlabeled.title,
          body: unlabeled.body || ""
        };
      }
    }
  }
  if (unlabeledIssue) {
    const label = await createAndApplyTemporaryLabel(request, unlabeledIssue);
    return { ...unlabeledIssue, label, cleanup: { kind: "temporary-label" } };
  }
  throw new Error("No live issue fixture was available for label-filter proof.");
}

async function discoverLabeledPullRequest(request: APIRequestContext): Promise<LabeledItemSelection> {
  const reposPayload = await (await request.get("/api/github/repos")).json() as ReposResponse;
  let unlabeledPullRequest: OpenItemSelection | null = null;
  for (const repo of reposPayload.repos) {
    const [owner, name] = repo.full_name.split("/");
    const prsPayload = await (await request.get(`/api/github/repos/${owner}/${name}/prs`)).json() as
      ApiPullRequest[] | { error: string };
    if (Array.isArray(prsPayload)) {
      const pr = prsPayload.find((candidate) => candidate.labels.length > 0 && isApiIssueLike(candidate));
      if (pr) {
        return {
          owner,
          name,
          fullName: repo.full_name,
          number: pr.number,
          title: pr.title,
          body: pr.body || "",
          label: pr.labels[0].name,
          cleanup: { kind: "none" }
        };
      }
      const unlabeled = prsPayload.find((candidate) => candidate.labels.length === 0 && isApiIssueLike(candidate));
      if (!unlabeledPullRequest && unlabeled) {
        unlabeledPullRequest = {
          owner,
          name,
          fullName: repo.full_name,
          number: unlabeled.number,
          title: unlabeled.title,
          body: unlabeled.body || ""
        };
      }
    }
  }
  if (unlabeledPullRequest) {
    const label = await createAndApplyTemporaryLabel(request, unlabeledPullRequest);
    return { ...unlabeledPullRequest, label, cleanup: { kind: "temporary-label" } };
  }

  const repoForTemporaryPullRequest = reposPayload.repos[0];
  if (!repoForTemporaryPullRequest) {
    throw new Error("At least one live repository is required to create a temporary PR label-filter fixture.");
  }
  const temporaryPullRequest = await createTemporaryPullRequest(request, repoForTemporaryPullRequest);
  const label = await createAndApplyTemporaryLabel(request, temporaryPullRequest);
  return {
    ...temporaryPullRequest,
    label,
    cleanup: { kind: "temporary-pr-and-label", branchName: temporaryPullRequest.branchName }
  };
}

async function createAndApplyTemporaryLabel(request: APIRequestContext, item: OpenItemSelection): Promise<string> {
  const label = normalizeProjectTopicName(`e2e-label-${Date.now()}`);
  const labelResponse = await request.post(`https://api.github.com/repos/${item.owner}/${item.name}/labels`, {
    headers: githubApiHeaders(),
    data: {
      name: label,
      color: "ededed",
      description: "Temporary e2e label-filter proof"
    }
  });
  if (!labelResponse.ok()) {
    throw new Error(`Unable to create temporary label ${label} on ${item.fullName}: HTTP ${labelResponse.status()}`);
  }

  const issueLabelResponse = await request.post(
    `https://api.github.com/repos/${item.owner}/${item.name}/issues/${item.number}/labels`,
    {
      headers: githubApiHeaders(),
      data: { labels: [label] }
    }
  );
  if (!issueLabelResponse.ok()) {
    throw new Error(`Unable to apply temporary label ${label} to ${item.fullName}#${item.number}: HTTP ${issueLabelResponse.status()}`);
  }

  return label;
}

async function createTemporaryPullRequest(request: APIRequestContext, repo: Repo): Promise<TemporaryPullRequestSelection> {
  const [owner, name] = repo.full_name.split("/");
  const headers = githubApiHeaders();
  const repoResponse = await request.get(`https://api.github.com/repos/${owner}/${name}`, { headers });
  if (!repoResponse.ok()) {
    throw new Error(`Unable to read repository ${repo.full_name} for temporary PR setup: HTTP ${repoResponse.status()}`);
  }
  const repoDetails = await repoResponse.json() as GitHubRepoDetails;
  assert(typeof repoDetails.default_branch === "string" && repoDetails.default_branch.length > 0, `${repo.full_name} must expose a default branch.`);

  const branchName = normalizeProjectTopicName(`e2e-label-pr-${Date.now()}`);
  const encodedBaseBranch = repoDetails.default_branch.split("/").map(encodeURIComponent).join("/");
  const baseRefResponse = await request.get(`https://api.github.com/repos/${owner}/${name}/git/ref/heads/${encodedBaseBranch}`, { headers });
  if (!baseRefResponse.ok()) {
    throw new Error(`Unable to read base branch ${repoDetails.default_branch} for ${repo.full_name}: HTTP ${baseRefResponse.status()}`);
  }
  const baseRef = await baseRefResponse.json() as GitHubRefResponse;
  assert(typeof baseRef.object?.sha === "string" && baseRef.object.sha.length > 0, `${repo.full_name} base ref must expose an object SHA.`);

  const createRefResponse = await request.post(`https://api.github.com/repos/${owner}/${name}/git/refs`, {
    headers,
    data: {
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha
    }
  });
  if (!createRefResponse.ok()) {
    throw new Error(`Unable to create temporary branch ${branchName} on ${repo.full_name}: HTTP ${createRefResponse.status()}`);
  }

  const filePath = `.github-dashboard-e2e-${branchName}.md`;
  const contentResponse = await request.put(`https://api.github.com/repos/${owner}/${name}/contents/${filePath}`, {
    headers,
    data: {
      message: `Create ${branchName}`,
      content: Buffer.from(`Temporary PR fixture for dashboard label filtering: ${branchName}\n`).toString("base64"),
      branch: branchName
    }
  });
  if (!contentResponse.ok()) {
    throw new Error(`Unable to create temporary PR file on ${branchName} in ${repo.full_name}: HTTP ${contentResponse.status()}`);
  }

  const title = `Dashboard label filter fixture ${branchName}`;
  const pullResponse = await request.post(`https://api.github.com/repos/${owner}/${name}/pulls`, {
    headers,
    data: {
      title,
      head: branchName,
      base: repoDetails.default_branch,
      body: "Temporary PR fixture for dashboard label filtering."
    }
  });
  if (!pullResponse.ok()) {
    throw new Error(`Unable to create temporary PR from ${branchName} in ${repo.full_name}: HTTP ${pullResponse.status()}`);
  }
  const pullRequest = await pullResponse.json() as GitHubPullRequestResponse;
  assert(Number.isInteger(pullRequest.number), `${repo.full_name} temporary PR response must expose a number.`);

  return {
    owner,
    name,
    fullName: repo.full_name,
    number: pullRequest.number,
    title: pullRequest.title,
    body: pullRequest.body || "",
    branchName
  };
}

async function removeTemporaryLabel(request: APIRequestContext, item: LabeledItemSelection): Promise<void> {
  if (item.cleanup.kind === "none") {
    return;
  }

  const headers = githubApiHeaders();
  const encodedLabel = encodeURIComponent(item.label);
  const issueLabelResponse = await request.delete(
    `https://api.github.com/repos/${item.owner}/${item.name}/issues/${item.number}/labels/${encodedLabel}`,
    { headers }
  );
  if (!issueLabelResponse.ok()) {
    throw new Error(`Unable to remove temporary label ${item.label} from ${item.fullName}#${item.number}: HTTP ${issueLabelResponse.status()}`);
  }

  const repoLabelResponse = await request.delete(
    `https://api.github.com/repos/${item.owner}/${item.name}/labels/${encodedLabel}`,
    { headers }
  );
  if (!repoLabelResponse.ok()) {
    throw new Error(`Unable to delete temporary label ${item.label} from ${item.fullName}: HTTP ${repoLabelResponse.status()}`);
  }

  if (item.cleanup.kind === "temporary-pr-and-label") {
    const closePrResponse = await request.patch(`https://api.github.com/repos/${item.owner}/${item.name}/pulls/${item.number}`, {
      headers,
      data: { state: "closed" }
    });
    if (!closePrResponse.ok()) {
      throw new Error(`Unable to close temporary PR ${item.fullName}#${item.number}: HTTP ${closePrResponse.status()}`);
    }

    const encodedBranchName = item.cleanup.branchName.split("/").map(encodeURIComponent).join("/");
    const deleteBranchResponse = await request.delete(`https://api.github.com/repos/${item.owner}/${item.name}/git/refs/heads/${encodedBranchName}`, {
      headers
    });
    if (!deleteBranchResponse.ok()) {
      throw new Error(`Unable to delete temporary branch ${item.cleanup.branchName} from ${item.fullName}: HTTP ${deleteBranchResponse.status()}`);
    }
  }
}

async function addTopicToRepo(request: APIRequestContext, repo: Repo, topic: string): Promise<void> {
  const [owner, name] = repo.full_name.split("/");
  const topics = [...new Set([...repo.topics, topic])].sort((left, right) => left.localeCompare(right));
  const response = await request.put(`/api/github/repos/${owner}/${name}/topics`, {
    data: { topics }
  });
  if (!response.ok()) {
    throw new Error(`Unable to add topic ${topic} to ${repo.full_name}: HTTP ${response.status()}`);
  }
}

async function openSidebarAssignmentDialog(page: Page, repoFullName: string): Promise<Locator> {
  await page.getByTestId(`sidebar-repo-${normalizedRepoTestId(repoFullName)}`).click({ button: "right" });
  const manageProjects = page.getByRole("menuitem", { name: "Manage Projects" });
  await expect(manageProjects).toBeVisible({ timeout: 5_000 });
  await manageProjects.click();
  const dialog = page.getByTestId("project-assignment-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createProjectFromAssignmentDialog(page: Page, repoFullName: string, projectName: string): Promise<void> {
  const dialog = await openSidebarAssignmentDialog(page, repoFullName);
  await dialog.getByTestId("project-assignment-create-input").fill(projectName);
  await dialog.getByTestId("project-assignment-create-button").click();
}

async function assertVisibleRowsCarryLabel(
  rows: Locator,
  labelTestId: string,
  labelName: string
): Promise<void> {
  await expect(rows.first()).toBeVisible();
  const rowCount = await rows.count();
  let visibleRows = 0;
  for (let index = 0; index < rowCount; index++) {
    const row = rows.nth(index);
    if (await row.isVisible()) {
      visibleRows += 1;
      await expect(row.getByTestId(labelTestId).filter({ hasText: labelName }).first()).toBeVisible();
    }
  }
  assert(visibleRows > 0, `At least one visible row is required for label ${labelName}.`);
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
  await repoRow.click({ position: { x: 8, y: 8 } });

  const prSubfolderRow = page.getByTestId(`sidebar-subfolder-${normalizedRepo}-prs`);
  await prSubfolderRow.scrollIntoViewIfNeeded();
  await expect(prSubfolderRow).toBeVisible();
  await prSubfolderRow.click();

  const prRow = page.getByTestId(`sidebar-pr-${normalizedRepo}-${selectedPR.number}`);
  await expect(prRow).toBeVisible({ timeout: 45_000 });
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
  await issueRepoRow.click({ position: { x: 8, y: 8 } });

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
  await prRepoRow.click({ position: { x: 8, y: 8 } });
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
      await createProjectFromAssignmentDialog(page, repoFullName, projectName);
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
    await createProjectFromAssignmentDialog(page, projectRepo, projectName);
    await page.getByRole("button", { name: projectTopic }).first().click();

    await expect(page.getByRole("heading", { name: projectTopic })).toBeVisible();
    await expect(page.getByTestId("repo-card").filter({ hasText: projectRepo })).toBeVisible();
    await expect(page.getByText("Explorer filter:")).toBeVisible();
    await expect(page.getByText("Unchanged")).toBeVisible();
    await expect(page.getByText("Project:")).toHaveCount(0);
  } finally {
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});

test("repo right-click menu can create a project containing that repo", async ({ page, request }) => {
  const projectName = `e2e-context-${Date.now()}`;
  const projectTopic = normalizeProjectTopicName(projectName);

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Repos \d+/ }).click();
    const firstRepoRow = page.locator("[data-testid^='sidebar-repo-']").first();
    await expect(firstRepoRow).toBeVisible();
    const projectRepo = await firstRepoRow.locator("[title^='dzackgarza/']").first().getAttribute("title");
    if (!projectRepo) {
      throw new Error("Visible sidebar repository row did not expose a full repository name.");
    }
    const projectRepoUrl = `https://github.com/${projectRepo}`;
    await page.getByTestId(`sidebar-repo-${normalizedRepoTestId(projectRepo)}`).click({ button: "right" });
    await expect(page.getByTestId("context-open-github")).toHaveAttribute("href", projectRepoUrl);
    const manageProjects = page.getByRole("menuitem", { name: "Manage Projects" });
    await expect(manageProjects).toBeVisible({ timeout: 5_000 });
    await manageProjects.click();
    const dialog = page.getByTestId("project-assignment-dialog");
    await dialog.getByTestId("project-assignment-create-input").fill(projectName);
    await dialog.getByTestId("project-assignment-create-button").click();

    await expect.poll(async () => {
      const tags = await (await request.get("/api/github/projects")).json() as ProjectTag[];
      return tags.find((tag) => tag.name === projectTopic)?.repos;
    }).toEqual([projectRepo]);
  } finally {
    await request.delete(`/api/github/projects/${projectTopic}`);
  }
});
