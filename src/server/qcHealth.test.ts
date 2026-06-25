import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalCheckoutStatus } from "./localCheckouts";
import {
  buildLocalDoctorCommand,
  CheckRunOutput,
  LocalDoctorCommand,
  resolveQCHealthForProjection,
  spawnCommandRunner,
} from "./qcHealth";

let tempDirs: string[] = [];

function tempPath(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), `github-dashboard-${prefix}-`));
  tempDirs.push(path);
  return path;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function checkout(path: string): LocalCheckoutStatus {
  return {
    path,
    repositoryFullName: "dzackgarza/github-dashboard",
    remoteName: "origin",
    remoteUrl: "git@github.com:dzackgarza/github-dashboard.git",
    branch: "draft/mvp-dashboard-control-plane",
    headSha: "0123456789abcdef0123456789abcdef01234567",
    dirty: false,
    dirtyFiles: [],
    untracked: false,
    untrackedFiles: [],
    ahead: 0,
    behind: 0,
    detached: false,
    orphaned: false,
    worktree: false,
    gitDir: join(path, ".git"),
    gitCommonDir: join(path, ".git"),
    unpushedCommits: [],
  };
}

function doctorPayload(root: string, globalStatus: string, installationState: string) {
  return {
    schema_version: 1,
    tool_version: "0.0.0",
    target: {
      root,
      remote: "git@github.com:dzackgarza/github-dashboard.git",
      head: "0123456789abcdef0123456789abcdef01234567",
    },
    declaration: {
      path: join(root, ".ai-review-ci.toml"),
      sha256: "a".repeat(64),
      manifest: {
        schema_version: 1,
        profile: "bun-playwright",
        installed_ref: "main",
        release_channel: "main",
        workflow_template_version: 1,
        local_delegation: "global-justfile",
        default_branch: "main",
        exceptions: [],
      },
    },
    declaration_hash: "a".repeat(64),
    declared_profile: "bun-playwright",
    effective_profile: "bun-playwright",
    workflow_refs: {
      "review-pr.yml": {
        path: join(root, ".github/workflows/review-pr.yml"),
        required_ref: "main",
        observed_ref: "main",
        required_gates: ["qc-doctor"],
        observed_gates: ["qc-doctor"],
      },
    },
    justfile_delegation: {
      test: {
        required_justfile: "bun-playwright.just",
        observed: {
          present: true,
          command: "just -f ~/ai-review-ci/justfiles/bun-playwright.just -d . test",
          delegates_to_global_qc: true,
          caller_root_preserved: true,
        },
      },
    },
    branch_protection: {
      required_contexts: ["qc-doctor / qc-doctor"],
      observed_contexts: [],
      observed_state: "not_applicable",
      evidence: "target repository has no origin remote",
    },
    profile_proof_requirements: {
      "bun-playwright": {
        profile: "bun-playwright",
        required_paths: ["package.json", "playwright.config.ts"],
        missing_paths: [],
      },
    },
    findings: globalStatus === "current" ? [] : [
      {
        severity: "warning",
        surface: "workflow_ref",
        evidence: "review-pr.yml uses main; manifest requires release/v1",
        remediation_commands: ["edit review-pr.yml to the required ref"],
      },
    ],
    invalidation_inputs: [
      "target_head:0123456789abcdef0123456789abcdef01234567",
      `manifest_sha256:${"a".repeat(64)}`,
    ],
    installation_state: installationState,
    global_status: globalStatus,
    exceptions: [],
  };
}

function checkRun(payload: unknown): CheckRunOutput {
  return {
    name: "qc-doctor",
    status: "completed",
    conclusion: "success",
    output: {
      text: `\`\`\`ai-review-ci-doctor-json\n${JSON.stringify(payload)}\n\`\`\``,
    },
  };
}

function writeDoctorScript(root: string, body: string): LocalDoctorCommand {
  const script = join(root, "doctor-script.cjs");
  writeFileSync(script, body);
  return {
    command: process.execPath,
    baseArgs: [script],
  };
}

describe("buildLocalDoctorCommand", () => {
  it("uses the explicit uvx ai-review-ci doctor argv contract", () => {
    const root = tempPath("argv-contract");
    const invocation = buildLocalDoctorCommand(checkout(root));

    expect(invocation.command).toBe("uvx");
    expect(invocation.args).toEqual([
      "--python",
      "3.14",
      "--from",
      "git+https://github.com/dzackgarza/ai-review-ci",
      "ai-review-ci",
      "doctor",
      "--target",
      root,
      "--json",
    ]);
  });
});

describe("resolveQCHealthForProjection", () => {
  it("prefers local doctor output for a matched checkout and exercises target argv in a real subprocess", () => {
    const root = tempPath("local-doctor");
    mkdirSync(join(root, ".git"));
    const argvPath = join(root, "argv.json");
    const localPayload = doctorPayload(root, "current", "compliant");
    const staleCheckPayload = doctorPayload(root, "stale", "outdated");
    const command = writeDoctorScript(root, `
const fs = require("node:fs");
const payload = ${JSON.stringify(JSON.stringify(localPayload))};
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argvPath)}, JSON.stringify(args));
const targetIndex = args.indexOf("--target");
if (targetIndex < 0 || args[targetIndex + 1] !== ${JSON.stringify(root)} || !args.includes("--json")) {
  process.stderr.write("bad doctor argv");
  process.exit(64);
}
process.stdout.write(payload);
`);

    const qc = resolveQCHealthForProjection(
      "dzackgarza/github-dashboard",
      checkout(root),
      [checkRun(staleCheckPayload)],
      spawnCommandRunner,
      command
    );

    expect(qc.source).toBe("local_doctor");
    expect(qc.global_status).toBe("current");
    expect(qc.payload?.target.root).toBe(root);
    expect(JSON.parse(readFileSync(argvPath, "utf8"))).toEqual(["--target", root, "--json"]);
  });

  it("surfaces an unparseable local doctor result as unverifiable instead of using the check-run payload", () => {
    const root = tempPath("local-doctor-failure");
    const currentCheckPayload = doctorPayload(root, "current", "compliant");
    const command = writeDoctorScript(root, `
process.stdout.write("not json");
process.stderr.write("doctor failed hard for ${root}");
process.exit(17);
`);

    const qc = resolveQCHealthForProjection(
      "dzackgarza/github-dashboard",
      checkout(root),
      [checkRun(currentCheckPayload)],
      spawnCommandRunner,
      command
    );

    expect(qc.source).toBe("local_doctor");
    expect(qc.global_status).toBe("unverifiable");
    expect(qc.findings[0].surface).toBe("doctor_command");
    expect(qc.findings[0].evidence).toContain("doctor failed hard");
    expect(qc.payload).toBeUndefined();
  });

  it("uses qc-doctor check output when no local checkout is matched", () => {
    const root = tempPath("check-only");
    const payload = doctorPayload(root, "stale", "outdated");

    const qc = resolveQCHealthForProjection(
      "dzackgarza/github-dashboard",
      null,
      [checkRun(payload)],
      spawnCommandRunner
    );

    expect(qc.source).toBe("qc_doctor_check");
    expect(qc.global_status).toBe("stale");
    expect(qc.payload?.installation_state).toBe("outdated");
  });
});
