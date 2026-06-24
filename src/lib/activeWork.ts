import { QCDoctorGlobalStatus } from "./qcDoctor";

export type ResumeClassification =
  | "ready"
  | "active"
  | "needs_local_reconciliation"
  | "blocked_by_issue_or_pr"
  | "waiting_for_ci_or_review"
  | "ready_for_final_audit";

export interface ClosingIssueReference {
  owner: string;
  repo: string;
  number: number;
}

export interface ReviewThreadNode {
  isResolved: boolean;
}

export interface ResumePacketClassificationInput {
  issueState: "open" | "closed" | null;
  prState: "open" | "closed" | null;
  prDraft: boolean;
  checkState: "success" | "failure" | "pending" | "unknown";
  unresolvedReviewThreads: number;
  local: {
    exists: boolean;
    dirty: boolean;
    untracked: boolean;
    ahead: number;
    behind: number;
    detached: boolean;
    orphaned: boolean;
    unpushedCommitCount: number;
  };
  qcGlobalStatus: QCDoctorGlobalStatus | null;
}

const CLOSING_KEYWORD_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b/i;
const ISSUE_TARGET_PATTERN =
  /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/(\d+)|([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)|#(\d+)/g;

export function extractClosingIssueReferences(body: string, defaultFullName: string): ClosingIssueReference[] {
  const [defaultOwner, defaultRepo] = defaultFullName.split("/");
  if (!defaultOwner || !defaultRepo) {
    throw new Error(`Default repository name must be owner/repo, got ${defaultFullName}`);
  }

  const references = new Map<string, ClosingIssueReference>();
  for (const line of body.split(/\r?\n/)) {
    const keywordMatch = line.match(CLOSING_KEYWORD_PATTERN);
    if (!keywordMatch || keywordMatch.index === undefined) {
      continue;
    }

    const closingClause = line.slice(keywordMatch.index);
    for (const match of closingClause.matchAll(ISSUE_TARGET_PATTERN)) {
      const owner = match[1] ?? match[4] ?? defaultOwner;
      const repo = match[2] ?? match[5] ?? defaultRepo;
      const numberText = match[3] ?? match[6] ?? match[7];
      const number = Number.parseInt(numberText, 10);
      if (!Number.isInteger(number) || number <= 0) {
        continue;
      }

      const key = `${owner}/${repo}#${number}`;
      references.set(key, { owner, repo, number });
    }
  }

  return Array.from(references.values());
}

export function countUnresolvedReviewThreads(threads: ReviewThreadNode[]): number {
  return threads.filter((thread) => !thread.isResolved).length;
}

function needsLocalReconciliation(local: ResumePacketClassificationInput["local"]): boolean {
  return (
    !local.exists ||
    local.dirty ||
    local.untracked ||
    local.ahead > 0 ||
    local.behind > 0 ||
    local.detached ||
    local.orphaned ||
    local.unpushedCommitCount > 0
  );
}

export function classifyResumePacket(input: ResumePacketClassificationInput): ResumeClassification {
  if (input.issueState === "closed" || input.prState === "closed") {
    return "blocked_by_issue_or_pr";
  }

  if (needsLocalReconciliation(input.local)) {
    return "needs_local_reconciliation";
  }

  if (
    input.checkState === "failure" ||
    input.checkState === "pending" ||
    input.unresolvedReviewThreads > 0
  ) {
    return "waiting_for_ci_or_review";
  }

  if (input.qcGlobalStatus !== "current" && input.qcGlobalStatus !== "intentional_exception") {
    return "blocked_by_issue_or_pr";
  }

  if (input.prState === "open" && !input.prDraft && input.checkState === "success") {
    return "ready_for_final_audit";
  }

  if (input.prState === "open") {
    return "active";
  }

  return "ready";
}
