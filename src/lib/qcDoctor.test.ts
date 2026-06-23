import { describe, expect, it } from "vitest";
import { parseQCDoctorPayload, QC_DOCTOR_GLOBAL_STATUSES } from "./qcDoctor";

const goldenDoctorPayload = {
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
  installation_state: "installed",
  global_status: "stale",
  findings: [
    {
      severity: "error",
      surface: "workflow",
      evidence: "review-general workflow template ref does not match the required ai-review-ci release.",
      remediation_commands: [
        "uvx --python 3.14 --from git+https://github.com/dzackgarza/ai-review-ci ai-review-ci install",
      ],
    },
  ],
  invalidation_inputs: {
    manifest_sha256: "a".repeat(64),
    workflow_sha256: "b".repeat(64),
  },
};

describe("parseQCDoctorPayload", () => {
  it("accepts the PR #113 golden doctor contract and preserves global_status as authoritative data", () => {
    const parsed = parseQCDoctorPayload(goldenDoctorPayload);

    expect(parsed.global_status).toBe("stale");
    expect(parsed.findings[0].surface).toBe("workflow");
    expect(parsed.findings[0].remediation_commands[0]).toContain("ai-review-ci install");
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

  it("fails loudly when schema drift removes required fields or adds an unknown status", () => {
    expect(() => parseQCDoctorPayload({
      ...goldenDoctorPayload,
      global_status: "outdated",
    })).toThrow(/Unsupported ai-review-ci doctor global_status/);

    const missingFindings = { ...goldenDoctorPayload };
    delete (missingFindings as { findings?: unknown }).findings;

    expect(() => parseQCDoctorPayload(missingFindings)).toThrow(/findings/);
  });
});
