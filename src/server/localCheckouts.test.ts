import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  inspectGitCheckout,
  normalizeGitHubRemote,
  scanLocalCheckouts,
} from "./localCheckouts";

let tempDirs: string[] = [];

function tempPath(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), `github-dashboard-${prefix}-`));
  tempDirs.push(path);
  return path;
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function configureGit(cwd: string) {
  git(cwd, ["config", "user.email", "dashboard@example.invalid"]);
  git(cwd, ["config", "user.name", "Dashboard Test"]);
  git(cwd, ["config", "core.hooksPath", "/dev/null"]);
}

function initRepo(name: string) {
  const root = tempPath(name);
  git(root, ["init", "-b", "main"]);
  configureGit(root);
  writeFileSync(join(root, "README.md"), `${name}\n`);
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "initial"]);
  git(root, ["remote", "add", "origin", `git@github.com:dzackgarza/${name}.git`]);
  return root;
}

function initRemoteBackedClone(name: string) {
  const root = tempPath(name);
  const bare = join(root, `${name}.git`);
  git(root, ["init", "--bare", bare]);

  const seed = join(root, "seed");
  git(root, ["clone", bare, seed]);
  configureGit(seed);
  git(seed, ["switch", "-c", "main"]);
  writeFileSync(join(seed, "README.md"), `${name}\n`);
  git(seed, ["add", "README.md"]);
  git(seed, ["commit", "-m", "initial"]);
  git(seed, ["push", "-u", "origin", "main"]);

  const clone = join(root, "clone");
  git(root, ["clone", bare, clone]);
  configureGit(clone);
  git(clone, ["remote", "add", "github", `https://github.com/dzackgarza/${name}.git`]);
  return { root, seed, clone };
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("normalizeGitHubRemote", () => {
  it("normalizes SSH, ssh://, HTTPS, and git+ssh GitHub remotes to owner/repo", () => {
    expect(normalizeGitHubRemote("git@github.com:dzackgarza/github-dashboard.git")).toBe("dzackgarza/github-dashboard");
    expect(normalizeGitHubRemote("ssh://git@github.com/dzackgarza/github-dashboard.git")).toBe("dzackgarza/github-dashboard");
    expect(normalizeGitHubRemote("https://github.com/dzackgarza/github-dashboard.git")).toBe("dzackgarza/github-dashboard");
    expect(normalizeGitHubRemote("git+ssh://git@github.com/dzackgarza/github-dashboard.git")).toBe("dzackgarza/github-dashboard");
  });
});

describe("inspectGitCheckout", () => {
  it("reports a clean checkout", () => {
    const repo = initRepo("clean-repo");

    const checkout = inspectGitCheckout(repo);

    expect(checkout.repositoryFullName).toBe("dzackgarza/clean-repo");
    expect(checkout.branch).toBe("main");
    expect(checkout.dirty).toBe(false);
    expect(checkout.untracked).toBe(false);
    expect(checkout.ahead).toBe(0);
    expect(checkout.behind).toBe(0);
  });

  it("reports dirty and untracked files separately", () => {
    const repo = initRepo("dirty-repo");
    writeFileSync(join(repo, "README.md"), "changed\n");
    writeFileSync(join(repo, "scratch.txt"), "untracked\n");

    const checkout = inspectGitCheckout(repo);

    expect(checkout.dirty).toBe(true);
    expect(checkout.dirtyFiles).toContain("README.md");
    expect(checkout.untracked).toBe(true);
    expect(checkout.untrackedFiles).toContain("scratch.txt");
  });

  it("reports ahead, behind, and unpushed commits from real upstream refs", () => {
    const { seed, clone } = initRemoteBackedClone("divergent-repo");

    writeFileSync(join(clone, "local.txt"), "local\n");
    git(clone, ["add", "local.txt"]);
    git(clone, ["commit", "-m", "local change"]);

    writeFileSync(join(seed, "remote.txt"), "remote\n");
    git(seed, ["add", "remote.txt"]);
    git(seed, ["commit", "-m", "remote change"]);
    git(seed, ["push"]);
    git(clone, ["fetch", "origin"]);

    const checkout = inspectGitCheckout(clone);

    expect(checkout.ahead).toBe(1);
    expect(checkout.behind).toBe(1);
    expect(checkout.unpushedCommits).toHaveLength(1);
    expect(checkout.unpushedCommits[0].subject).toBe("local change");
  });

  it("reports detached, orphaned, and linked worktree states", () => {
    const repo = initRepo("worktree-repo");
    const worktreePath = join(tempPath("worktree-holder"), "linked");
    mkdirSync(worktreePath, { recursive: true });
    rmSync(worktreePath, { recursive: true, force: true });
    git(repo, ["worktree", "add", "-b", "linked-branch", worktreePath]);

    const worktree = inspectGitCheckout(worktreePath);
    expect(worktree.worktree).toBe(true);
    expect(worktree.orphaned).toBe(true);

    git(repo, ["switch", "-c", "local-only"]);
    const orphaned = inspectGitCheckout(repo);
    expect(orphaned.orphaned).toBe(true);

    git(repo, ["checkout", "--detach", "HEAD"]);
    const detached = inspectGitCheckout(repo);
    expect(detached.detached).toBe(true);
  });
});

describe("scanLocalCheckouts", () => {
  it("returns visible root errors and does not silently ignore inaccessible scan roots", () => {
    const repo = initRepo("scan-repo");
    const missingRoot = join(tempPath("missing-holder"), "does-not-exist");

    const inventory = scanLocalCheckouts([repo, missingRoot]);

    expect(inventory.checkouts.map((checkout) => checkout.repositoryFullName)).toContain("dzackgarza/scan-repo");
    expect(inventory.rootErrors).toEqual([
      expect.objectContaining({
        path: missingRoot,
        kind: "missing",
      }),
    ]);
  });
});
