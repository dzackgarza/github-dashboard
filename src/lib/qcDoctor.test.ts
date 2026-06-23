import { describe, expect, it } from "vitest";
import {
  parseQCDoctorPayload,
  parseQCDoctorPayloadFromText,
  QC_DOCTOR_GLOBAL_STATUSES,
  QC_DOCTOR_INSTALLATION_STATES,
} from "./qcDoctor";

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
  installation_state: "outdated",
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
    expect(parsed.installation_state).toBe("outdated");
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

  it("accepts every planned installation state without widening the schema", () => {
    for (const installationState of QC_DOCTOR_INSTALLATION_STATES) {
      const parsed = parseQCDoctorPayload({
        ...goldenDoctorPayload,
        installation_state: installationState,
      });

      expect(parsed.installation_state).toBe(installationState);
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

  it("fails loudly when schema drift introduces an unknown installation state", () => {
    expect(() => parseQCDoctorPayload({
      ...goldenDoctorPayload,
      installation_state: "installed",
    })).toThrow(/Unsupported ai-review-ci doctor installation_state/);
  });
});

describe("parseQCDoctorPayloadFromText", () => {
  it("accepts raw JSON for local doctor output", () => {
    const parsed = parseQCDoctorPayloadFromText(JSON.stringify(goldenDoctorPayload));

    expect(parsed.repository.full_name).toBe("dzackgarza/github-dashboard");
  });

  it("accepts only the explicit ai-review-ci doctor check-run fence", () => {
    const parsed = parseQCDoctorPayloadFromText(`doctor payload\n\n\`\`\`ai-review-ci-doctor-json\n${JSON.stringify(goldenDoctorPayload)}\n\`\`\``);

    expect(parsed.tool.name).toBe("ai-review-ci");
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
