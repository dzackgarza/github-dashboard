import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Search,
  FolderGit2,
  GitPullRequest,
  AlertCircle,
  Clock,
  CircleDot,
  RefreshCw,
  GitBranch,
  X,
  Layers,
  Inbox,
  ShieldCheck,
  HardDrive,
  GitCommit,
  Link2,
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import { ActiveWorkProjection, Repo, Issue, PullRequest, ProjectTag, ResumePacket, Label } from "../types";
import { useWorkspace } from "../context/WorkspaceContext";
import { toMarkdownExcerpt } from "../utils/markdownExcerpt";
import { invariant } from "../utils/invariant";
import {
  LabelFilterSelect,
  ProjectAssignmentDialog,
  ProjectCard,
  ProjectPill,
  RepoCard,
  WorkspaceBreadcrumbs
} from "./WorkspacePrimitives";

export interface RepositoryExplorerPanelParams {
  explorerMode?: "repositories" | "projects" | "repo" | "project";
  repoFullName?: string;
  projectId?: string;
}

interface RepositoryExplorerProps {
  panelParams?: RepositoryExplorerPanelParams;
}

export default function RepositoryExplorer({ panelParams }: RepositoryExplorerProps) {
  type BranchSummary = { name: string; commit: { sha: string; date: string } };
  type RepoIssueRow = Issue & { repoFullName: string; repoName: string; owner: string; name: string };
  type RepoPrRow = PullRequest & { repoFullName: string; repoName: string; owner: string; name: string };

  const {
    repos,
    projectTags,
    isSyncing,
    onAddProjectTag,
    onCreateProjectWithRepo,
    onRemoveRepoFromTag,
    onDeleteProjectTag,
    openTabs,
    activeRepoFullName,
    activeProjectDashboardId,
    openRepo,
    openProject,
    openRepositoryExplorer,
    openProjectsDashboard,
    selectedProjectFilter,
    setSelectedProjectFilter
  } = useWorkspace();

  const panelMode = panelParams?.explorerMode ?? "repositories";
  const selectedRepoFullName = panelMode === "repo" ? panelParams?.repoFullName : activeRepoFullName;
  const selectedProjectId = panelMode === "project" ? panelParams?.projectId : activeProjectDashboardId;
  const showProjectsOverview = panelMode === "projects";
  const selectedRepo = selectedRepoFullName ? repos.find((repo) => repo.full_name === selectedRepoFullName) : null;
  if (selectedRepoFullName) {
    invariant(selectedRepo, `Repository ${selectedRepoFullName} was not found.`);
  }
  const activeProjectDashboard = useMemo(
    () => selectedProjectId
      ? projectTags.find((project) => project.id === selectedProjectId) ?? null
      : null,
    [selectedProjectId, projectTags]
  );
  if (selectedProjectId) {
    invariant(activeProjectDashboard, `Project ${selectedProjectId} was not found.`);
  }
  const activeProjectRepos = useMemo(
    () => activeProjectDashboard
      ? repos.filter((repo) => activeProjectDashboard.repos.includes(repo.full_name))
      : [],
    [activeProjectDashboard, repos]
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [dashIssues, setDashIssues] = useState<Issue[]>([]);
  const [dashPRs, setDashPRs] = useState<PullRequest[]>([]);
  const [activeWork, setActiveWork] = useState<ActiveWorkProjection | null>(null);
  const [activeWorkError, setActiveWorkError] = useState<string | null>(null);
  const [dashView, setDashView] = useState<"overview" | "control">("overview");
  const [projectIssues, setProjectIssues] = useState<RepoIssueRow[]>([]);
  const [projectPRs, setProjectPRs] = useState<RepoPrRow[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [repoIssuesLabel, setRepoIssuesLabel] = useState("all");
  const [repoPrsLabel, setRepoPrsLabel] = useState("all");
  const [projectIssuesLabel, setProjectIssuesLabel] = useState("all");
  const [projectPrsLabel, setProjectPrsLabel] = useState("all");
  const [assignmentTarget, setAssignmentTarget] = useState<
    { type: "repo"; repo: Repo } | { type: "project"; project: ProjectTag } | null
  >(null);
  const [contextRepo, setContextRepo] = useState<Repo | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const contextPopupRef = useRef<HTMLDivElement | null>(null);
  const [contextPopupPos, setContextPopupPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const closeMenu = () => {
      setContextRepo(null);
      setContextPos(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  // Clamp the right-click card popup into the viewport after it renders at the cursor.
  useLayoutEffect(() => {
    if (!contextRepo || !contextPos) {
      setContextPopupPos(null);
      return;
    }
    const node = contextPopupRef.current;
    if (!node) {
      return;
    }
    const margin = 8;
    const left = Math.max(margin, Math.min(contextPos.x, window.innerWidth - node.offsetWidth - margin));
    const top = Math.max(margin, Math.min(contextPos.y, window.innerHeight - node.offsetHeight - margin));
    setContextPopupPos({ left, top });
  }, [contextRepo, contextPos]);

  useEffect(() => {
    if (!selectedRepo) {
      setDashIssues([]);
      setDashPRs([]);
      setBranches([]);
      setActiveWork(null);
      setActiveWorkError(null);
      setLoadingDashboard(false);
      return;
    }

    let cancelled = false;
    setLoadingDashboard(true);
    setDashView("overview");
    setRepoIssuesLabel("all");
    setRepoPrsLabel("all");

    void (async () => {
      const [issues, prs, nextBranches] = await Promise.all([
        loadArray<Issue>(`/api/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/issues`, "Repository issues must be an array."),
        loadArray<PullRequest>(`/api/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/prs`, "Repository PRs must be an array."),
        loadArray<BranchSummary>(`/api/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/branches`, "Repository branches must be an array.")
      ]);
      if (!cancelled) {
        setDashIssues(issues);
        setDashPRs(prs);
        setBranches(nextBranches);
        setLoadingDashboard(false);
      }
    })();

    void (async () => {
      try {
        const response = await fetch(`/api/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/active-work`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Active-work projection failed.");
        }
        if (!cancelled) {
          setActiveWork(payload as ActiveWorkProjection);
          setActiveWorkError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setActiveWork(null);
          setActiveWorkError(err instanceof Error ? err.message : "Error loading active-work projection.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRepo]);

  useEffect(() => {
    if (!activeProjectDashboard) {
      setProjectIssues([]);
      setProjectPRs([]);
      return;
    }

    let cancelled = false;
    setProjectIssuesLabel("all");
    setProjectPrsLabel("all");

    void (async () => {
      const issueBatches = await Promise.all(activeProjectRepos.map(async (repo) => {
        const issues = await loadArray<Issue>(`/api/github/repos/${repo.owner.login}/${repo.name}/issues`, `Project issues for ${repo.full_name} must be an array.`);
        return issues.map((issue): RepoIssueRow => ({
          ...issue,
          repoFullName: repo.full_name,
          repoName: repo.name,
          owner: repo.owner.login,
          name: repo.name
        }));
      }));
      const prBatches = await Promise.all(activeProjectRepos.map(async (repo) => {
        const prs = await loadArray<PullRequest>(`/api/github/repos/${repo.owner.login}/${repo.name}/prs`, `Project PRs for ${repo.full_name} must be an array.`);
        return prs.map((pr): RepoPrRow => ({
          ...pr,
          repoFullName: repo.full_name,
          repoName: repo.name,
          owner: repo.owner.login,
          name: repo.name
        }));
      }));
      if (!cancelled) {
        setProjectIssues(issueBatches.flat());
        setProjectPRs(prBatches.flat());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeProjectDashboard, activeProjectRepos]);

  const filteredRepos = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return repos.filter((repo) => {
      const matchesQuery = normalizedQuery.length === 0 ||
        repo.full_name.toLowerCase().includes(normalizedQuery) ||
        (repo.description || "").toLowerCase().includes(normalizedQuery);
      const matchesProject = selectedProjectFilter === "all" ||
        projectTags.find((project) => project.id === selectedProjectFilter)?.repos.includes(repo.full_name) === true;
      return matchesQuery && matchesProject;
    });
  }, [repos, searchQuery, selectedProjectFilter, projectTags]);

  const sortedRepos = useMemo(() => {
    return [...filteredRepos].sort((a, b) => {
      const latestB = b.latest_commit_at === null ? Number.NEGATIVE_INFINITY : new Date(b.latest_commit_at).getTime();
      const latestA = a.latest_commit_at === null ? Number.NEGATIVE_INFINITY : new Date(a.latest_commit_at).getTime();
      return latestB - latestA || a.full_name.localeCompare(b.full_name);
    });
  }, [filteredRepos]);

  const repoIssues = filterItemsByLabel(dashIssues, repoIssuesLabel);
  const repoPRs = filterItemsByLabel(dashPRs, repoPrsLabel);
  const filteredProjectIssues = filterItemsByLabel(projectIssues, projectIssuesLabel);
  const filteredProjectPRs = filterItemsByLabel(projectPRs, projectPrsLabel);
  const repoIssueLabels = collectLabels(dashIssues);
  const repoPrLabels = collectLabels(dashPRs);
  const projectIssueLabels = collectLabels(projectIssues);
  const projectPrLabels = collectLabels(projectPRs);

  const getMappedProjectsForRepo = (fullName: string) => projectTags.filter((project) => project.repos.includes(fullName));
  const openIssue = (repo: Repo, issue: Issue) => {
    openTabs(`issue-${repo.full_name}-${issue.number}`, "issue", `Issue #${issue.number}`, repo.owner.login, repo.name, issue.number);
  };
  const openPR = (repo: Repo, pr: PullRequest) => {
    openTabs(`pr-${repo.full_name}-${pr.number}`, "pr", `PR #${pr.number}`, repo.owner.login, repo.name, pr.number);
  };
  const openProjectIssue = (issue: RepoIssueRow) => {
    openTabs(`issue-${issue.repoFullName}-${issue.number}`, "issue", `Issue #${issue.number}`, issue.owner, issue.name, issue.number);
  };
  const openProjectPR = (pr: RepoPrRow) => {
    openTabs(`pr-${pr.repoFullName}-${pr.number}`, "pr", `PR #${pr.number}`, pr.owner, pr.name, pr.number);
  };

  const breadcrumbs = selectedRepo
    ? [
        { label: "Repositories", onClick: openRepositoryExplorer },
        { label: selectedRepo.full_name }
      ]
    : activeProjectDashboard
      ? [
          { label: "Projects", onClick: openProjectsDashboard },
          { label: activeProjectDashboard.name }
        ]
      : showProjectsOverview
        ? [{ label: "Projects" }]
        : [{ label: "Repositories" }];

  const selectedCheckout = activeWork?.local.checkout ?? null;
  const selectedQC = activeWork?.qc ?? null;

  const formatShortSha = (sha?: string | null) => sha ? sha.slice(0, 8) : "no-head";

  const qcClassName = (status?: string) => {
    if (status === "current" || status === "intentional_exception") {
      return "text-emerald-300 bg-emerald-950/30 border-emerald-900";
    }
    if (status === "stale" || status === "unverifiable") {
      return "text-amber-300 bg-amber-950/30 border-amber-900";
    }
    return "text-red-300 bg-red-950/30 border-red-900";
  };

  const classificationClassName = (classification: ResumePacket["classification"]) => {
    if (classification === "ready_for_final_audit" || classification === "ready") {
      return "text-emerald-300 bg-emerald-950/30 border-emerald-900";
    }
    if (classification === "active") {
      return "text-blue-300 bg-blue-950/30 border-blue-900";
    }
    if (classification === "waiting_for_ci_or_review") {
      return "text-amber-300 bg-amber-950/30 border-amber-900";
    }
    return "text-red-300 bg-red-950/30 border-red-900";
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] flex flex-col min-h-0 relative select-none text-[#cccccc] font-sans">
      <div className="bg-[#252526] py-3 px-6 border-b border-[#3e3e3e] flex items-center justify-between shrink-0 select-none">
        <div className="flex flex-col gap-1 min-w-0">
          <WorkspaceBreadcrumbs items={breadcrumbs} />
          <div className="flex items-center gap-2">
            {showProjectsOverview || activeProjectDashboard ? <Layers className="text-[#007acc]" size={16} /> : <FolderGit2 className="text-[#007acc]" size={16} />}
            <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
              {selectedRepo ? selectedRepo.name : activeProjectDashboard ? "Project Dashboard" : showProjectsOverview ? "Projects" : "Repositories"}
            </h2>
          </div>
        </div>
      </div>

      {selectedRepo ? (
        <div className="flex-1 flex min-h-0 overflow-hidden bg-[#18181a]">
          <div className="w-80 border-r border-[#3e3e3e] bg-[#222224] p-5 flex flex-col justify-between overflow-y-auto select-none">
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded border border-[#3e3e3e] bg-[#1a1a1c] shadow-md shrink-0 flex items-center justify-center">
                  <FolderGit2 size={22} className="text-[#007acc]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm tracking-tight leading-snug break-all">{selectedRepo.name}</h3>
                  <p className="text-xs text-gray-500 font-mono break-all">{selectedRepo.full_name}</p>
                </div>
              </div>

              <div className="bg-[#1a1a1c] p-3 rounded border border-[#3e3e3e]/40 space-y-2.5 text-[11px] font-mono">
                <div className="flex justify-between border-b border-[#2a2a2c] pb-1.5 gap-3">
                  <span className="text-gray-500">Latest commit:</span>
                  <span className="text-gray-400">{formatDate(selectedRepo.latest_commit_at)}</span>
                </div>
                <div className="flex justify-between pt-0.5 gap-3">
                  <span className="text-gray-500">Last updated:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    {isSyncing[selectedRepo.full_name] ? (
                      <>
                        <RefreshCw size={9} className="animate-spin" />
                        Updating
                      </>
                    ) : (
                      formatRelativeTime(selectedRepo.latest_commit_at)
                    )}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 font-bold block">Local Resume</span>
                <div className="bg-[#1a1a1c] p-3 rounded border border-[#3e3e3e]/40 space-y-2 text-[11px] font-mono">
                  {activeWork?.local.configError ? (
                    <div className="flex items-start gap-2 text-amber-300">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span className="break-words">{activeWork.local.configError.message}</span>
                    </div>
                  ) : selectedCheckout ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500 flex items-center gap-1"><HardDrive size={11} /> Path:</span>
                        <span className="text-gray-300 break-all text-right">{selectedCheckout.path}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500 flex items-center gap-1"><GitBranch size={11} /> Branch:</span>
                        <span className="text-gray-300 text-right">{selectedCheckout.branch || "detached"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500 flex items-center gap-1"><GitCommit size={11} /> Head:</span>
                        <span className="text-amber-300 text-right">{formatShortSha(selectedCheckout.headSha)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {selectedCheckout.dirty && <span className="px-1.5 py-0.5 rounded border border-red-900 bg-red-950/30 text-red-300">dirty</span>}
                        {selectedCheckout.untracked && <span className="px-1.5 py-0.5 rounded border border-amber-900 bg-amber-950/30 text-amber-300">untracked</span>}
                        {selectedCheckout.ahead > 0 && <span className="px-1.5 py-0.5 rounded border border-blue-900 bg-blue-950/30 text-blue-300">ahead {selectedCheckout.ahead}</span>}
                        {selectedCheckout.behind > 0 && <span className="px-1.5 py-0.5 rounded border border-purple-900 bg-purple-950/30 text-purple-300">behind {selectedCheckout.behind}</span>}
                        {selectedCheckout.unpushedCommits.length > 0 && <span className="px-1.5 py-0.5 rounded border border-blue-900 bg-blue-950/30 text-blue-300">unpushed {selectedCheckout.unpushedCommits.length}</span>}
                        {selectedCheckout.detached && <span className="px-1.5 py-0.5 rounded border border-red-900 bg-red-950/30 text-red-300">detached</span>}
                        {selectedCheckout.orphaned && <span className="px-1.5 py-0.5 rounded border border-amber-900 bg-amber-950/30 text-amber-300">orphaned</span>}
                        {selectedCheckout.worktree && <span className="px-1.5 py-0.5 rounded border border-emerald-900 bg-emerald-950/30 text-emerald-300">worktree</span>}
                        {!selectedCheckout.dirty && !selectedCheckout.untracked && selectedCheckout.ahead === 0 && selectedCheckout.behind === 0 && selectedCheckout.unpushedCommits.length === 0 && !selectedCheckout.detached && !selectedCheckout.orphaned && (
                          <span className="px-1.5 py-0.5 rounded border border-emerald-900 bg-emerald-950/30 text-emerald-300">clean</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-500">
                      <HardDrive size={12} />
                      <span>No local checkout matched {selectedRepo.full_name}.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 font-bold block">QC Health</span>
                <div className="bg-[#1a1a1c] p-3 rounded border border-[#3e3e3e]/40 text-[11px] font-mono space-y-2">
                  {selectedQC ? (
                    <>
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border font-bold ${qcClassName(selectedQC.global_status)}`}>
                        <ShieldCheck size={12} />
                        <span>{selectedQC.global_status}</span>
                      </div>
                      <div className="text-gray-500 break-words">{selectedQC.source_detail}</div>
                    </>
                  ) : (
                    <div className="text-gray-500">QC doctor projection not loaded.</div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 font-bold">Description</span>
                <p className="text-xs text-gray-400 leading-normal bg-[#1a1a1c] p-3 rounded border border-[#3e3e3e]/40">
                  {selectedRepo.description || "No repository description."}
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 font-bold block">Assigned Projects</span>
                <div className="flex flex-wrap gap-1.5">
                  {getMappedProjectsForRepo(selectedRepo.full_name).length === 0 ? (
                    <span className="text-xs italic text-gray-500 font-mono">Not placed in any Project</span>
                  ) : (
                    getMappedProjectsForRepo(selectedRepo.full_name).map((project) => (
                      <ProjectPill key={project.id} project={project} onOpenProject={openProject} />
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAssignmentTarget({ type: "repo", repo: selectedRepo })}
                  className="w-full bg-[#094771] hover:bg-[#0e5f95] text-white text-xs rounded px-2 py-1.5 text-left font-mono"
                >
                  Manage projects
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1f]">
            <div className="h-10 border-b border-[#3e3e3e] bg-[#252526] flex items-stretch shrink-0 select-none">
              <button
                onClick={() => setDashView("overview")}
                className={`px-4 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors border-b-2 ${
                  dashView === "overview" ? "border-[#007acc] text-white" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <Layers size={13} className="text-[#007acc]" />
                <span>Overview</span>
              </button>
              <button
                onClick={() => setDashView("control")}
                className={`px-4 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors border-b-2 ${
                  dashView === "control" ? "border-[#007acc] text-white" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <ShieldCheck size={13} className="text-emerald-400" />
                <span>Control Plane ({activeWork?.resumePackets.length ?? 0})</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-7 select-text custom-scrollbar">
              {dashView === "overview" ? (
                <>
                  {loadingDashboard && (
                    <div className="flex items-center gap-2 rounded border border-[#3e3e3e]/70 bg-[#222224] px-3 py-2 text-xs text-gray-400 font-mono">
                      <RefreshCw className="animate-spin text-[#007acc]" size={14} />
                      <span>Loading repository dashboard...</span>
                    </div>
                  )}
                  {renderIssueSection({
                    title: `Issues (${repoIssues.length})`,
                    icon: <AlertCircle size={14} className="text-emerald-500" />,
                    labels: repoIssueLabels,
                    labelValue: repoIssuesLabel,
                    onLabelChange: setRepoIssuesLabel,
                    labelTestId: "repo-issues-label-filter",
                    rows: repoIssues,
                    emptyCopy: "No issues found.",
                    rowTestId: "repo-issue-row",
                    rowLabelTestId: "issue-row-label",
                    onOpen: (issue) => openIssue(selectedRepo, issue)
                  })}
                  {renderIssueSection({
                    title: `PRs (${repoPRs.length})`,
                    icon: <GitPullRequest size={14} className="text-purple-400" />,
                    labels: repoPrLabels,
                    labelValue: repoPrsLabel,
                    onLabelChange: setRepoPrsLabel,
                    labelTestId: "repo-prs-label-filter",
                    rows: repoPRs,
                    emptyCopy: "No PRs found.",
                    rowTestId: "repo-pr-row",
                    rowLabelTestId: "pr-row-label",
                    onOpen: (pr) => openPR(selectedRepo, pr)
                  })}

                  <section className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-[#3e3e3e] pb-2">
                      <GitBranch size={14} className="text-blue-400" />
                      <h3 className="text-xs font-mono font-bold text-white">Branches ({branches.length})</h3>
                    </div>
                    {branches.length === 0 ? (
                      <div className="bg-[#161618] p-8 rounded border border-[#3e3e3e]/40 text-center text-gray-500">
                        <CircleDot size={20} className="mx-auto text-gray-600 mb-2" />
                        <p className="text-xs font-mono">No branches found.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {branches.map((branch) => (
                          <div key={branch.name} className="p-3 rounded bg-[#252526] border border-[#3e3e3e]/80 flex items-center justify-between gap-4">
                            <span className="text-xs font-mono text-white break-all">{branch.name}</span>
                            <span className="text-[10px] font-mono text-gray-500">{formatRelativeTime(branch.commit.date)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <div className="space-y-4" data-testid="repo-control-plane">
                  {activeWorkError ? (
                    <div className="bg-red-950/20 border border-red-900/60 rounded p-4 text-red-200 text-xs font-mono flex items-start gap-2">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span className="break-words">{activeWorkError}</span>
                    </div>
                  ) : !activeWork ? (
                    <div className="h-40 flex items-center justify-center text-gray-500 text-xs font-mono">
                      <RefreshCw className="animate-spin mr-2 text-[#007acc]" size={15} />
                      Loading control-plane projection...
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
                        <div className="bg-[#252526] border border-[#3e3e3e]/80 rounded p-3 min-w-0">
                          <div className="text-[10px] font-mono text-gray-500 uppercase font-bold flex items-center gap-1.5">
                            <AlertCircle size={12} className="text-amber-400" />
                            GitHub Active Work
                          </div>
                          <div className="text-xl text-white font-bold mt-1">{activeWork.activeWork.issues.length}</div>
                          <div className="text-[10px] text-gray-500 font-mono mt-1">open issues in this repository</div>
                        </div>
                        <div className="bg-[#252526] border border-[#3e3e3e]/80 rounded p-3 min-w-0">
                          <div className="text-[10px] font-mono text-gray-500 uppercase font-bold flex items-center gap-1.5">
                            <GitPullRequest size={12} className="text-purple-400" />
                            Linked PRs
                          </div>
                          <div className="text-xl text-white font-bold mt-1">{activeWork.activeWork.pullRequests.length}</div>
                          <div className="text-[10px] text-gray-500 font-mono mt-1">open pull requests checked for claims</div>
                        </div>
                        <div className="bg-[#252526] border border-[#3e3e3e]/80 rounded p-3 min-w-0">
                          <div className="text-[10px] font-mono text-gray-500 uppercase font-bold flex items-center gap-1.5">
                            <HardDrive size={12} className="text-blue-400" />
                            Local Resume
                          </div>
                          <div className="text-xs text-white font-bold mt-2 break-all">
                            {activeWork.local.checkout?.path || activeWork.local.configError?.kind || "no matching checkout"}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono mt-1">
                            {activeWork.local.checkout?.branch || "no branch"}
                          </div>
                        </div>
                        <div className="bg-[#252526] border border-[#3e3e3e]/80 rounded p-3 min-w-0">
                          <div className="text-[10px] font-mono text-gray-500 uppercase font-bold flex items-center gap-1.5">
                            <ShieldCheck size={12} className="text-emerald-400" />
                            QC Health
                          </div>
                          <div className={`inline-flex mt-2 px-2 py-1 rounded border text-[11px] font-mono font-bold ${qcClassName(activeWork.qc.global_status)}`}>
                            {activeWork.qc.global_status}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono mt-1 break-words">{activeWork.qc.source}</div>
                        </div>
                      </div>

                      {activeWork.local.rootErrors.length > 0 && (
                        <div className="bg-amber-950/20 border border-amber-900/60 rounded p-3 text-[11px] text-amber-200 font-mono space-y-1">
                          {activeWork.local.rootErrors.map((error) => (
                            <div key={`${error.kind}-${error.path}`} className="break-words">
                              {error.kind}: {error.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {activeWork.resumePackets.length === 0 ? (
                        <div className="bg-[#161618] p-8 rounded border border-[#3e3e3e]/40 text-center text-gray-500">
                          <CircleDot size={20} className="mx-auto text-gray-600 mb-2" />
                          <p className="text-xs font-mono">No active PR-to-issue resume packets found.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeWork.resumePackets.map((packet) => (
                            <div
                              key={`${packet.pullRequest.number}-${packet.issue?.number ?? "no-issue"}`}
                              className="bg-[#252526] border border-[#3e3e3e]/80 rounded p-4 space-y-3"
                            >
                              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${classificationClassName(packet.classification)}`}>
                                      {packet.classification}
                                    </span>
                                    <span className="text-white text-sm font-bold break-words">
                                      {packet.issue ? `#${packet.issue.number} ${packet.issue.title}` : "Unclaimed issue subtree"}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-gray-400 font-mono flex flex-wrap gap-x-3 gap-y-1">
                                    <span className="flex items-center gap-1">
                                      <Link2 size={11} className="text-purple-400" />
                                      PR #{packet.pullRequest.number}: {packet.pullRequest.title}
                                    </span>
                                    <span>{packet.pullRequest.draft ? "draft" : "open"}</span>
                                    <span>{packet.checkState}</span>
                                    <span>{packet.unresolvedReviewThreads} unresolved threads</span>
                                  </div>
                                </div>
                                <a
                                  href={packet.pullRequest.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0 text-[11px] font-mono px-2 py-1 rounded border border-[#3e3e3e] text-gray-300 hover:text-white hover:border-gray-500 flex items-center gap-1"
                                >
                                  <ExternalLink size={12} />
                                  GitHub
                                </a>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono">
                                <div className="bg-[#1a1a1c] border border-[#3e3e3e]/50 rounded p-2 min-w-0">
                                  <div className="text-gray-500 uppercase text-[9.5px] font-bold mb-1">Claiming PR</div>
                                  <div className="text-gray-300 break-all">{packet.pullRequest.headRefName}</div>
                                  <div className="text-amber-300 mt-1">{formatShortSha(packet.pullRequest.headSha)}</div>
                                </div>
                                <div className="bg-[#1a1a1c] border border-[#3e3e3e]/50 rounded p-2 min-w-0">
                                  <div className="text-gray-500 uppercase text-[9.5px] font-bold mb-1">Local Resumability</div>
                                  <div className="text-gray-300 break-all">{packet.local?.path || "no local checkout"}</div>
                                  <div className="text-gray-500 mt-1">
                                    {packet.local ? `${packet.local.branch || "detached"} / ${packet.local.dirty || packet.local.untracked ? "uncommitted changes" : "worktree recorded"}` : "scan has no match"}
                                  </div>
                                </div>
                                <div className="bg-[#1a1a1c] border border-[#3e3e3e]/50 rounded p-2 min-w-0">
                                  <div className="text-gray-500 uppercase text-[9.5px] font-bold mb-1">QC Doctor</div>
                                  <div className={`inline-flex px-2 py-0.5 rounded border font-bold ${qcClassName(packet.qc.global_status)}`}>
                                    {packet.qc.global_status}
                                  </div>
                                  <div className="text-gray-500 mt-1 break-words">{packet.qc.source_detail}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : showProjectsOverview ? (
        <div data-testid="projects-dashboard" className="flex-1 flex min-h-0 overflow-hidden bg-[#141416]">
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            {projectTags.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <Layers size={28} className="text-gray-600 mb-3" />
                <p className="text-xs font-mono">No projects found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5">
                {projectTags.map((project) => {
                  const projectRepos = repos.filter((repo) => project.repos.includes(repo.full_name));
                  const issueCount = projectRepos.reduce((total, repo) => total + (repo.open_issues_count ?? 0), 0);
                  return (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      repoCount={projectRepos.length}
                      issueCount={issueCount}
                      onOpenProject={openProject}
                      onManageProject={(nextProject) => setAssignmentTarget({ type: "project", project: nextProject })}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activeProjectDashboard ? (
        <div data-testid="project-dashboard" className="flex-1 flex min-h-0 overflow-hidden bg-[#18181a]">
          <div className="w-80 border-r border-[#3e3e3e] bg-[#222224] p-5 overflow-y-auto select-none">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-3 w-3 rounded-full border border-black/30 shrink-0" style={{ backgroundColor: activeProjectDashboard.color }} />
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm tracking-tight leading-snug break-words">{activeProjectDashboard.name}</h3>
                  <p className="text-xs text-gray-500 font-mono">Project dashboard</p>
                </div>
              </div>

              <div className="bg-[#1a1a1c] p-3 rounded border border-[#3e3e3e]/40 space-y-2.5 text-[11px] font-mono">
                <div className="flex justify-between border-b border-[#2a2a2c] pb-1.5">
                  <span className="text-gray-500">Repositories:</span>
                  <span className="text-gray-300">{activeProjectRepos.length}</span>
                </div>
                <div className="flex justify-between border-b border-[#2a2a2c] pb-1.5">
                  <span className="text-gray-500">Issues:</span>
                  <span className="text-gray-300">{activeProjectRepos.reduce((total, repo) => total + (repo.open_issues_count ?? 0), 0)}</span>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span className="text-gray-500">Explorer filter:</span>
                  <span className="text-gray-400">Unchanged</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignmentTarget({ type: "project", project: activeProjectDashboard })}
                className="w-full bg-[#094771] hover:bg-[#0e5f95] text-white text-xs rounded px-2 py-1.5 text-left font-mono"
              >
                Manage Project
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1f]">
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-7">
              <section className="space-y-3">
                <div className="h-10 bg-[#252526] border border-[#3e3e3e] px-4 flex items-center gap-2 shrink-0 select-none rounded">
                  <Layers size={14} className="text-[#007acc]" />
                  <span className="text-xs font-mono font-bold text-white">Project Repositories</span>
                </div>
                {activeProjectRepos.length === 0 ? (
                  <div className="p-8 rounded border border-[#3e3e3e]/40 text-center text-gray-500">
                    <FolderGit2 size={28} className="mx-auto text-gray-600 mb-3" />
                    <p className="text-xs font-mono">No repositories assigned to this project.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {activeProjectRepos.map((repo) => (
                      <RepoCard
                        key={repo.id}
                        repo={repo}
                        projects={getMappedProjectsForRepo(repo.full_name)}
                        onOpenRepo={openRepo}
                        onOpenProject={openProject}
                        onManageProjects={(nextRepo) => setAssignmentTarget({ type: "repo", repo: nextRepo })}
                      />
                    ))}
                  </div>
                )}
              </section>

              {renderIssueSection({
                title: `Issues (${filteredProjectIssues.length})`,
                icon: <AlertCircle size={14} className="text-emerald-500" />,
                labels: projectIssueLabels,
                labelValue: projectIssuesLabel,
                onLabelChange: setProjectIssuesLabel,
                labelTestId: "project-issues-label-filter",
                rows: filteredProjectIssues,
                emptyCopy: "No project issues found.",
                rowTestId: "project-issue-row",
                rowLabelTestId: "issue-row-label",
                onOpen: openProjectIssue
              })}
              {renderIssueSection({
                title: `PRs (${filteredProjectPRs.length})`,
                icon: <GitPullRequest size={14} className="text-purple-400" />,
                labels: projectPrLabels,
                labelValue: projectPrsLabel,
                onLabelChange: setProjectPrsLabel,
                labelTestId: "project-prs-label-filter",
                rows: filteredProjectPRs,
                emptyCopy: "No project PRs found.",
                rowTestId: "project-pr-row",
                rowLabelTestId: "pr-row-label",
                onOpen: openProjectPR
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden bg-[#141416]">
          <div className="flex-1 flex flex-col min-h-0 bg-[#161619]">
            <div className="p-4 border-b border-[#3e3e3e] bg-[#222224] flex flex-wrap items-center justify-between gap-4 select-none shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                {(() => {
                  const activeProject = projectTags.find((project) => project.id === selectedProjectFilter);
                  if (!activeProject) return null;
                  return (
                    <div className="flex items-center gap-2 bg-[#094771]/50 border border-[#007acc]/45 pl-2.5 pr-1.5 py-1 rounded text-xs select-none shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: activeProject.color }} />
                      <span className="text-gray-400 font-mono text-[10.5px]">Project:</span>
                      <span className="text-white font-semibold font-mono">{activeProject.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedProjectFilter("all")}
                        className="text-gray-400 hover:text-white p-0.5 rounded cursor-pointer transition-colors ml-1 shrink-0"
                        title="Clear project filter back to all"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })()}

                <div className="flex-1 max-w-sm flex items-center gap-2 border border-[#3e3e3e] bg-[#1a1a1c] px-3 py-1.5 text-xs text-white rounded focus-within:border-[#007acc] transition-colors relative">
                  <Search size={13} className="text-gray-500 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search repositories"
                    className="w-full bg-transparent outline-none placeholder-gray-600 font-mono"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery("")} className="text-gray-500 hover:text-white shrink-0 p-0.5 rounded cursor-pointer">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-mono">
                <Clock size={12} />
                <span>Newest branch-head commits first</span>
              </div>
            </div>

            {sortedRepos.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
                <Inbox size={32} className="text-gray-600 mb-3" />
                <p className="text-xs font-mono">No matching repository index matches current filter parameters.</p>
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} className="text-[#007acc] hover:underline text-xs mt-2 font-mono cursor-pointer">
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 select-none custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5">
                  {sortedRepos.map((repo) => (
                    <RepoCard
                      key={repo.id}
                      repo={repo}
                      projects={getMappedProjectsForRepo(repo.full_name)}
                      onOpenRepo={openRepo}
                      onOpenProject={openProject}
                      onManageProjects={(nextRepo) => setAssignmentTarget({ type: "repo", repo: nextRepo })}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextRepo(repo);
                        setContextPos({ x: event.clientX, y: event.clientY });
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {contextRepo && contextPos && (
        <div
          ref={contextPopupRef}
          data-testid="repo-context-popup"
          className="fixed z-50 w-72 max-w-[calc(100vw-1rem)]"
          style={{ left: `${contextPopupPos?.left ?? contextPos.x}px`, top: `${contextPopupPos?.top ?? contextPos.y}px` }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <RepoCard
            repo={contextRepo}
            projects={getMappedProjectsForRepo(contextRepo.full_name)}
            onOpenRepo={(fullName) => {
              openRepo(fullName);
              setContextRepo(null);
              setContextPos(null);
            }}
            onOpenProject={(projectId) => {
              openProject(projectId);
              setContextRepo(null);
              setContextPos(null);
            }}
            onManageProjects={(nextRepo) => {
              setAssignmentTarget({ type: "repo", repo: nextRepo });
              setContextRepo(null);
              setContextPos(null);
            }}
          />
        </div>
      )}

      <ProjectAssignmentDialog
        target={assignmentTarget}
        repos={repos}
        projectTags={projectTags}
        onClose={() => setAssignmentTarget(null)}
        onOpenProject={openProject}
        onAddProjectTag={onAddProjectTag}
        onCreateProjectWithRepo={onCreateProjectWithRepo}
        onRemoveRepoFromTag={onRemoveRepoFromTag}
        onDeleteProjectTag={onDeleteProjectTag}
      />
    </div>
  );
}

async function loadArray<T>(url: string, shapeMessage: string): Promise<T[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} failed with HTTP ${response.status}`);
  }
  const payload = await response.json() as unknown;
  invariant(Array.isArray(payload), shapeMessage);
  return payload as T[];
}

function collectLabels(items: { labels: Label[] }[]): Label[] {
  const labelsByName = new Map<string, Label>();
  items.forEach((item) => {
    item.labels.forEach((label) => labelsByName.set(label.name, label));
  });
  return [...labelsByName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function filterItemsByLabel<T extends { labels: Label[] }>(items: T[], labelName: string): T[] {
  if (labelName === "all") {
    return items;
  }
  return items.filter((item) => item.labels.some((label) => label.name === labelName));
}

function renderIssueSection<T extends Issue | PullRequest>({
  title,
  icon,
  labels,
  labelValue,
  onLabelChange,
  labelTestId,
  rows,
  emptyCopy,
  rowTestId,
  rowLabelTestId,
  onOpen
}: {
  title: string;
  icon: React.ReactNode;
  labels: Label[];
  labelValue: string;
  onLabelChange: (value: string) => void;
  labelTestId: string;
  rows: T[];
  emptyCopy: string;
  rowTestId: string;
  rowLabelTestId: string;
  onOpen: (row: T) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-[#3e3e3e] pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <h3 className="text-xs font-mono font-bold text-white">{title}</h3>
        </div>
        <LabelFilterSelect labels={labels} value={labelValue} onChange={onLabelChange} testId={labelTestId} />
      </div>
      {rows.length === 0 ? (
        <div className="bg-[#161618] p-8 rounded border border-[#3e3e3e]/40 text-center text-gray-500">
          <CircleDot size={20} className="mx-auto text-gray-600 mb-2" />
          <p className="text-xs font-mono">{emptyCopy}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <button
              key={`${row.html_url}-${row.number}`}
              type="button"
              data-testid={rowTestId}
              onClick={() => onOpen(row)}
              className="w-full text-left p-4 rounded bg-[#252526] border border-[#3e3e3e]/80 hover:border-gray-500 cursor-pointer transition-colors flex items-start justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white tracking-tight break-words">{row.title}</span>
                  <span className="text-[10px] text-gray-500 font-mono">#{row.number}</span>
                </div>
                <div className="text-[11px] text-gray-400 break-words leading-normal">
                  {toMarkdownExcerpt(row.body, 140)}
                </div>
                <div className="flex items-center gap-3 pt-1.5 flex-wrap">
                  <div className="text-[10px] text-gray-500 font-mono">
                    Opened by <strong className="text-gray-300">@{row.user.login}</strong> {formatRelativeTime(row.created_at)}
                  </div>
                  {row.labels.map((label) => (
                    <span
                      key={label.name}
                      data-testid={rowLabelTestId}
                      className="px-2 py-0.5 rounded text-[10px] font-mono leading-none border"
                      style={{
                        backgroundColor: `#${label.color}15`,
                        borderColor: `#${label.color}40`,
                        color: `#${label.color}`
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-[10px] text-gray-500 font-mono">
                Comments: {typeof row.comments === "number" ? row.comments : row.comments?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(isoString?: string | null) {
  if (!isoString) return "No commits";
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatRelativeTime(isoString?: string | null) {
  if (!isoString) return "No commits";
  const diff = Date.now() - new Date(isoString).getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hrs = Math.floor(min / 60);
  const days = Math.floor(hrs / 24);

  if (sec < 60) return "Just now";
  if (min < 60) return `${min}m ago`;
  if (hrs < 24) return `${hrs}h ${min % 60}m ago`;
  return `${days} days ago`;
}
