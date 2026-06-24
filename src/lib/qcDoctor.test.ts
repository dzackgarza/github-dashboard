import { describe, expect, it } from "vitest";
import {
  parseQCDoctorPayload,
  parseQCDoctorPayloadFromText,
  QC_DOCTOR_GLOBAL_STATUSES,
  QC_DOCTOR_INSTALLATION_STATES,
} from "./qcDoctor";

const goldenDoctorPayload = {
  schema_version: 1,
  tool_version: "0.0.0",
  target: {
    root: "/tmp/github-dashboard-mvp-pr",
    remote: "git@github.com:dzackgarza/github-dashboard.git",
    head: "0123456789abcdef0123456789abcdef01234567",
  },
  declaration: {
    path: "/tmp/github-dashboard-mvp-pr/.ai-review-ci.toml",
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
      path: "/tmp/github-dashboard-mvp-pr/.github/workflows/review-pr.yml",
      required_ref: "release/v1",
      observed_ref: "main",
      required_gates: ["deterministic-diff", "delegation-conformance", "qc-doctor"],
      observed_gates: ["deterministic-diff", "delegation-conformance", "qc-doctor"],
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
  findings: [
    {
      severity: "warning",
      surface: "workflow_ref",
      evidence: "review-pr.yml uses main; manifest requires release/v1",
      remediation_commands: [
        "edit review-pr.yml to use dzackgarza/ai-review-ci reusable workflows at @release/v1",
      ],
    },
  ],
  invalidation_inputs: [
    "target_head:0123456789abcdef0123456789abcdef01234567",
    `manifest_sha256:${"a".repeat(64)}`,
  ],
  installation_state: "outdated",
  global_status: "stale",
  exceptions: [],
};

const oldSchemaPayload = {
  schema_version: 1,
  tool: {
    name: "ai-review-ci",
    version: "0.0.0",
    ref: "pull/113/head",
  },
  repository: {
    root: "/tmp/github-dashboard-mvp-pr",
    remote: "git@github.com:dzackgarza/github-dashboard.git",
    full_name: "dzackgarza/github-dashboard",
  },
  declared_profile: "bun-playwright",
  effective_profile: "bun-playwright",
  installation_state: "outdated",
  global_status: "stale",
  findings: [],
  invalidation_inputs: {
    manifest_sha256: "a".repeat(64),
  },
};

describe("parseQCDoctorPayload", () => {
  it("accepts the PR #113 doctor contract and preserves global_status as authoritative data", () => {
    const parsed = parseQCDoctorPayload(goldenDoctorPayload);

    expect(parsed.global_status).toBe("stale");
    expect(parsed.installation_state).toBe("outdated");
    expect(parsed.target.remote).toBe("git@github.com:dzackgarza/github-dashboard.git");
    expect(parsed.findings[0].surface).toBe("workflow_ref");
    expect(parsed.workflow_refs["review-pr.yml"].required_ref).toBe("release/v1");
  });

  it("accepts every dashboard-recognized doctor status without remapping it", () => {
    for (const status of QC_DOCTOR_GLOBAL_STATUSES) {
      const parsed = parseQCDoctorPayload({
        ...goldenDoctorPayload,
        global_status: status,
      });

      expect(parsed.global_status).toBe(status);
    }
  });

  it("accepts every planned installation state without widening the schema", () => {
    for (const installationState of QC_DOCTOR_INSTALLATION_STATES) {
      const parsed = parseQCDoctorPayload({
        ...goldenDoctorPayload,
        installation_state: installationState,
      });

      expect(parsed.installation_state).toBe(installationState);
    }
  });

  it("rejects stale dashboard-owned doctor schema shapes", () => {
    expect(() => parseQCDoctorPayload(oldSchemaPayload)).toThrow(/schema drift/);
  });

  it("fails loudly when schema drift removes required fields or adds unknown enum values", () => {
    const missingFindings = { ...goldenDoctorPayload };
    delete (missingFindings as { findings?: unknown }).findings;

    expect(() => parseQCDoctorPayload(missingFindings)).toThrow(/schema drift/);
    expect(() => parseQCDoctorPayload({
      ...goldenDoctorPayload,
      global_status: "outdated",
    })).toThrow(/Unsupported ai-review-ci doctor global_status/);
    expect(() => parseQCDoctorPayload({
      ...goldenDoctorPayload,
      installation_state: "installed",
    })).toThrow(/Unsupported ai-review-ci doctor installation_state/);
  });
});

describe("parseQCDoctorPayloadFromText", () => {
  it("accepts raw JSON for local doctor output", () => {
    const parsed = parseQCDoctorPayloadFromText(JSON.stringify(goldenDoctorPayload));

    expect(parsed.target.root).toBe("/tmp/github-dashboard-mvp-pr");
    expect(parsed.target.remote).toBe("git@github.com:dzackgarza/github-dashboard.git");
  });

  it("accepts only the explicit ai-review-ci doctor check-run fence", () => {
    const parsed = parseQCDoctorPayloadFromText(`doctor payload\n\n\`\`\`ai-review-ci-doctor-json\n${JSON.stringify(goldenDoctorPayload)}\n\`\`\``);

    expect(parsed.tool_version).toBe("0.0.0");
  });

  it("rejects incidental JSON in prose or generic JSON fences", () => {
    const payloadJson = JSON.stringify(goldenDoctorPayload);

    expect(() => parseQCDoctorPayloadFromText(`summary before ${payloadJson} summary after`)).toThrow(
      /raw JSON or a fenced ai-review-ci-doctor-json block/
    );
    expect(() => parseQCDoctorPayloadFromText(`\`\`\`json\n${payloadJson}\n\`\`\``)).toThrow(
      /raw JSON or a fenced ai-review-ci-doctor-json block/
    );
  });
});
