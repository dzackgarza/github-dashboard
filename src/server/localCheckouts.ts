import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

export interface UnpushedCommit {
  sha: string;
  subject: string;
}

export interface LocalCheckoutStatus {
  path: string;
  repositoryFullName: string;
  remoteName: string;
  remoteUrl: string;
  branch: string | null;
  headSha: string;
  dirty: boolean;
  dirtyFiles: string[];
  untracked: boolean;
  untrackedFiles: string[];
  ahead: number;
  behind: number;
  detached: boolean;
  orphaned: boolean;
  worktree: boolean;
  gitDir: string;
  gitCommonDir: string;
  unpushedCommits: UnpushedCommit[];
}

export interface ScanRootError {
  path: string;
  kind: "missing" | "unreadable" | "git_error";
  message: string;
}

export interface LocalCheckoutInventory {
  scanRoots: string[];
  checkouts: LocalCheckoutStatus[];
  rootErrors: ScanRootError[];
}

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
]);

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function normalizeGitHubRemote(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim().replace(/\/$/, "");
  const patterns = [
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
    /^git\+ssh:\/\/git@github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
  }

  return null;
}

function parseStatus(status: string) {
  let branch: string | null = null;
  let headSha = "";
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const dirtyFiles: string[] = [];
  const untrackedFiles: string[] = [];

  for (const line of status.split(/\r?\n/)) {
    if (line.startsWith("# branch.oid ")) {
      headSha = line.slice("# branch.oid ".length);
      continue;
    }
    if (line.startsWith("# branch.head ")) {
      const value = line.slice("# branch.head ".length);
      branch = value === "(detached)" ? null : value;
      continue;
    }
    if (line.startsWith("# branch.upstream ")) {
      upstream = line.slice("# branch.upstream ".length);
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        ahead = Number.parseInt(match[1], 10);
        behind = Number.parseInt(match[2], 10);
      }
      continue;
    }
    if (line.startsWith("? ")) {
      untrackedFiles.push(line.slice(2));
      continue;
    }
    if (line.startsWith("1 ")) {
      const parts = line.split(" ");
      dirtyFiles.push(parts.slice(8).join(" "));
      continue;
    }
    if (line.startsWith("2 ")) {
      const parts = line.split(" ");
      dirtyFiles.push(parts.slice(9).join(" "));
      continue;
    }
    if (line.startsWith("u ")) {
      const parts = line.split(" ");
      dirtyFiles.push(parts.slice(10).join(" "));
    }
  }

  return {
    branch,
    headSha,
    upstream,
    ahead,
    behind,
    dirtyFiles: dirtyFiles.filter(Boolean),
    untrackedFiles,
    detached: branch === null,
  };
}

function resolveGitPath(worktreeRoot: string, gitPath: string): string {
  return isAbsolute(gitPath) ? gitPath : resolve(worktreeRoot, gitPath);
}

function selectGitHubRemote(worktreeRoot: string) {
  const remoteNames = runGit(worktreeRoot, ["remote"]).split(/\r?\n/).filter(Boolean);
  const orderedRemoteNames = [
    ...remoteNames.filter((remote) => remote === "origin"),
    ...remoteNames.filter((remote) => remote !== "origin"),
  ];

  for (const remoteName of orderedRemoteNames) {
    const remoteUrl = runGit(worktreeRoot, ["remote", "get-url", remoteName]);
    const repositoryFullName = normalizeGitHubRemote(remoteUrl);
    if (repositoryFullName) {
      return { remoteName, remoteUrl, repositoryFullName };
    }
  }

  throw new Error(`No GitHub remote found for checkout ${worktreeRoot}.`);
}

function listUnpushedCommits(worktreeRoot: string, upstream: string | null): UnpushedCommit[] {
  const revisionRange = upstream ? ["HEAD", `^${upstream}`] : ["HEAD", "--not", "--remotes"];
  const output = runGit(worktreeRoot, ["log", ...revisionRange, "--format=%H%x09%s"]);
  if (!output) {
    return [];
  }
  return output.split(/\r?\n/).map((line) => {
    const [sha, ...subjectParts] = line.split("\t");
    return {
      sha,
      subject: subjectParts.join("\t"),
    };
  });
}

export function inspectGitCheckout(path: string): LocalCheckoutStatus {
  const worktreeRoot = runGit(path, ["rev-parse", "--show-toplevel"]);
  const status = parseStatus(runGit(worktreeRoot, ["status", "--porcelain=v2", "--branch"]));
  const remote = selectGitHubRemote(worktreeRoot);
  const gitDir = resolveGitPath(worktreeRoot, runGit(worktreeRoot, ["rev-parse", "--git-dir"]));
  const gitCommonDir = resolveGitPath(worktreeRoot, runGit(worktreeRoot, ["rev-parse", "--git-common-dir"]));
  const detached = status.detached;
  const orphaned = !detached && status.upstream === null;

  return {
    path: worktreeRoot,
    repositoryFullName: remote.repositoryFullName,
    remoteName: remote.remoteName,
    remoteUrl: remote.remoteUrl,
    branch: status.branch,
    headSha: status.headSha,
    dirty: status.dirtyFiles.length > 0,
    dirtyFiles: status.dirtyFiles,
    untracked: status.untrackedFiles.length > 0,
    untrackedFiles: status.untrackedFiles,
    ahead: status.ahead,
    behind: status.behind,
    detached,
    orphaned,
    worktree: realpathSync(gitDir) !== realpathSync(gitCommonDir),
    gitDir,
    gitCommonDir,
    unpushedCommits: listUnpushedCommits(worktreeRoot, status.upstream),
  };
}

function hasGitMarker(path: string): boolean {
  return existsSync(join(path, ".git"));
}

function collectCheckoutRoots(root: string, discovered: Set<string>) {
  if (hasGitMarker(root)) {
    const topLevel = runGit(root, ["rev-parse", "--show-toplevel"]);
    discovered.add(realpathSync(topLevel));
    return;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    collectCheckoutRoots(join(root, entry.name), discovered);
  }
}

export function scanLocalCheckouts(scanRoots: string[]): LocalCheckoutInventory {
  const rootErrors: ScanRootError[] = [];
  const discovered = new Set<string>();

  for (const root of scanRoots) {
    const resolvedRoot = resolve(root);
    if (!existsSync(resolvedRoot)) {
      rootErrors.push({
        path: resolvedRoot,
        kind: "missing",
        message: `Configured scan root does not exist: ${resolvedRoot}`,
      });
      continue;
    }

    try {
      const stat = lstatSync(resolvedRoot);
      if (!stat.isDirectory()) {
        rootErrors.push({
          path: resolvedRoot,
          kind: "unreadable",
          message: `Configured scan root is not a directory: ${resolvedRoot}`,
        });
        continue;
      }
      collectCheckoutRoots(resolvedRoot, discovered);
    } catch (error) {
      rootErrors.push({
        path: resolvedRoot,
        kind: "unreadable",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const checkouts: LocalCheckoutStatus[] = [];
  for (const checkoutRoot of discovered) {
    try {
      checkouts.push(inspectGitCheckout(checkoutRoot));
    } catch (error) {
      rootErrors.push({
        path: checkoutRoot,
        kind: "git_error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  checkouts.sort((a, b) => a.path.localeCompare(b.path));
  return {
    scanRoots: scanRoots.map((root) => resolve(root)),
    checkouts,
    rootErrors,
  };
}

export function parseScanRootsConfig(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    throw new Error("GITHUB_DASHBOARD_SCAN_ROOTS is required and must contain at least one absolute path.");
  }

  const roots = value.split(":").map((entry) => entry.trim()).filter(Boolean);
  if (roots.length === 0) {
    throw new Error("GITHUB_DASHBOARD_SCAN_ROOTS is required and must contain at least one absolute path.");
  }

  const relativeRoot = roots.find((root) => !isAbsolute(root));
  if (relativeRoot) {
    throw new Error(`GITHUB_DASHBOARD_SCAN_ROOTS entries must be absolute paths: ${relativeRoot}`);
  }

  return roots;
}

export function displayPath(path: string): string {
  return basename(path) || path;
}
