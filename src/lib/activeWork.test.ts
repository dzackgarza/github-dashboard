import { describe, expect, it } from "vitest";
import {
  classifyResumePacket,
  extractClosingIssueReferences,
  countUnresolvedReviewThreads,
} from "./activeWork";

describe("extractClosingIssueReferences", () => {
  it("extracts closing keyword issue links from shorthand, qualified, and GitHub URL forms", () => {
    const links = extractClosingIssueReferences(`
      Implements the MVP surface.

      Closes #15
      fixes dzackgarza/github-dashboard#16
      Resolves https://github.com/dzackgarza/github-dashboard/issues/17
      Related to #99
    `, "dzackgarza/github-dashboard");

    expect(links).toEqual([
      { owner: "dzackgarza", repo: "github-dashboard", number: 15 },
      { owner: "dzackgarza", repo: "github-dashboard", number: 16 },
      { owner: "dzackgarza", repo: "github-dashboard", number: 17 },
    ]);
  });
});

describe("countUnresolvedReviewThreads", () => {
  it("counts unresolved GitHub review threads from GraphQL reviewThreads nodes", () => {
    expect(countUnresolvedReviewThreads([
      { isResolved: false },
      { isResolved: true },
      { isResolved: false },
    ])).toBe(2);
  });
});

describe("classifyResumePacket", () => {
  const basePacket = {
    issueState: "open" as const,
    prState: "open" as const,
    prDraft: true,
    checkState: "success" as const,
    unresolvedReviewThreads: 0,
    local: {
      exists: true,
      dirty: false,
      untracked: false,
      ahead: 0,
      behind: 0,
      detached: false,
      orphaned: false,
      unpushedCommitCount: 0,
    },
    qcGlobalStatus: "current" as const,
  };

  it("classifies local divergence before claiming audit readiness", () => {
    expect(classifyResumePacket({
      ...basePacket,
      prDraft: false,
      local: { ...basePacket.local, dirty: true },
    })).toBe("needs_local_reconciliation");
  });

  it("classifies unresolved review threads and pending checks as waiting on GitHub convergence", () => {
    expect(classifyResumePacket({
      ...basePacket,
      prDraft: false,
      unresolvedReviewThreads: 1,
    })).toBe("waiting_for_ci_or_review");

    expect(classifyResumePacket({
      ...basePacket,
      prDraft: false,
      checkState: "pending",
    })).toBe("waiting_for_ci_or_review");
  });

  it("classifies a clean non-draft PR with current QC and converged checks as ready for final audit", () => {
    expect(classifyResumePacket({
      ...basePacket,
      prDraft: false,
    })).toBe("ready_for_final_audit");
  });

  it("does not call stale or unverifiable QC ready for final audit", () => {
    expect(classifyResumePacket({
      ...basePacket,
      prDraft: false,
      qcGlobalStatus: "stale",
    })).toBe("blocked_by_issue_or_pr");
  });
});
