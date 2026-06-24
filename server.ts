import assert from "node:assert/strict";
import express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import pMap from "p-map";
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

// Express 4 does not forward rejected promises from async route handlers to the
// error middleware. This wrapper bridges that gap: it invokes the async handler and
// routes any rejection to next(), so a single terminal error handler can respond.
function asyncHandler(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => void handler(req, res).catch(next);
}

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
  latest_commit_at: string;
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

interface ReviewThreadCommentAuthorFromApi {
  login: string;
  avatar_url: string;
  url?: string;
}

interface ReviewThreadCommentFromApi {
  id: string;
  body: string;
  createdAt: string;
  author: ReviewThreadCommentAuthorFromApi | null;
}

interface ReviewThreadFromApi {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  startLine: number | null;
  comments: {
    nodes: ReviewThreadCommentFromApi[];
  };
}

interface PullRequestReviewThreadsGraphqlData {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: ReviewThreadFromApi[];
      };
    } | null;
  } | null;
}

interface ResolveReviewThreadPayload {
  resolveReviewThread: {
    thread: {
      id: string;
      isResolved: boolean;
    };
  };
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

function requireArray<T>(value: unknown, message: string): T[] {
  assert(Array.isArray(value), message);
  return value as T[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  return void 0;
}

async function githubFetch<T>(urlPath: string, etagKey?: string): Promise<{ data: T | undefined; status: number; headers: Headers }> {
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

  const payload = response.status === 304 ? void 0 : await response.json() as T;
  return {
    data: payload,
    status: response.status,
    headers: response.headers
  };
}

async function githubWrite<T>(method: "PUT" | "DELETE", urlPath: string, body: unknown): Promise<{ data: T | undefined; status: number; headers: Headers }> {
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
    data: response.status === 204 ? void 0 : await response.json() as T,
    status: response.status,
    headers: response.headers
  };
}

async function githubGraphql<T>(query: string, variables: Record<string, string>): Promise<T> {
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

const PULL_REQUEST_REVIEW_THREADS_QUERY = `
  query PullRequestReviewThreads($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            startLine
            comments(first: 1) {
              nodes {
                id
                body
                createdAt
                author {
                  login
                  avatar_url: avatarUrl
                  url
                }
              }
            }
          }
        }
      }
    }
  }
`;

const RESOLVE_REVIEW_THREAD_MUTATION = `
  mutation ResolveReviewThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread {
        id
        isResolved
      }
    }
  }
`;

async function fetchBranchHeadCommits(fullName: string): Promise<BranchHeadCommit[]> {
  requireRepoFullName(fullName);
  const [owner, name] = fullName.split("/");
  const branches: BranchHeadCommit[] = [];
  let cursor = "";
  let hasNextPage = true;

  while (hasNextPage) {
    const variables: Record<string, string> = cursor.length > 0
      ? { owner, name, after: cursor }
      : { owner, name };
    const graphqlData: BranchRefsGraphqlData = await githubGraphql<BranchRefsGraphqlData>(BRANCH_HEADS_QUERY, variables);
    assert(graphqlData.repository, `GitHub repository ${fullName} was not found while reading branch heads.`);

    const pageBranches = graphqlData.repository.refs.nodes.map((branch): BranchHeadCommit => {
      assert(branch.target, `Branch ${branch.name} in ${fullName} has no target commit.`);
      assert(branch.target.__typename === "Commit", `Branch ${branch.name} in ${fullName} does not point at a commit.`);
      assert(typeof branch.target.oid === "string" && branch.target.oid.length > 0, `Branch ${branch.name} in ${fullName} is missing a commit oid.`);
      assert(typeof branch.target.committedDate === "string" && branch.target.committedDate.length > 0, `Branch ${branch.name} in ${fullName} is missing a commit date.`);
      return {
        name: branch.name,
        commit: {
          sha: branch.target.oid.slice(0, 8),
          date: branch.target.committedDate
        }
      };
    });
    branches.push(...pageBranches);

    const pageInfo = graphqlData.repository.refs.pageInfo;
    hasNextPage = pageInfo.hasNextPage;
    if (hasNextPage) {
      assert(typeof pageInfo.endCursor === "string" && pageInfo.endCursor.length > 0, `Branch pagination for ${fullName} reported another page without a cursor.`);
      cursor = pageInfo.endCursor;
    }
  }

  return branches;
}

function latestCommitTimestamp(branches: BranchHeadCommit[], fullName: string): string {
  // An active (non-archived) repository always exposes at least its default branch head.
  // A zero-branch active repo is an empty, never-pushed repository; treat it as a loud
  // invariant violation rather than leaking a nullable timestamp into the workspace sort.
  assert(branches.length > 0, `Active repository ${fullName} reported zero branch heads.`);

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

// Resolves the active repository list backing a topic mutation. Callers must first
// confirm the response is a 304 (served from cache) or a 200 carrying data; this helper
// asserts that contract loudly rather than tolerating a missing cache.
function resolveReposForTopicMutation(
  reposResponse: { data: RepositoryFromApi[] | undefined; status: number; headers: Headers }
): RepositoryFromApi[] {
  if (reposResponse.status === 304) {
    const cachedRepos = serverRepoCache[USER_REPOS_CACHE_KEY]?.data;
    assert(Array.isArray(cachedRepos), "GitHub repository cache must be available before mutating a project topic.");
    return cachedRepos as RepositoryFromApi[];
  }

  const freshRepos = requireArray<RepositoryFromApi>(reposResponse.data, "GitHub repository list must be available before mutating a project topic.");
  const activeRepos = activeRepositoriesFromApi(freshRepos);
  cacheCommit(USER_REPOS_CACHE_KEY, activeRepos, reposResponse.headers);
  return activeRepos;
}

const REPO_ENRICHMENT_CONCURRENCY = 4;

async function normalizeRepositoriesForWorkspace(repos: RepositoryFromApi[]): Promise<RepositoryForWorkspace[]> {
  const enriched = await pMap(
    activeRepositoriesFromApi(repos),
    async (repo): Promise<RepositoryForWorkspace> => {
      const branchHeads = await fetchBranchHeadCommits(repo.full_name);
      return {
        ...repo,
        latest_commit_at: latestCommitTimestamp(branchHeads, repo.full_name)
      };
    },
    { concurrency: REPO_ENRICHMENT_CONCURRENCY }
  );

  return enriched.sort((left, right) => {
    const rightTime = Date.parse(right.latest_commit_at);
    const leftTime = Date.parse(left.latest_commit_at);
    assert(!Number.isNaN(rightTime), `${right.full_name} latest_commit_at is invalid.`);
    assert(!Number.isNaN(leftTime), `${left.full_name} latest_commit_at is invalid.`);
    return rightTime - leftTime || left.full_name.localeCompare(right.full_name);
  });
}

function requireRepoFullName(value: unknown): string {
  assert(typeof value === "string" && value.includes("/"), "Repository full name must be in owner/name form.");
  return value;
}

// Validates a positive-integer route segment without throwing, so routes can map an
// invalid segment to a typed 400 response instead of catching a control-flow exception.
function parseOptionalRouteNumber(raw: string): number | undefined {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : void 0;
}

function cacheCommit<T>(key: string, data: T, headers: Headers): void {
  serverRepoCache[key] = {
    etag: headers.get("etag") ?? "",
    data,
    lastSynced: new Date().toISOString()
  };
  return void 0;
}

function updateCachedRepoTopics(fullName: string, topics: string[]): void {
  [USER_REPOS_CACHE_KEY, WORKSPACE_REPOS_CACHE_KEY]
    .map((cacheKey) => serverRepoCache[cacheKey])
    .filter((cached): cached is GithubCacheEntry => cached !== undefined)
    .forEach((cached) => {
      assert(Array.isArray(cached.data), "Cached repository data must be an array.");
      const repos = cached.data as RepositoryFromApi[];
      const index = repos.findIndex((repo) => repo.full_name === fullName);
      if (index !== -1) {
        repos[index] = { ...repos[index], topics };
        cached.data = repos;
        cached.lastSynced = new Date().toISOString();
      }
      return void 0;
    });
  return void 0;
}

// Check GITHUB_TOKEN configuration
app.get("/api/github/config", asyncHandler(async (_req, res) => {
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
}));

app.get("/api/github/repos", asyncHandler(async (_req, res) => {
  const rawRepoCache = serverRepoCache[USER_REPOS_CACHE_KEY];
  const workspaceRepoCache = serverRepoCache[WORKSPACE_REPOS_CACHE_KEY];

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
    const activeRepos = activeRepositoriesFromApi(requireArray<RepositoryFromApi>(data, "GitHub repository list must be an array."));
    cacheCommit(USER_REPOS_CACHE_KEY, activeRepos, headers);
    const workspaceRepos = await normalizeRepositoriesForWorkspace(activeRepos);
    cacheCommit(WORKSPACE_REPOS_CACHE_KEY, workspaceRepos, headers);

    workspaceRepos.forEach((repo) => {
      syncTimestamps[repo.full_name] = new Date().toISOString();
      return void 0;
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
}));

app.post("/api/github/repos/:owner/:repo/sync", asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);

  const cacheKeyIssues = `issues-${fullName}`;
  const cacheKeyPrs = `prs-${fullName}`;

  syncTimestamps[fullName] = new Date().toISOString();

  const issueRes = await githubFetch<IssueFromApi[]>(`/repos/${fullName}/issues?state=open&per_page=30`, cacheKeyIssues);

  if (issueRes.status === 200 && issueRes.data) {
    const issues = requireArray<IssueFromApi>(issueRes.data, "GitHub issue list must be an array.");
    cacheCommit(cacheKeyIssues, issues, issueRes.headers);
    addLog(fullName, "SUCCESS", `Sync detected updates on issues repository tree. Saved and cached.`);
  } else if (issueRes.status === 304) {
    addLog(fullName, "304_HIT", "Issues delta check: returned 304 Not Modified. Rate cost saved.");
  }

  const prsRes = await githubFetch<PRFromApi[]>(`/repos/${fullName}/pulls?state=open&per_page=30`, cacheKeyPrs);

  if (prsRes.status === 200 && prsRes.data) {
    const prs = requireArray<PRFromApi>(prsRes.data, "GitHub PR list must be an array.");
    cacheCommit(cacheKeyPrs, prs, prsRes.headers);
    addLog(fullName, "SUCCESS", "Sync detected updates on pull requests repository tree. Saved.");
  } else if (prsRes.status === 304) {
    addLog(fullName, "304_HIT", "Pull requests delta check: returned 304 Not Modified. Sync efficiency 100%.");
  }

  return res.json({
    success: true,
    lastSynced: syncTimestamps[fullName],
    message: "Live API synchronization performed cleanly with conditional ETags."
  });
}));

app.get("/api/github/repos/:owner/:repo/issues", asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);

  const cacheKey = `issues-${fullName}`;
  const cached = serverRepoCache[cacheKey];

  const { data, status, headers } = await githubFetch<IssueFromApi[]>(`/repos/${fullName}/issues?state=open&per_page=50`, cacheKey);
  let finalIssues: IssueFromApi[] = [];

  if (status === 304 && cached) {
    const cachedIssues = requireArray<IssueFromApi>(cached.data, "Cached issue data must be an array.");
    addLog(fullName, "304_HIT", `Issues list (cached ETag hit). Served ${cachedIssues.length} issues.`);
    finalIssues = cachedIssues;
  } else if (status === 200 && data) {
    const freshIssues = requireArray<IssueFromApi>(data, "GitHub issue list must be an array.");
    cacheCommit(cacheKey, freshIssues, headers);
    addLog(fullName, "INFO", `Served ${freshIssues.length} issues from GitHub. Saved to conditional buffer.`);
    finalIssues = freshIssues;
  } else {
    addLog(fullName, "ERROR", `GitHub issues request failed with status ${status}.`);
    return res.status(status).json({ error: `GitHub issues request failed with status ${status}.` });
  }

  const issuesOnly = finalIssues.filter((item) => item.pull_request === undefined);
  return res.json(issuesOnly);
}));

app.get("/api/github/repos/:owner/:repo/prs", asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);

  const cacheKey = `prs-${fullName}`;
  const cached = serverRepoCache[cacheKey];

  const { data, status, headers } = await githubFetch<PRFromApi[]>(`/repos/${fullName}/pulls?state=open&per_page=50`, cacheKey);
  let finalPrs: PRFromApi[] = [];

  if (status === 304 && cached) {
    const cachedPrs = requireArray<PRFromApi>(cached.data, "Cached PR data must be an array.");
    addLog(fullName, "304_HIT", `Pull requests (cached ETag hit). Served ${cachedPrs.length} items from memory.`);
    finalPrs = cachedPrs;
  } else if (status === 200 && data) {
    const freshPrs = requireArray<PRFromApi>(data, "GitHub PR list must be an array.");
    cacheCommit(cacheKey, freshPrs, headers);
    addLog(fullName, "INFO", `Served ${freshPrs.length} pull requests from GitHub.`);
    finalPrs = freshPrs;
  } else {
    addLog(fullName, "ERROR", `GitHub pull requests request failed with status ${status}.`);
    return res.status(status).json({ error: `GitHub pull requests request failed with status ${status}.` });
  }

  return res.json(finalPrs);
}));

app.get("/api/github/repos/:owner/:repo/branches", asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);

  const cacheKey = `branches-${fullName}`;

  const finalBranches = await fetchBranchHeadCommits(fullName);
  serverRepoCache[cacheKey] = {
    etag: "",
    data: finalBranches,
    lastSynced: new Date().toISOString()
  };
  return res.json(finalBranches);
}));

app.get("/api/github/repos/:owner/:repo/issues/:number", asyncHandler(async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);
  const issueNumber = parseOptionalRouteNumber(number);
  if (issueNumber === undefined) {
    return res.status(400).json({ error: "Issue number must be a positive integer." });
  }

  const singleIssueRes = await githubFetch<IssueFromApi>(`/repos/${fullName}/issues/${issueNumber}`);
  if (singleIssueRes.status !== 200 || !singleIssueRes.data) {
    return res.status(singleIssueRes.status).json({ error: `GitHub issue request failed with status ${singleIssueRes.status}.` });
  }

  if (singleIssueRes.data.pull_request !== undefined) {
    return res.status(400).json({ error: "Requested resource is a pull request, not an issue." });
  }

  return res.json(singleIssueRes.data);
}));

app.get("/api/github/repos/:owner/:repo/prs/:number", asyncHandler(async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);
  const prNumber = parseOptionalRouteNumber(number);
  if (prNumber === undefined) {
    return res.status(400).json({ error: "Pull request number must be a positive integer." });
  }

  const singlePRRes = await githubFetch<PRFromApi>(`/repos/${fullName}/pulls/${prNumber}`);
  if (singlePRRes.status !== 200 || !singlePRRes.data) {
    return res.status(singlePRRes.status).json({ error: `GitHub PR request failed with status ${singlePRRes.status}.` });
  }

  return res.json(singlePRRes.data);
}));

app.get("/api/github/repos/:owner/:repo/issues/:number/comments", asyncHandler(async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);
  const issueNumber = parseOptionalRouteNumber(number);
  if (issueNumber === undefined) {
    return res.status(400).json({ error: "Issue number must be a positive integer." });
  }

  const cacheKey = `comments-${fullName}-${issueNumber}`;
  const cached = serverRepoCache[cacheKey];

  const { data, status, headers } = await githubFetch<CommentFromApi[]>(`/repos/${fullName}/issues/${issueNumber}/comments`, cacheKey);
  if (status === 304 && cached) {
    const cachedComments = requireArray<CommentFromApi>(cached.data, "Cached comments data must be an array.");
    return res.json(cachedComments);
  }

  if (status === 200 && data) {
    const freshComments = requireArray<CommentFromApi>(data, "GitHub comments response must be an array.");
    cacheCommit(cacheKey, freshComments, headers);
    return res.json(freshComments);
  }

  return res.status(status).json({ error: `GitHub comments request failed with status ${status}.` });
}));

app.post("/api/github/repos/:owner/:repo/issues/:number/comments", asyncHandler(async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);
  const issueNumber = parseOptionalRouteNumber(number);
  if (issueNumber === undefined) {
    return res.status(400).json({ error: "Issue number must be a positive integer." });
  }

  const requestBody: unknown = req.body;
  const body = isRecord(requestBody) ? requestBody.body : void 0;
  if (typeof body !== "string" || body.trim() === "") {
    return res.status(400).json({ error: "Empty comment body prohibited." });
  }

  const url = `https://api.github.com/repos/${fullName}/issues/${issueNumber}/comments`;
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
}));

app.get("/api/github/repos/:owner/:repo/prs/:number/review-threads", asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const { number } = req.params;
  requireRepoFullName(`${owner}/${repo}`);
  const prNumber = parseOptionalRouteNumber(number);
  if (prNumber === undefined) {
    return res.status(400).json({ error: "PR number must be a positive integer." });
  }

  const data = await githubGraphql<PullRequestReviewThreadsGraphqlData>(PULL_REQUEST_REVIEW_THREADS_QUERY, {
    owner,
    name: repo,
    number: String(prNumber)
  });

  const reviewThreads = data.repository?.pullRequest?.reviewThreads?.nodes;
  assert(Array.isArray(reviewThreads), `Pull request review threads response was not an array for #${number}.`);

  const unresolved = reviewThreads
    .filter((thread) => !thread.isResolved)
    .map((thread) => {
      const firstComment = thread.comments?.nodes?.[0];

      return {
        id: thread.id,
        isOutdated: thread.isOutdated,
        path: thread.path,
        line: thread.line,
        startLine: thread.startLine,
        latestComment: firstComment
          ? {
              id: firstComment.id,
              body: firstComment.body,
              created_at: firstComment.createdAt,
              user: firstComment.author
                ? {
                    login: firstComment.author.login,
                    avatar_url: firstComment.author.avatar_url ?? "",
                    html_url: firstComment.author.url
                  }
                : {
                    login: "Unknown",
                    avatar_url: "",
                    html_url: ""
                  }
            }
          : void 0
      };
    });

  return res.json(unresolved);
}));

app.post("/api/github/repos/:owner/:repo/prs/:number/review-threads/resolve", asyncHandler(async (req, res) => {
  const { number } = req.params;
  const prNumber = parseOptionalRouteNumber(number);
  if (prNumber === undefined) {
    return res.status(400).json({ error: "PR number must be a positive integer." });
  }

  const requestBody: unknown = req.body;
  const threadId = isRecord(requestBody) ? requestBody.threadId : void 0;
  if (typeof threadId !== "string" || threadId.trim().length === 0) {
    return res.status(400).json({ error: "A non-empty threadId is required." });
  }

  const data = await githubGraphql<ResolveReviewThreadPayload>(RESOLVE_REVIEW_THREAD_MUTATION, {
    threadId
  });

  return res.json({
    id: data.resolveReviewThread.thread.id,
    isResolved: data.resolveReviewThread.thread.isResolved
  });
}));

// A GitHub fetch is usable when it returned 200 and carries a defined body. Narrowing
// `data` to non-undefined here keeps the response-detail route flat instead of repeating
// the status/body guard per upstream call.
function fetchSucceeded<T>(result: { data: T | undefined; status: number }): result is { data: T; status: number } {
  return result.status === 200 && result.data !== undefined;
}

// Per-class security telemetry state. A class is `configured` only when GitHub returned
// the alert list (200). A repo that has the feature turned off answers 403/404, which is a
// distinct domain fact ("not configured") that must be surfaced rather than conflated with
// "zero alerts". Genuine transport/server failures are NOT represented here — they propagate
// as a 502 from loadPrCiStatus.
type SecurityClassState =
  | { configured: true; open: number }
  | { configured: false };

interface SecurityAlertsSummary {
  dependabot: SecurityClassState;
  codeScanning: SecurityClassState;
  secretScanning: SecurityClassState;
  totalOpen: number;
}

// Classifies one security-alert endpoint response.
//   200            -> configured, with the open alert count
//   403 / 404      -> feature not configured on the repo (a domain fact, not an error)
//   anything else  -> genuine telemetry failure -> undefined (caller fails loud with 502)
function classifySecurityEndpoint(
  result: { data: unknown[] | undefined; status: number },
  message: string
): SecurityClassState | undefined {
  if (result.status === 200 && result.data !== undefined) {
    return { configured: true, open: requireArray<unknown>(result.data, message).length };
  }
  if (result.status === 403 || result.status === 404) {
    return { configured: false };
  }
  return void 0;
}

function openCount(state: SecurityClassState): number {
  return state.configured ? state.open : 0;
}

interface PrCiStatus {
  state: "success" | "failure" | "pending";
  runs: { name: string; status: string; elapsed: string; conclusion: string | null | undefined }[];
  security_alerts: SecurityAlertsSummary;
}

function summarizeCheckSuites(checkSuites: CheckSuite[]): Pick<PrCiStatus, "state" | "runs"> {
  const runs = checkSuites.map((suite) => ({
    name: suite.app?.name ?? "Workflow run Check",
    status: suite.status,
    elapsed: "Active sync",
    conclusion: suite.conclusion
  }));
  const conclusion = checkSuites[0]?.conclusion;
  const state: "success" | "failure" | "pending" =
    conclusion === "success" ? "success" : conclusion === "failure" ? "failure" : "pending";
  return { state, runs };
}

// Fetches the four security/check-suite endpoints behind a PR's CI panel and assembles the
// CI status. Returns undefined only on a genuine telemetry failure (check-suites not 200, or
// a security endpoint failing with a status other than 200/403/404) so the route fails loud
// with a 502. A 403/404 from a security endpoint is normal "feature not configured" and is
// preserved in the per-class summary, not treated as an error.
async function loadPrCiStatus(fullName: string, headSha: string): Promise<PrCiStatus | undefined> {
  const [dependabotRes, codeScanningRes, secretScanningRes, checksRes] = await Promise.all([
    githubFetch<unknown[]>(`/repos/${fullName}/dependabot/alerts?state=open&per_page=100`),
    githubFetch<unknown[]>(`/repos/${fullName}/code-scanning/alerts?state=open&per_page=100`),
    githubFetch<unknown[]>(`/repos/${fullName}/secret-scanning/alerts?state=open&per_page=100`),
    githubFetch<CheckSuitesResponse>(`/repos/${fullName}/commits/${headSha}/check-suites`)
  ]);

  if (!fetchSucceeded(checksRes)) {
    return void 0;
  }

  const dependabot = classifySecurityEndpoint(dependabotRes, "Dependabot security alerts response must be an array.");
  const codeScanning = classifySecurityEndpoint(codeScanningRes, "Code scanning alerts response must be an array.");
  const secretScanning = classifySecurityEndpoint(secretScanningRes, "Secret scanning alerts response must be an array.");
  if (dependabot === undefined || codeScanning === undefined || secretScanning === undefined) {
    return void 0;
  }

  return {
    ...summarizeCheckSuites(checksRes.data.check_suites),
    security_alerts: {
      dependabot,
      codeScanning,
      secretScanning,
      totalOpen: openCount(dependabot) + openCount(codeScanning) + openCount(secretScanning)
    }
  };
}

// Assembles the PR detail payload from the validated PR record, file diff, and CI status.
// Keeping the object construction here keeps the route handler flat.
function buildPrDetailPayload(prNumber: number, pr: PRFromApi, prFiles: DiffFileFromApi[], ciStatus: PrCiStatus) {
  const diff = prFiles.map((file) => ({
    file: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    code: file.patch
  } as GitFile));

  return {
    number: prNumber,
    title: pr.title,
    body: pr.body ?? "",
    state: pr.state,
    html_url: pr.html_url,
    user: pr.user,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    base_branch: pr.base.ref,
    head_branch: pr.head.ref,
    diff,
    ci_status: {
      state: ciStatus.state,
      runs: ciStatus.runs,
      unresolved_threads_count: pr.review_comments ?? 0,
      security_alerts: ciStatus.security_alerts
    }
  };
}

app.get("/api/github/repos/:owner/:repo/prs/:number/details", asyncHandler(async (req, res) => {
  const { owner, repo, number } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);
  const prNumber = parseOptionalRouteNumber(number);
  if (prNumber === undefined) {
    return res.status(400).json({ error: "Pull request number must be a positive integer." });
  }

  const prDetailsRes = await githubFetch<PRFromApi>(`/repos/${fullName}/pulls/${prNumber}`);
  const filesRes = await githubFetch<DiffFileFromApi[]>(`/repos/${fullName}/pulls/${prNumber}/files`);

  if (!fetchSucceeded(prDetailsRes) || !fetchSucceeded(filesRes)) {
    addLog(fullName, "ERROR", `GitHub PR detail request failed for #${number}.`);
    return res.status(502).json({ error: "GitHub PR detail request failed." });
  }

  const headSha = prDetailsRes.data.head?.sha;
  assert(typeof headSha === "string" && headSha.length > 0, "GitHub pull request response must include head.sha.");

  const ciStatus = await loadPrCiStatus(fullName, headSha);
  if (ciStatus === undefined) {
    addLog(fullName, "ERROR", `GitHub security or check suite lookup failed for #${number}.`);
    return res.status(502).json({ error: "GitHub PR detail request failed due to unavailable check or security endpoints." });
  }

  const prFiles = requireArray<DiffFileFromApi>(filesRes.data, "PR file list must be an array.");
  return res.json(buildPrDetailPayload(Number(number), prDetailsRes.data, prFiles, ciStatus));
}));

app.get("/api/github/projects", asyncHandler(async (_req, res) => {
  const cached = serverRepoCache[USER_REPOS_CACHE_KEY];

  const { data, status, headers } = await githubFetch<RepositoryFromApi[]>("/user/repos?per_page=100&sort=updated", USER_REPOS_CACHE_KEY);

  if (status === 304 && cached) {
    assert(Array.isArray(cached.data), "Cached repository data must be an array.");
    return res.json(deriveProjectTagsFromRepos(cached.data as RepositoryFromApi[]));
  }

  if (status === 200 && data) {
    const repos = requireArray<RepositoryFromApi>(data, "GitHub repository list must be an array.");
    const activeRepos = activeRepositoriesFromApi(repos);
    cacheCommit(USER_REPOS_CACHE_KEY, activeRepos, headers);
    return res.json(deriveProjectTagsFromRepos(activeRepos));
  }

  return res.status(status).json({ error: `GitHub repository topics request failed with status ${status}.` });
}));

app.put("/api/github/repos/:owner/:repo/topics", asyncHandler(async (req, res) => {
  const { owner, repo } = req.params;
  const fullName = requireRepoFullName(`${owner}/${repo}`);

  const requestBody: unknown = req.body;
  const topics = isRecord(requestBody) ? requestBody.topics : void 0;
  assert(Array.isArray(topics), "Repository topic update requires a topics array.");
  topics.forEach((topic) => {
    assert(typeof topic === "string", "Repository topics must be strings.");
    assertValidProjectTopicName(topic);
    return void 0;
  });

  const response = await githubWrite<{ names: string[] }>("PUT", `/repos/${fullName}/topics`, { names: topics });
  if (response.status !== 200 || !response.data) {
    return res.status(response.status).json({ error: `GitHub topic update failed with status ${response.status}.` });
  }

  updateCachedRepoTopics(fullName, response.data.names);
  syncTimestamps[fullName] = new Date().toISOString();
  addLog(fullName, "SUCCESS", `Updated GitHub repository topics to: ${response.data.names.join(", ") || "(none)"}.`);
  return res.json({ success: true, topics: response.data.names });
}));

app.delete("/api/github/projects/:topic", asyncHandler(async (req, res) => {
  const { topic } = req.params;
  assertValidProjectTopicName(topic);

  const reposResponse = await githubFetch<RepositoryFromApi[]>("/user/repos?per_page=100&sort=updated", USER_REPOS_CACHE_KEY);
  if (reposResponse.status !== 304 && !(reposResponse.status === 200 && reposResponse.data)) {
    return res.status(reposResponse.status).json({ error: `GitHub repository topics request failed with status ${reposResponse.status}.` });
  }

  const repos = resolveReposForTopicMutation(reposResponse);

  const reposWithTopic = repos.filter((repo) => repo.topics.includes(topic));
  const updatedRepos = await pMap(
    reposWithTopic,
    async (repo): Promise<string> => {
      const nextTopics = repo.topics.filter((entry) => entry !== topic);
      const writeResponse = await githubWrite<{ names: string[] }>("PUT", `/repos/${repo.full_name}/topics`, { names: nextTopics });
      assert(
        writeResponse.status === 200 && writeResponse.data,
        `GitHub topic deletion failed for ${repo.full_name} with status ${writeResponse.status}.`
      );
      updateCachedRepoTopics(repo.full_name, writeResponse.data.names);
      syncTimestamps[repo.full_name] = new Date().toISOString();
      return repo.full_name;
    },
    { concurrency: REPO_ENRICHMENT_CONCURRENCY }
  );

  addLog("Projects", "SUCCESS", `Removed GitHub topic ${topic} from ${updatedRepos.length} repositories.`);
  return res.json({ success: true, topic, reposUpdated: updatedRepos });
}));

app.get("/api/github/rate-limit_status", (_req, res) => {
  return res.json(globalRateLimit);
});

app.get("/api/github/sync-logs", (_req, res) => {
  return res.json(syncLogs);
});

// Terminal error handler. Async routes are wrapped in asyncHandler, which forwards any
// rejection here via next(err). This is the single 500 responder; per-route catch-to-500
// blocks were removed so failures surface through one boundary instead of being
// swallowed or double-handled.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  addLog("Server", "ERROR", `Unhandled request failure: ${message}`);
  res.status(500).json({ error: message });
  return void 0;
});

async function startServer(): Promise<void> {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[GitHub PR Dashboard Server] booted clean on http://0.0.0.0:${PORT}`);
    return void 0;
  });
  return void 0;
}

startServer().catch((err: unknown) => {
  console.error(err);
  return process.exit(1);
});
