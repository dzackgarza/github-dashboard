export interface User {
  login: string;
  avatar_url: string;
  html_url?: string;
  name?: string;
}

export interface Label {
  name: string;
  color: string;
}

export interface Comment {
  id: string | number;
  user: User;
  body: string;
  created_at: string;
}

export interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  private: boolean;
  stargazers_count: number;
  language: string;
  owner: User;
  updated_at: string;
  open_issues_count?: number;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  html_url: string;
  user: User;
  created_at: string;
  updated_at: string;
  comments?: number | Comment[];
  labels: Label[];
}

export interface DiffFile {
  file: string;
  status: string;
  additions: number;
  deletions: number;
  code: string;
}

export interface CIRun {
  name: string;
  status: string;
  elapsed: string;
  conclusion?: string;
  logs?: string;
}

export interface CIStatus {
  state: "success" | "failure" | "pending";
  runs: CIRun[];
  unresolved_threads_count: number;
  security_alerts_count: number;
}

export type QCDoctorGlobalStatus =
  | "current"
  | "stale"
  | "misconfigured"
  | "blocked_upstream"
  | "unverifiable"
  | "intentional_exception";

export interface QCDoctorFinding {
  severity: string;
  surface: string;
  evidence: string;
  remediation_commands: string[];
}

export interface QCHealth {
  global_status: QCDoctorGlobalStatus;
  source: "local_doctor" | "qc_doctor_check" | "unavailable";
  source_detail: string;
  findings: QCDoctorFinding[];
  error?: string;
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
  unpushedCommits: { sha: string; subject: string }[];
}

export interface LocalCheckoutInventory {
  scanRoots: string[];
  checkouts: LocalCheckoutStatus[];
  rootErrors: { path: string; kind: string; message: string }[];
}

export type ResumeClassification =
  | "ready"
  | "active"
  | "needs_local_reconciliation"
  | "blocked_by_issue_or_pr"
  | "waiting_for_ci_or_review"
  | "ready_for_final_audit";

export interface ActiveWorkIssue {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  url: string;
}

export interface ActiveWorkPullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  isDraft: boolean;
  state: "OPEN" | "CLOSED" | "MERGED";
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  createdAt: string;
  updatedAt: string;
  closingIssues: ActiveWorkIssue[];
  checkState: "success" | "failure" | "pending" | "unknown";
  unresolvedReviewThreads: number;
  reviewThreadsTruncated: boolean;
  qc: QCHealth;
}

export interface ResumePacket {
  repository: string;
  issue: ActiveWorkIssue | null;
  pullRequest: {
    number: number;
    title: string;
    url: string;
    state: "OPEN" | "CLOSED" | "MERGED";
    draft: boolean;
    headRefName: string;
    headSha: string;
    baseRefName: string;
  };
  local: LocalCheckoutStatus | null;
  qc: QCHealth;
  checkState: "success" | "failure" | "pending" | "unknown";
  unresolvedReviewThreads: number;
  reviewThreadsTruncated: boolean;
  classification: ResumeClassification;
}

export interface ActiveWorkProjection {
  repository: string;
  local: {
    checkout: LocalCheckoutStatus | null;
    scanRoots: string[];
    rootErrors: { path: string; kind: string; message: string }[];
    configError: { kind: string; message: string } | null;
  };
  qc: QCHealth;
  activeWork: {
    issues: ActiveWorkIssue[];
    pullRequests: ActiveWorkPullRequest[];
  };
  resumePackets: ResumePacket[];
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  html_url: string;
  user: User;
  created_at: string;
  updated_at: string;
  comments?: number | Comment[];
  labels: Label[];
  diff?: DiffFile[];
  ci_status?: CIStatus;
  is_draft?: boolean;
  closing_issues?: ActiveWorkIssue[];
  review_threads_truncated?: boolean;
  qc_health?: QCHealth;
  base_branch?: string;
  head_branch?: string;
}

export interface ProjectTag {
  id: string;
  name: string;
  color: string;
  repos: string[];
}

export interface SyncLog {
  id: string;
  timestamp: string;
  repo: string;
  type: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "304_HIT";
  message: string;
  rateLimitRemaining: number;
}

export interface RateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

export interface Tab {
  id: string; // e.g. "issue-facebook/react-101" or "pr-vitejs/vite-350" or "welcome" or "settings"
  type: "welcome" | "issue" | "pr" | "settings";
  title: string;
  repoOwner?: string;
  repoName?: string;
  number?: number;
}
