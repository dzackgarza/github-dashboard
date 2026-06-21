import assert from "node:assert/strict";
import express from "express";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { assertValidProjectTopicName, deriveProjectTagsFromRepos } from "./src/utils/projectTopics";

dotenv.config();

function requireEnvVar(name: string): string {
  const value = process.env[name];
  assert(typeof value === "string" && value.trim().length > 0, `${name} is required in the process environment.`);
  return value;
}

function requirePort(name: string): number {
  const raw = requireEnvVar(name);
  const parsed = Number(raw);
  assert(Number.isInteger(parsed) && parsed > 0 && parsed < 65536, `${name} must be an integer between 1 and 65535.`);
  return parsed;
}

const PORT = requirePort("PORT");
const GITHUB_TOKEN = requireEnvVar("GITHUB_TOKEN");

const app = express();
app.use(express.json());

interface GithubUser {
  login: string;
  avatar_url: string;
  html_url?: string;
  name?: string;
}

interface RepoOwner {
  login: string;
}

interface RepositoryFromApi {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  private: boolean;
  archived: boolean;
  stargazers_count: number;
  language: string;
  owner: RepoOwner;
  updated_at: string;
  topics: string[];
  open_issues_count?: number;
}

interface RepositoryForWorkspace extends RepositoryFromApi {
  latest_commit_at: string | null;
}

interface LabelFromApi {
  name: string;
  color: string;
}

interface UserFromApi {
  login: string;
  avatar_url: string;
}

interface IssueFromApi {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  user: UserFromApi;
  created_at: string;
  updated_at: string;
  comments: number;
  pull_request?: unknown;
  labels: LabelFromApi[];
}

interface PRFromApi {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  user: UserFromApi;
  created_at: string;
  updated_at: string;
  comments: number;
  labels: LabelFromApi[];
  review_comments: number;
  base: { ref: string };
  head: { sha: string; ref: string };
}

interface BranchHeadCommit {
  name: string;
  commit: {
    sha: string;
    date: string;
  };
}

interface GraphqlErrorFromApi {
  message: string;
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: GraphqlErrorFromApi[];
}

interface BranchRefsGraphqlData {
  repository: {
    refs: {
      pageInfo: {
        endCursor: string | null;
        hasNextPage: boolean;
      };
      nodes: BranchRefFromGraphql[];
    };
  } | null;
}

interface BranchRefFromGraphql {
  name: string;
  target: {
    __typename: string;
    oid?: string;
    committedDate?: string;
  } | null;
}

interface CommentFromApi {
  id: string | number;
  user: UserFromApi;
  body: string;
  created_at: string;
}

interface CheckSuiteApp {
  name?: string;
}

interface CheckSuite {
  app?: CheckSuiteApp | null;
  status: string;
  conclusion?: string | null;
}

interface CheckSuitesResponse {
  check_suites: CheckSuite[];
}

interface DiffFileFromApi {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

interface GitFile {
  file: string;
  status: string;
  additions: number;
  deletions: number;
  code: string;
}

interface SyncLog {
  id: string;
  timestamp: string;
  repo: string;
  type: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "304_HIT";
  message: string;
  rateLimitRemaining: number;
}

interface GithubCacheEntry {
  etag: string;
  data: unknown;
  lastSynced: string;
}

function assertArray<T>(value: unknown, message: string): asserts value is T[] {
  assert(Array.isArray(value), message);
}

const syncLogs: SyncLog[] = [
  {
    id: "init",
    timestamp: new Date().toISOString(),
    repo: "System",
    type: "INFO",
    message: "GitHub PR & Issue Manager application initialized.",
    rateLimitRemaining: 5000
  }
];

let globalRateLimit = {
  limit: 5000,
  remaining: 5000,
  reset: Math.floor(Date.now() / 1000) + 3600
};

const serverRepoCache: Record<string, GithubCacheEntry> = {};
const USER_REPOS_CACHE_KEY = "user-repos";
const WORKSPACE_REPOS_CACHE_KEY = "workspace-repos";
const syncTimestamps: Record<string, string> = {};

function addLog(repo: string, type: SyncLog["type"], message: string) {
  const currentRateRemaining = globalRateLimit.remaining;
  syncLogs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    repo,
    type,
    message,
    rateLimitRemaining: currentRateRemaining
  });

  if (syncLogs.length > 200) {
    syncLogs.pop();
  }
}

async function githubFetch<T>(urlPath: string, etagKey?: string): Promise<{ data: T | null; status: number; headers: Headers }> {
  const url = `https://api.github.com${urlPath}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    "User-Agent": "GitHub-PR-Issue-Manager-Dashboard"
  };

  if (etagKey && serverRepoCache[etagKey]) {
    headers["If-None-Match"] = serverRepoCache[etagKey].etag;
  }

  const response = await fetch(url, { headers });

  const limit = response.headers.get("x-ratelimit-limit");
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (limit) globalRateLimit.limit = Number(limit);
  if (remaining) globalRateLimit.remaining = Number(remaining);
  if (reset) globalRateLimit.reset = Number(reset);

  const payload = response.status === 304 ? null : await response.json() as T;
  return {
    data: payload,
    status: response.status,
    headers: response.headers
  };
}

async function githubWrite<T>(method: "PUT" | "DELETE", urlPath: string, body: unknown): Promise<{ data: T | null; status: number; headers: Headers }> {
  const url = `https://api.github.com${urlPath}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "GitHub-PR-Issue-Manager-Dashboard",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const limit = response.headers.get("x-ratelimit-limit");
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (limit) globalRateLimit.limit = Number(limit);
  if (remaining) globalRateLimit.remaining = Number(remaining);
  if (reset) globalRateLimit.reset = Number(reset);

  return {
    data: response.status === 204 ? null : await response.json() as T,
    status: response.status,
    headers: response.headers
  };
}

async function githubGraphql<T>(query: string, variables: Record<string, string | null>): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "GitHub-PR-Issue-Manager-Dashboard",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });

  const limit = response.headers.get("x-ratelimit-limit");
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (limit) globalRateLimit.limit = Number(limit);
  if (remaining) globalRateLimit.remaining = Number(remaining);
  if (reset) globalRateLimit.reset = Number(reset);

  const payload = await response.json() as GraphqlEnvelope<T>;
  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed with status ${response.status}.`);
  }
  if (payload.errors && payload.errors.length > 0) {
    throw new Error(`GitHub GraphQL request failed: ${payload.errors.map((error) => error.message).join("; ")}`);
  }
  assert(payload.data, "GitHub GraphQL response data is missing.");
  return payload.data;
}

const BRANCH_HEADS_QUERY = `
  query BranchHeads($owner: String!, $name: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      refs(refPrefix: "refs/heads/", first: 100, after: $after) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          name
          target {
            __typename
            ... on Commit {
              oid
              committedDate
            }
          }
        }
      }
    }
  }
`;

async function fetchBranchHeadCommits(fullName: string): Promise<BranchHeadCommit[]> {
  assertRepoFullName(fullName);
  const [owner, name] = fullName.split("/");
  let after: string | null = null;
  const branches: BranchHeadCommit[] = [];

  do {
    const graphqlData: BranchRefsGraphqlData = await githubGraphql<BranchRefsGraphqlData>(BRANCH_HEADS_QUERY, { owner, name, after });
    assert(graphqlData.repository, `GitHub repository ${fullName} was not found while reading branch heads.`);

    for (const branch of graphqlData.repository.refs.nodes) {
      assert(branch.target, `Branch ${branch.name} in ${fullName} has no target commit.`);
      assert(branch.target.__typename === "Commit", `Branch ${branch.name} in ${fullName} does not point at a commit.`);
      assert(typeof branch.target.oid === "string" && branch.target.oid.length > 0, `Branch ${branch.name} in ${fullName} is missing a commit oid.`);
      assert(typeof branch.target.committedDate === "string" && branch.target.committedDate.length > 0, `Branch ${branch.name} in ${fullName} is missing a commit date.`);
      branches.push({
        name: branch.name,
        commit: {
          sha: branch.target.oid.slice(0, 8),
          date: branch.target.committedDate
        }
      });
    }

    after = graphqlData.repository.refs.pageInfo.hasNextPage ? graphqlData.repository.refs.pageInfo.endCursor : null;
  } while (after);

  return branches;
}

function latestCommitTimestamp(branches: BranchHeadCommit[], fullName: string): string | null {
  if (branches.length === 0) {
    return null;
  }

  const timestamps = branches.map((branch) => {
    const parsed = Date.parse(branch.commit.date);
    assert(!Number.isNaN(parsed), `Branch ${branch.name} in ${fullName} has an invalid commit date.`);
    return parsed;
  });
  return new Date(Math.max(...timestamps)).toISOString();
}

function activeRepositoriesFromApi(repos: RepositoryFromApi[]): RepositoryFromApi[] {
  return repos.filter((repo) => !repo.archived);
}

async function mapWithConcurrency<T, U>(items: T[], concurrency: number, transform: (item: T) => Promise<U>): Promise<U[]> {
  assert(Number.isInteger(concurrency) && concurrency > 0, "Concurrency must be a positive integer.");
  const results: Array<U | undefined> = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await transform(items[index]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.map((result, index) => {
    assert(result !== undefined, `Concurrent mapper did not produce result ${index}.`);
    return result;
  });
}

async function normalizeRepositoriesForWorkspace(repos: RepositoryFromApi[]): Promise<RepositoryForWorkspace[]> {
  const enriched = await mapWithConcurrency(activeRepositoriesFromApi(repos), 4, async (repo) => {
    const branchHeads = await fetchBranchHeadCommits(repo.full_name);
    return {
      ...repo,
      latest_commit_at: latestCommitTimestamp(branchHeads, repo.full_name)
    };
  });

  return enriched.sort((left, right) => {
    const rightTime = right.latest_commit_at === null ? Number.NEGATIVE_INFINITY : Date.parse(right.latest_commit_at);
    const leftTime = left.latest_commit_at === null ? Number.NEGATIVE_INFINITY : Date.parse(left.latest_commit_at);
    assert(!Number.isNaN(rightTime), `${right.full_name} latest_commit_at is invalid.`);
    assert(!Number.isNaN(leftTime), `${left.full_name} latest_commit_at is invalid.`);
    return rightTime - leftTime || left.full_name.localeCompare(right.full_name);
  });
}

function assertRepoFullName(value: unknown): asserts value is string {
  assert(typeof value === "string" && value.includes("/"), "Repository full name must be in owner/name form.");
}

function parseRouteNumber(raw: string, label: string): number {
  const parsed = Number(raw);
  assert(Number.isInteger(parsed) && parsed > 0, `${label} must be a positive integer.`);
  return parsed;
}

function cacheCommit<T>(key: string, data: T, headers: Headers): void {
  serverRepoCache[key] = {
    etag: headers.get("etag") || "",
    data,
    lastSynced: new Date().toISOString()
  };
}

function updateCachedRepoTopics(fullName: string, topics: string[]): void {
  [USER_REPOS_CACHE_KEY, WORKSPACE_REPOS_CACHE_KEY].forEach((cacheKey) => {
    const cached = serverRepoCache[cacheKey];
    if (!cached) {
      return;
    }

    assert(Array.isArray(cached.data), "Cached repository data must be an array.");
    const repos = cached.data as RepositoryFromApi[];
    const index = repos.findIndex((repo) => repo.full_name === fullName);
    if (index === -1) {
      return;
    }

    repos[index] = { ...repos[index], topics };
    cached.data = repos;
    cached.lastSynced = new Date().toISOString();
  });
}

// Check GITHUB_TOKEN configuration
app.get("/api/github/config", async (_req, res) => {
  try {
    const { data, status } = await githubFetch<GithubUser>("/user");

    if (status === 200 && data) {
      addLog("System", "SUCCESS", `Token validated successfully. Connected as @${data.login}.`);
      return res.json({
        configured: true,
        user: {
          login: data.login,
          avatar_url: data.avatar_url,
          html_url: data.html_url,
          name: data.name
        },
        message: "Successfully synchronized with GitHub."
      });
    }

    addLog("System", "ERROR", `GitHub token validation failed with status ${status}.`);
    return res.status(status).json({ error: `GitHub token validation failed with status ${status}.` });
  } catch (err) {
    addLog("System", "ERROR", `Error verifying GitHub token: ${String(err)}.`);
    return res.status(500).json({ error: "GitHub token verification failed." });
  }
});

app.get("/api/github/repos", async (_req, res) => {
  const rawRepoCache = serverRepoCache[USER_REPOS_CACHE_KEY];
  const workspaceRepoCache = serverRepoCache[WORKSPACE_REPOS_CACHE_KEY];

  try {
    const { data, status, headers } = await githubFetch<RepositoryFromApi[]>("/user/repos?per_page=100&sort=updated", USER_REPOS_CACHE_KEY);

    if (status === 304) {
      if (workspaceRepoCache) {
        assert(Array.isArray(workspaceRepoCache.data), "Cached workspace repository data must be an array.");
        const cachedRepos = workspaceRepoCache.data as RepositoryForWorkspace[];
        return res.json({
          repos: cachedRepos,
          projectTags: deriveProjectTagsFromRepos(cachedRepos),
          syncTimestamps,
          rateLimit: globalRateLimit
        });
      }

      assert(rawRepoCache && Array.isArray(rawRepoCache.data), "Cached GitHub repository data must be available after a 304 response.");
      const workspaceRepos = await normalizeRepositoriesForWorkspace(rawRepoCache.data as RepositoryFromApi[]);
      serverRepoCache[WORKSPACE_REPOS_CACHE_KEY] = {
        etag: rawRepoCache.etag,
        data: workspaceRepos,
        lastSynced: new Date().toISOString()
      };
      return res.json({
        repos: workspaceRepos,
        projectTags: deriveProjectTagsFromRepos(workspaceRepos),
        syncTimestamps,
        rateLimit: globalRateLimit
      });
    }

    if (status === 200 && data) {
      assertArray<RepositoryFromApi>(data, "GitHub repository list must be an array.");
      const activeRepos = activeRepositoriesFromApi(data);
      cacheCommit(USER_REPOS_CACHE_KEY, activeRepos, headers);
      const workspaceRepos = await normalizeRepositoriesForWorkspace(activeRepos);
      cacheCommit(WORKSPACE_REPOS_CACHE_KEY, workspaceRepos, headers);

      workspaceRepos.forEach((repo) => {
        syncTimestamps[repo.full_name] = new Date().toISOString();
      });

      addLog("All Repos list", "SUCCESS", `Fetched ${workspaceRepos.length} repositories from live GitHub API with branch-head commit activity.`);
      return res.json({
        repos: workspaceRepos,
        projectTags: deriveProjectTagsFromRepos(workspaceRepos),
        syncTimestamps,
        rateLimit: globalRateLimit
      });
    }

    addLog("All Repos list", "ERROR", `GitHub repositories request failed with status ${status}.`);
    return res.status(status).json({ error: `GitHub repositories request failed with status ${status}.` });
  } catch (err) {
    addLog("All Repos fetch", "ERROR", `Crashed while fetching repos list: ${String(err)}.`);
    return res.status(500).json({ error: "GitHub repositories request failed." });
  }
});

app.post("/api/github/repos/:owner/:repo/sync", async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);

  const cacheKeyIssues = `issues-${fullName}`;
  const cacheKeyPrs = `prs-${fullName}`;

  syncTimestamps[fullName] = new Date().toISOString();

  try {
    const issueRes = await githubFetch<IssueFromApi[]>(`/repos/${fullName}/issues?state=open&per_page=30`, cacheKeyIssues);

    if (issueRes.status === 200 && issueRes.data) {
      assertArray<IssueFromApi>(issueRes.data, "GitHub issue list must be an array.");
      cacheCommit(cacheKeyIssues, issueRes.data, issueRes.headers);
      addLog(fullName, "SUCCESS", `Sync detected updates on issues repository tree. Saved and cached.`);
    } else if (issueRes.status === 304) {
      addLog(fullName, "304_HIT", "Issues delta check: returned 304 Not Modified. Rate cost saved.");
    }

    const prsRes = await githubFetch<PRFromApi[]>(`/repos/${fullName}/pulls?state=open&per_page=30`, cacheKeyPrs);

    if (prsRes.status === 200 && prsRes.data) {
      assertArray<PRFromApi>(prsRes.data, "GitHub PR list must be an array.");
      cacheCommit(cacheKeyPrs, prsRes.data, prsRes.headers);
      addLog(fullName, "SUCCESS", "Sync detected updates on pull requests repository tree. Saved.");
    } else if (prsRes.status === 304) {
      addLog(fullName, "304_HIT", "Pull requests delta check: returned 304 Not Modified. Sync efficiency 100%.");
    }

    return res.json({
      success: true,
      lastSynced: syncTimestamps[fullName],
      message: "Live API synchronization performed cleanly with conditional ETags."
    });
  } catch (err) {
    addLog(fullName, "ERROR", `Sync failed during GitHub network call: ${String(err)}`);
    return res.status(500).json({ error: "GitHub sync failed." });
  }
});

app.get("/api/github/repos/:owner/:repo/issues", async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);

  const cacheKey = `issues-${fullName}`;
  const cached = serverRepoCache[cacheKey];

  try {
    const { data, status, headers } = await githubFetch<IssueFromApi[]>(`/repos/${fullName}/issues?state=open&per_page=50`, cacheKey);
    let finalIssues: IssueFromApi[] = [];

    if (status === 304 && cached) {
      assertArray<IssueFromApi>(cached.data, "Cached issue data must be an array.");
      addLog(fullName, "304_HIT", `Issues list (cached ETag hit). Served ${cached.data.length} issues.`);
      finalIssues = cached.data;
    } else if (status === 200 && data) {
      assertArray<IssueFromApi>(data, "GitHub issue list must be an array.");
      cacheCommit(cacheKey, data, headers);
      addLog(fullName, "INFO", `Served ${data.length} issues from GitHub. Saved to conditional buffer.`);
      finalIssues = data;
    } else {
      addLog(fullName, "ERROR", `GitHub issues request failed with status ${status}.`);
      return res.status(status).json({ error: `GitHub issues request failed with status ${status}.` });
    }

    const issuesOnly = finalIssues.filter((item) => item.pull_request === undefined);
    return res.json(issuesOnly);
  } catch (err) {
    addLog(fullName, "ERROR", `Failed to retrieve issues: ${String(err)}`);
    return res.status(500).json({ error: "GitHub issues request failed." });
  }
});

app.get("/api/github/repos/:owner/:repo/prs", async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);

  const cacheKey = `prs-${fullName}`;
  const cached = serverRepoCache[cacheKey];

  try {
    const { data, status, headers } = await githubFetch<PRFromApi[]>(`/repos/${fullName}/pulls?state=open&per_page=50`, cacheKey);
    let finalPrs: PRFromApi[] = [];

    if (status === 304 && cached) {
      assertArray<PRFromApi>(cached.data, "Cached PR data must be an array.");
      addLog(fullName, "304_HIT", `Pull requests (cached ETag hit). Served ${cached.data.length} items from memory.`);
      finalPrs = cached.data;
    } else if (status === 200 && data) {
      assertArray<PRFromApi>(data, "GitHub PR list must be an array.");
      cacheCommit(cacheKey, data, headers);
      addLog(fullName, "INFO", `Served ${data.length} pull requests from GitHub.`);
      finalPrs = data;
    } else {
      addLog(fullName, "ERROR", `GitHub pull requests request failed with status ${status}.`);
      return res.status(status).json({ error: `GitHub pull requests request failed with status ${status}.` });
    }

    return res.json(finalPrs);
  } catch (err) {
    addLog(fullName, "ERROR", `Failed to retrieve PRs: ${String(err)}`);
    return res.status(500).json({ error: "GitHub pull requests request failed." });
  }
});

app.get("/api/github/repos/:owner/:repo/branches", async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);

  const cacheKey = `branches-${fullName}`;

  try {
    const finalBranches = await fetchBranchHeadCommits(fullName);
    serverRepoCache[cacheKey] = {
      etag: "",
      data: finalBranches,
      lastSynced: new Date().toISOString()
    };
    return res.json(finalBranches);
  } catch (err) {
    addLog(fullName, "ERROR", `Failed to fetch branches: ${String(err)}`);
    return res.status(500).json({ error: "GitHub branches request failed." });
  }
});

app.get("/api/github/repos/:owner/:repo/issues/:number", async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);
  let issueNumber: number;
  try {
    issueNumber = parseRouteNumber(number, "issue number");
  } catch {
    return res.status(400).json({ error: "Issue number must be a positive integer." });
  }

  try {
    const singleIssueRes = await githubFetch<IssueFromApi>(`/repos/${fullName}/issues/${issueNumber}`);
    if (singleIssueRes.status !== 200 || !singleIssueRes.data) {
      return res.status(singleIssueRes.status).json({ error: `GitHub issue request failed with status ${singleIssueRes.status}.` });
    }

    if (singleIssueRes.data.pull_request !== undefined) {
      return res.status(400).json({ error: "Requested resource is a pull request, not an issue." });
    }

    return res.json(singleIssueRes.data);
  } catch (err) {
    addLog(fullName, "ERROR", `Failed to fetch single issue: ${String(err)}`);
    return res.status(500).json({ error: "GitHub issue request failed." });
  }
});

app.get("/api/github/repos/:owner/:repo/prs/:number", async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);
  let prNumber: number;
  try {
    prNumber = parseRouteNumber(number, "PR number");
  } catch {
    return res.status(400).json({ error: "Pull request number must be a positive integer." });
  }

  try {
    const singlePRRes = await githubFetch<PRFromApi>(`/repos/${fullName}/pulls/${prNumber}`);
    if (singlePRRes.status !== 200 || !singlePRRes.data) {
      return res.status(singlePRRes.status).json({ error: `GitHub PR request failed with status ${singlePRRes.status}.` });
    }

    return res.json(singlePRRes.data);
  } catch (err) {
    addLog(fullName, "ERROR", `Failed to fetch single PR: ${String(err)}`);
    return res.status(500).json({ error: "GitHub PR request failed." });
  }
});

app.get("/api/github/repos/:owner/:repo/issues/:number/comments", async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);
  let issueNumber: number;
  try {
    issueNumber = parseRouteNumber(number, "issue number");
  } catch {
    return res.status(400).json({ error: "Issue number must be a positive integer." });
  }

  const cacheKey = `comments-${fullName}-${issueNumber}`;
  const cached = serverRepoCache[cacheKey];

  try {
    const { data, status, headers } = await githubFetch<CommentFromApi[]>(`/repos/${fullName}/issues/${issueNumber}/comments`, cacheKey);
    if (status === 304 && cached) {
      assertArray<CommentFromApi>(cached.data, "Cached comments data must be an array.");
      return res.json(cached.data);
    }

    if (status === 200 && data) {
      assertArray<CommentFromApi>(data, "GitHub comments response must be an array.");
      cacheCommit(cacheKey, data, headers);
      return res.json(data);
    }

    return res.status(status).json({ error: `GitHub comments request failed with status ${status}.` });
  } catch (err) {
    addLog(fullName, "ERROR", `Failed to fetch comments: ${String(err)}`);
    return res.status(500).json({ error: "GitHub comments request failed." });
  }
});

app.post("/api/github/repos/:owner/:repo/issues/:number/comments", async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);
  let issueNumber: number;
  try {
    issueNumber = parseRouteNumber(number, "issue number");
  } catch {
    return res.status(400).json({ error: "Issue number must be a positive integer." });
  }

  const body = req.body?.body;
  if (typeof body !== "string" || body.trim() === "") {
    return res.status(400).json({ error: "Empty comment body prohibited." });
  }

  try {
    const url = `https://api.github.com/repos/${fullName}/issues/${number}/comments`;
      const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "GitHub-PR-Issue-Manager-Dashboard",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ body })
    });

    if (response.status === 201) {
      const data = await response.json() as CommentFromApi;
      addLog(fullName, "SUCCESS", `Comment posted successfully to live GitHub on item #${issueNumber}.`);
      delete serverRepoCache[`comments-${fullName}-${issueNumber}`];
      return res.json(data);
    }

    const errTxt = await response.text();
    addLog(fullName, "ERROR", `Failed to post comment to live GitHub. Status code: ${response.status}.`);
    return res.status(response.status).json({ error: errTxt });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

app.get("/api/github/repos/:owner/:repo/prs/:number/details", async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);
  let prNumber: number;
  try {
    prNumber = parseRouteNumber(number, "PR number");
  } catch {
    return res.status(400).json({ error: "Pull request number must be a positive integer." });
  }

  try {
    const prDetailsRes = await githubFetch<PRFromApi>(`/repos/${fullName}/pulls/${prNumber}`);
    const filesRes = await githubFetch<DiffFileFromApi[]>(`/repos/${fullName}/pulls/${prNumber}/files`);

    if (prDetailsRes.status !== 200 || filesRes.status !== 200 || !prDetailsRes.data || !filesRes.data) {
      addLog(fullName, "ERROR", `GitHub PR detail request failed for #${number}.`);
      return res.status(502).json({ error: "GitHub PR detail request failed." });
    }

    const headSha = prDetailsRes.data.head?.sha;
    assert(typeof headSha === "string" && headSha.length > 0, "GitHub pull request response must include head.sha.");

    const [dependabotRes, codeScanningRes, secretScanningRes, checksRes] = await Promise.all([
      githubFetch<unknown[]>(`/repos/${fullName}/dependabot/alerts?state=open&per_page=100`),
      githubFetch<unknown[]>(`/repos/${fullName}/code-scanning/alerts?state=open&per_page=100`),
      githubFetch<unknown[]>(`/repos/${fullName}/secret-scanning/alerts?state=open&per_page=100`),
      githubFetch<CheckSuitesResponse>(`/repos/${fullName}/commits/${headSha}/check-suites`)
    ]);

    if (
      checksRes.status !== 200 ||
      !checksRes.data ||
      dependabotRes.status !== 200 ||
      !dependabotRes.data ||
      codeScanningRes.status !== 200 ||
      !codeScanningRes.data ||
      secretScanningRes.status !== 200 ||
      !secretScanningRes.data
    ) {
      addLog(fullName, "ERROR", `GitHub security or check suite lookup failed for #${number}.`);
      return res.status(502).json({ error: "GitHub PR detail request failed due to unavailable check or security endpoints." });
    }

    assertArray<unknown>(dependabotRes.data, "Dependabot security alerts response must be an array.");
    assertArray<unknown>(codeScanningRes.data, "Code scanning alerts response must be an array.");
    assertArray<unknown>(secretScanningRes.data, "Secret scanning alerts response must be an array.");
    assertArray<unknown>(filesRes.data, "PR file list must be an array.");

    const runStatusList = checksRes.data.check_suites.map((suite) => ({
      name: suite.app?.name || "Workflow run Check",
      status: suite.status,
      elapsed: "Active sync",
      conclusion: suite.conclusion
    }));

    const conclusion = checksRes.data.check_suites[0]?.conclusion;
    const resolvedState: "success" | "failure" | "pending" =
      conclusion === "success" ? "success" : conclusion === "failure" ? "failure" : "pending";

    const securityAlerts = {
      dependabotOpen: dependabotRes.data.length,
      codeScanningOpen: codeScanningRes.data.length,
      secretScanningOpen: secretScanningRes.data.length,
      totalOpen: dependabotRes.data.length + codeScanningRes.data.length + secretScanningRes.data.length
    };

    const liveFiles = filesRes.data.map((file) => ({
      file: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      code: file.patch
    } as GitFile));

    return res.json({
      number: Number(number),
      title: prDetailsRes.data.title,
      body: prDetailsRes.data.body || "",
      state: prDetailsRes.data.state,
      html_url: prDetailsRes.data.html_url,
      user: prDetailsRes.data.user,
      created_at: prDetailsRes.data.created_at,
      updated_at: prDetailsRes.data.updated_at,
      base_branch: prDetailsRes.data.base.ref,
      head_branch: prDetailsRes.data.head.ref,
      diff: liveFiles,
      ci_status: {
        state: resolvedState,
        runs: runStatusList,
        unresolved_threads_count: prDetailsRes.data.review_comments || 0,
        security_alerts: {
          dependabotOpen: securityAlerts.dependabotOpen,
          codeScanningOpen: securityAlerts.codeScanningOpen,
          secretScanningOpen: securityAlerts.secretScanningOpen,
          totalOpen: securityAlerts.totalOpen
        }
      }
    });
  } catch (err) {
    addLog(fullName, "ERROR", `Failed fetching live PR details for #${number}: ${String(err)}`);
    return res.status(500).json({ error: "GitHub PR detail request failed." });
  }
});

app.get("/api/github/projects", async (_req, res) => {
  const cached = serverRepoCache[USER_REPOS_CACHE_KEY];

  try {
    const { data, status, headers } = await githubFetch<RepositoryFromApi[]>("/user/repos?per_page=100&sort=updated", USER_REPOS_CACHE_KEY);

    if (status === 304 && cached) {
      assert(Array.isArray(cached.data), "Cached repository data must be an array.");
      return res.json(deriveProjectTagsFromRepos(cached.data as RepositoryFromApi[]));
    }

    if (status === 200 && data) {
      assertArray<RepositoryFromApi>(data, "GitHub repository list must be an array.");
      const activeRepos = activeRepositoriesFromApi(data);
      cacheCommit(USER_REPOS_CACHE_KEY, activeRepos, headers);
      return res.json(deriveProjectTagsFromRepos(activeRepos));
    }

    return res.status(status).json({ error: `GitHub repository topics request failed with status ${status}.` });
  } catch (err) {
    return res.status(500).json({ error: `GitHub repository topics request failed: ${String(err)}` });
  }
});

app.put("/api/github/repos/:owner/:repo/topics", async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = `${owner}/${repo}`;
  assertRepoFullName(fullName);

  const { topics } = req.body as { topics: unknown };
  assert(Array.isArray(topics), "Repository topic update requires a topics array.");
  topics.forEach((topic) => {
    assert(typeof topic === "string", "Repository topics must be strings.");
    assertValidProjectTopicName(topic);
  });

  try {
    const response = await githubWrite<{ names: string[] }>("PUT", `/repos/${fullName}/topics`, { names: topics });
    if (response.status !== 200 || !response.data) {
      return res.status(response.status).json({ error: `GitHub topic update failed with status ${response.status}.` });
    }

    updateCachedRepoTopics(fullName, response.data.names);
    syncTimestamps[fullName] = new Date().toISOString();
    addLog(fullName, "SUCCESS", `Updated GitHub repository topics to: ${response.data.names.join(", ") || "(none)"}.`);
    return res.json({ success: true, topics: response.data.names });
  } catch (err) {
    addLog(fullName, "ERROR", `GitHub repository topic update failed: ${String(err)}`);
    return res.status(500).json({ error: "GitHub repository topic update failed." });
  }
});

app.delete("/api/github/projects/:topic", async (req, res) => {
  const { topic } = req.params;
  assertValidProjectTopicName(topic);

  try {
    const reposResponse = await githubFetch<RepositoryFromApi[]>("/user/repos?per_page=100&sort=updated", USER_REPOS_CACHE_KEY);
    let repos: RepositoryFromApi[];
    if (reposResponse.status === 304) {
      const cachedRepos = serverRepoCache[USER_REPOS_CACHE_KEY]?.data;
      assert(Array.isArray(cachedRepos), "GitHub repository cache must be available before deleting a project topic.");
      repos = cachedRepos as RepositoryFromApi[];
    } else if (reposResponse.status === 200 && reposResponse.data) {
      assertArray<RepositoryFromApi>(reposResponse.data, "GitHub repository list must be available before deleting a project topic.");
      repos = activeRepositoriesFromApi(reposResponse.data);
      cacheCommit(USER_REPOS_CACHE_KEY, repos, reposResponse.headers);
    } else {
      return res.status(reposResponse.status).json({ error: `GitHub repository topics request failed with status ${reposResponse.status}.` });
    }

    const reposWithTopic = repos.filter((repo) => repo.topics.includes(topic));
    for (const repo of reposWithTopic) {
      const nextTopics = repo.topics.filter((entry) => entry !== topic);
      const writeResponse = await githubWrite<{ names: string[] }>("PUT", `/repos/${repo.full_name}/topics`, { names: nextTopics });
      if (writeResponse.status !== 200 || !writeResponse.data) {
        return res.status(writeResponse.status).json({ error: `GitHub topic deletion failed for ${repo.full_name} with status ${writeResponse.status}.` });
      }
      updateCachedRepoTopics(repo.full_name, writeResponse.data.names);
      syncTimestamps[repo.full_name] = new Date().toISOString();
    }

    addLog("Projects", "SUCCESS", `Removed GitHub topic ${topic} from ${reposWithTopic.length} repositories.`);
    return res.json({ success: true, topic, reposUpdated: reposWithTopic.map((repo) => repo.full_name) });
  } catch (err) {
    addLog("Projects", "ERROR", `GitHub topic deletion failed: ${String(err)}`);
    return res.status(500).json({ error: "GitHub topic deletion failed." });
  }
});

app.get("/api/github/rate-limit_status", (_req, res) => {
  res.json(globalRateLimit);
});

app.get("/api/github/sync-logs", (_req, res) => {
  res.json(syncLogs);
});

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[GitHub PR Dashboard Server] booted clean on http://0.0.0.0:${PORT}`);
  });
}

startServer();
