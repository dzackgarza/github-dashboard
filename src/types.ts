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
  latest_commit_at: string | null;
  topics: string[];
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

export interface SecurityAlerts {
  dependabotOpen: number;
  codeScanningOpen: number;
  secretScanningOpen: number;
  totalOpen: number;
}

export interface CIStatus {
  state: "success" | "failure" | "pending";
  runs: CIRun[];
  unresolved_threads_count: number;
  security_alerts: SecurityAlerts;
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
