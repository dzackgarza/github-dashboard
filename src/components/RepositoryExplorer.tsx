import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  FolderGit2,
  GitPullRequest,
  AlertCircle,
  Clock,
  CircleDot,
  Fingerprint,
  RefreshCw,
  GitBranch,
  X,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  Calendar,
  Layers,
  Inbox
} from "lucide-react";
import { Repo, Issue, PullRequest, ProjectTag } from "../types";
import MarkdownViewer from "./MarkdownViewer";
import { useWorkspace } from "../context/WorkspaceContext";
import { toMarkdownExcerpt } from "../utils/markdownExcerpt";

export interface RepositoryExplorerPanelParams {
  explorerMode?: "repositories" | "projects" | "repo" | "project";
  repoFullName?: string;
  projectId?: string;
}

interface RepositoryExplorerProps {
  panelParams?: RepositoryExplorerPanelParams;
}

export default function RepositoryExplorer({ panelParams }: RepositoryExplorerProps) {
  const {
    repos,
    projectTags,
    syncTimestamps,
    isSyncing,
    onAddProjectTag,
    onCreateProjectWithRepo,
    onRemoveRepoFromTag,
    openTabs,
    activeRepoFullName,
    activeProjectDashboardId,
    openRepo,
    openProject,
    openRepositoryExplorer,
    selectedProjectFilter,
    setSelectedProjectFilter
  } = useWorkspace();

  const onSelectProjectFilter = setSelectedProjectFilter;
  const panelMode = panelParams?.explorerMode;
  const selectedRepoFullName = panelMode === "repo" ? panelParams?.repoFullName : activeRepoFullName;
  const selectedProjectId = panelMode === "project" ? panelParams?.projectId : activeProjectDashboardId;
  const showProjectsOverview = panelMode === "projects";
  const selectedRepo = selectedRepoFullName ? repos.find((repo) => repo.full_name === selectedRepoFullName) || null : null;
  const activeProjectDashboard = selectedProjectId
    ? projectTags.find((project) => project.id === selectedProjectId)
    : null;
  if (selectedProjectId && !activeProjectDashboard) {
    throw new Error(`Project ${selectedProjectId} was not found.`);
  }
  const activeProjectRepos = activeProjectDashboard
    ? repos.filter((repo) => activeProjectDashboard.repos.includes(repo.full_name))
    : [];

  // Search and project filtering
  const [searchQuery, setSearchQuery] = useState("");

  // Drag and drop visual cues
  const [draggedRepo, setDraggedRepo] = useState<string | null>(null);
  const [activeDragOverProjId, setActiveDragOverProjId] = useState<string | null>(null);
  const [isDragOverTrash, setIsDragOverTrash] = useState(false);

  const [branches, setBranches] = useState<{ name: string; commit: { sha: string; date: string } }[]>([]);
  const [dashIssues, setDashIssues] = useState<Issue[]>([]);
  const [dashPRs, setDashPRs] = useState<PullRequest[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [newRepoProjectName, setNewRepoProjectName] = useState("");

  // Touch & Long-press tracking
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [touchMenuRepo, setTouchMenuRepo] = useState<Repo | null>(null);
  const [touchMenuPos, setTouchMenuPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const closeMenu = () => {
      setTouchMenuRepo(null);
      setTouchMenuPos(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const colors = [
    { value: "#3b82f6", name: "Blue" },
    { value: "#10b981", name: "Green" },
    { value: "#ef4444", name: "Red" },
    { value: "#a855f7", name: "Purple" },
    { value: "#f59e0b", name: "Amber" },
    { value: "#14b8a6", name: "Teal" },
    { value: "#f43f5e", name: "Rose" },
    { value: "#64748b", name: "Slate" }
  ];

  // Load Dashboard Data once a Repo is selected
	  useEffect(() => {
	    if (selectedRepo) {
	      setLoadingDashboard(true);
	      setDashIssues([]);
	      setDashPRs([]);
	      setBranches([]);
	      const { owner, name } = selectedRepo;
      const fullName = selectedRepo.full_name;

      Promise.all([
        fetch(`/api/github/repos/${owner.login}/${name}/issues`).then((r) => r.json()),
        fetch(`/api/github/repos/${owner.login}/${name}/prs`).then((r) => r.json()),
        fetch(`/api/github/repos/${owner.login}/${name}/branches`).then((r) => r.json())
      ])
        .then(([issues, prs, brs]) => {
          setDashIssues(issues || []);
          setDashPRs(prs || []);
          setBranches(brs || []);
        })
        .catch((err) => console.error("Error loading dashboard repo metadata", err))
        .finally(() => setLoadingDashboard(false));
    }
  }, [selectedRepo]);

  // Fuzzy Subsequence Character Match algorithm
  const fuzzyMatch = (text: string, query: string) => {
    if (!query) return true;
    const cleanText = text.toLowerCase();
    const cleanQuery = query.toLowerCase();
    
    // Quick substring check
    if (cleanText.includes(cleanQuery)) return true;

    // Subroutine character check
    let queryIdx = 0;
    for (let textIdx = 0; textIdx < cleanText.length; textIdx++) {
      if (cleanText[textIdx] === cleanQuery[queryIdx]) {
        queryIdx++;
        if (queryIdx === cleanQuery.length) return true;
      }
    }
    return false;
  };

  // Filter repos
  const filteredRepos = repos.filter((repo) => {
    // 1. Fuzzy query filter
    const matchesQuery =
      fuzzyMatch(repo.full_name, searchQuery) ||
      fuzzyMatch(repo.description || "", searchQuery);

    // 2. Project Filter
    let matchesProject = true;
    if (selectedProjectFilter !== "all") {
      const proj = projectTags.find((t) => t.id === selectedProjectFilter);
      matchesProject = proj ? proj.repos.includes(repo.full_name) : false;
    }

    return matchesQuery && matchesProject;
  });

  // Explorer is always ordered by latest branch-head commit activity.
  const sortedRepos = [...filteredRepos].sort((a, b) => {
    const latestB = b.latest_commit_at === null ? Number.NEGATIVE_INFINITY : new Date(b.latest_commit_at).getTime();
    const latestA = a.latest_commit_at === null ? Number.NEGATIVE_INFINITY : new Date(a.latest_commit_at).getTime();
    return latestB - latestA || a.full_name.localeCompare(b.full_name);
  });

  // HTML5 Core Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, fullName: string) => {
    setDraggedRepo(fullName);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", fullName);
  };

  const handleDragEnd = () => {
    setDraggedRepo(null);
    setActiveDragOverProjId(null);
    setIsDragOverTrash(false);
  };

  const handleProjDragOver = (e: React.DragEvent, projId: string) => {
    e.preventDefault();
    setActiveDragOverProjId(projId);
  };

  const handleProjDrop = (e: React.DragEvent, projId: string) => {
    e.preventDefault();
    const repoName = e.dataTransfer.getData("text/plain") || draggedRepo;
    if (repoName) {
      const proj = projectTags.find((p) => p.id === projId);
      if (proj && !proj.repos.includes(repoName)) {
        onAddProjectTag(proj.name, repoName);
      }
    }
    setActiveDragOverProjId(null);
    setDraggedRepo(null);
  };

  const handleTrashDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverTrash(true);
  };

  const handleTrashDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const repoName = e.dataTransfer.getData("text/plain") || draggedRepo;
    if (repoName) {
      // Find what project contains this repo to unbind it
      projectTags.forEach((p) => {
        if (p.repos.includes(repoName)) {
          onRemoveRepoFromTag(p.id, repoName);
        }
      });
    }
    setIsDragOverTrash(false);
    setDraggedRepo(null);
  };

  // Touch Touchscreen-friendly right-click (Long press handlers)
  const handleTouchStart = (e: React.TouchEvent, repo: Repo) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    
    // Track pointer position
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    pressTimerRef.current = setTimeout(() => {
      setTouchMenuRepo(repo);
      setTouchMenuPos({ x: clientX, y: clientY });
    }, 600); // 600ms hold to open touch control selector
  };

  const handleTouchEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "No commits";
    return new Date(isoString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const formatRelativeTime = (isoString?: string | null) => {
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
  };

  // Check which Projects a repository belongs to
  const getMappedProjectsForRepo = (fullName: string) => {
    return projectTags.filter((p) => p.repos.includes(fullName));
  };

  const getAvailableProjectsForRepo = (fullName: string) => {
    return projectTags.filter((p) => !p.repos.includes(fullName));
  };

  const createProjectForSelectedRepo = () => {
    if (!selectedRepo) {
      return;
    }
    const name = newRepoProjectName.trim();
    if (!name) {
      return;
    }
    onCreateProjectWithRepo(name, selectedRepo.full_name);
    setNewRepoProjectName("");
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] flex flex-col min-h-0 relative select-none text-[#cccccc] font-sans">
      
      {/* Tab Context Switch Header (Back navigation or standard banner) */}
      <div className="bg-[#252526] py-3.5 px-6 border-b border-[#3e3e3e] flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2.5">
          {selectedRepo || activeProjectDashboard ? (
            <button
              onClick={openRepositoryExplorer}
              className="p-1 px-2.5 bg-[#2d2d2d] hover:bg-[#333333] text-white border border-[#3e3e3e] rounded flex items-center gap-1.5 transition-colors cursor-pointer text-xs font-semibold"
            >
              <ChevronLeft size={14} />
              <span>Back to Repositories</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <FolderGit2 className="text-[#007acc]" size={18} />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                {showProjectsOverview ? "Projects" : "Repositories"}
              </h2>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Cleansed header with no redundant buttons */}
        </div>
      </div>

      {/* RENDER VIEW 1: RECOVERY REPOSITION DASHBOARD FOR SINGLE CHOSEN PROJECT REPO */}
      {selectedRepo ? (
        <div className="flex-1 flex min-h-0 overflow-hidden bg-[#18181a]">
          {/* Dashboard Left Side Metadata Frame */}
          <div className="w-80 border-r border-[#3e3e3e] bg-[#222224] p-5 flex flex-col justify-between overflow-y-auto select-none">
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded border border-[#3e3e3e] bg-[#1a1a1c] shadow-md shrink-0 flex items-center justify-center">
                  <FolderGit2 size={22} className="text-[#007acc]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm tracking-tight leading-snug break-all">
                    {selectedRepo.name}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">{selectedRepo.full_name}</p>
                </div>
              </div>

              {/* Brief stats overview list */}
              <div className="bg-[#1a1a1c] p-3 rounded.5 border border-[#3e3e3e]/40 space-y-2.5 text-[11px] font-mono">
                <div className="flex justify-between border-b border-[#2a2a2c] pb-1.5">
                  <span className="text-gray-500">Latest commit:</span>
                  <span className="text-gray-400">{formatDate(selectedRepo.latest_commit_at)}</span>
                </div>
                <div className="flex justify-between pt-0.5">
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

              {/* Description box */}
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
                    getMappedProjectsForRepo(selectedRepo.full_name).map((p) => (
                      <span
                        key={p.id}
                        className="rounded text-[11px] font-mono font-semibold flex items-center overflow-hidden"
                        style={{ backgroundColor: `${p.color}25`, border: `1px solid ${p.color}50`, color: p.color }}
                      >
                        <button
                          type="button"
                          onClick={() => openProject(p.id)}
                          className="px-2 py-1 hover:bg-black/10"
                          title={`Open ${p.name}`}
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveRepoFromTag(p.id, selectedRepo.full_name)}
                          className="px-1.5 py-1 hover:bg-black/20"
                          title={`Remove ${selectedRepo.name} from ${p.name}`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                {getAvailableProjectsForRepo(selectedRepo.full_name).length > 0 ? (
                  <select
                    data-testid="repo-dashboard-project-select"
                    value=""
                    onChange={(event) => {
                      const project = projectTags.find((tag) => tag.id === event.target.value);
                      if (project) {
                        onAddProjectTag(project.name, selectedRepo.full_name);
                      }
                    }}
                    className="w-full bg-[#1a1a1c] border border-[#3e3e3e] text-gray-300 text-xs rounded px-2 py-1.5 outline-none focus:border-[#007acc]"
                  >
                    <option value="" disabled>Assign to project...</option>
                    {getAvailableProjectsForRepo(selectedRepo.full_name).map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-[10px] text-gray-600 font-mono">
                    {projectTags.length === 0 ? "No projects yet." : "Assigned to all projects."}
                  </div>
                )}
                <div className="space-y-1.5 pt-1">
                  <input
                    value={newRepoProjectName}
                    onChange={(event) => setNewRepoProjectName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        createProjectForSelectedRepo();
                      }
                    }}
                    placeholder="New project name"
                    className="w-full bg-[#1a1a1c] border border-[#3e3e3e] text-gray-300 text-xs rounded px-2 py-1.5 outline-none focus:border-[#007acc]"
                  />
                  <button
                    type="button"
                    onClick={createProjectForSelectedRepo}
                    className="w-full bg-[#094771] hover:bg-[#0e5f95] text-white text-xs rounded px-2 py-1.5 text-left font-mono"
                  >
                    Create Project With This Repo
                  </button>
                </div>
              </div>
            </div>

          </div>

	          {/* Detailed Lists content right pane */}
	          <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1f]">
	            <div className="flex-1 overflow-y-auto p-6 space-y-7 select-text custom-scrollbar">
		              {loadingDashboard && (
		                <div className="flex items-center gap-2 rounded border border-[#3e3e3e]/70 bg-[#222224] px-3 py-2 text-xs text-gray-400 font-mono">
		                  <RefreshCw className="animate-spin text-[#007acc]" size={14} />
		                  <span>Loading repository dashboard...</span>
		                </div>
		              )}
		              <>
	                  <section className="space-y-3">
	                    <div className="flex items-center gap-2 border-b border-[#3e3e3e] pb-2">
	                      <AlertCircle size={14} className="text-emerald-500" />
	                      <h3 className="text-xs font-mono font-bold text-white">Issues ({dashIssues.length})</h3>
	                    </div>
	                      {dashIssues.length === 0 ? (
	                        <div className="bg-[#161618] p-8 rounded border border-[#3e3e3e]/40 text-center text-gray-500">
	                          <CircleDot size={20} className="mx-auto text-gray-600 mb-2" />
	                          <p className="text-xs font-mono">No issues found.</p>
	                        </div>
	                      ) : (
	                        dashIssues.map((issue) => (
	                          <div
	                            key={issue.number}
	                            onClick={() => openTabs(`issue-${selectedRepo.full_name}-${issue.number}`, "issue", `Issue #${issue.number}`, selectedRepo.owner.login, selectedRepo.name, issue.number)}
	                            className="p-4 rounded bg-[#252526] border border-[#3e3e3e]/80 hover:border-gray-500 cursor-pointer transition-colors flex items-start justify-between gap-4"
	                          >
	                            <div className="space-y-1.5 min-w-0">
	                              <div className="flex items-center gap-2 flex-wrap">
	                                <span className="text-xs font-bold text-white tracking-tight break-words">
	                                  {issue.title}
	                                </span>
                                <span className="text-[10px] text-gray-500 font-mono">#{issue.number}</span>
                              </div>

                              <div className="text-[11px] text-gray-400 break-words leading-normal">
                                {toMarkdownExcerpt(issue.body, 140)}
                              </div>

                              {/* Labels row info footer */}
                              <div className="flex items-center gap-4 pt-1.5 flex-wrap">
                                <div className="text-[10px] text-gray-500 font-mono">
                                  Opened by <strong className="text-gray-300">@{issue.user.login}</strong> • {formatRelativeTime(issue.created_at)}
                                </div>

                                {issue.labels.map((lbl) => (
                                  <span
                                    key={lbl.name}
                                    className="px-2 py-0.5 rounded text-[10px] font-mono leading-none border"
                                    style={{
                                      backgroundColor: `#${lbl.color}15`,
                                      borderColor: `#${lbl.color}40`,
                                      color: `#${lbl.color}`
                                    }}
                                  >
                                    {lbl.name}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col items-end gap-1.5">
                              <span className="text-[10px] text-gray-500 font-mono">Comments: {typeof issue.comments === "number" ? issue.comments : issue.comments?.length ?? 0}</span>
	                            </div>
	                          </div>
	                        ))
	                      )}
	                  </section>
	
	                  <section className="space-y-3">
	                    <div className="flex items-center gap-2 border-b border-[#3e3e3e] pb-2">
	                      <GitPullRequest size={14} className="text-purple-400" />
	                      <h3 className="text-xs font-mono font-bold text-white">PRs ({dashPRs.length})</h3>
	                    </div>
	                      {dashPRs.length === 0 ? (
	                        <div className="bg-[#161618] p-8 rounded border border-[#3e3e3e]/40 text-center text-gray-500">
	                          <GitPullRequest size={20} className="mx-auto text-gray-600 mb-2 animate-bounce" />
	                          <p className="text-xs font-mono">No PRs found.</p>
	                        </div>
	                      ) : (
	                        dashPRs.map((pr) => {
	                          const ciState = pr.ci_status?.state || "pending";
	                          
	                          return (
                            <div
                              key={pr.number}
                              onClick={() => openTabs(`pr-${selectedRepo.full_name}-${pr.number}`, "pr", `PR #${pr.number}`, selectedRepo.owner.login, selectedRepo.name, pr.number)}
                              className="p-4 rounded bg-[#252526] border border-[#3e3e3e]/80 hover:border-gray-500 cursor-pointer transition-colors flex items-start justify-between gap-4"
	                            >
	                              <div className="space-y-1.5 min-w-0">
	                                <div className="flex items-center gap-2 flex-wrap">
	                                  <span className="text-xs font-bold text-white tracking-tight break-words">
	                                    {pr.title}
	                                  </span>
                                  <span className="text-[10px] text-gray-500 font-mono">#{pr.number}</span>
                                </div>

                                <div className="text-[11px] text-gray-400 break-words leading-normal">
                                  {toMarkdownExcerpt(pr.body, 145) || "*No PR descriptive scope provided.*"}
                                </div>

                                <div className="flex items-center gap-4 pt-1.5 flex-wrap">
                                  <div className="text-[10px] text-gray-500 font-mono">
                                    Proposed by <strong className="text-gray-300">@{pr.user.login}</strong> • {formatRelativeTime(pr.created_at)}
                                  </div>

                                  {/* PR Specific continuous integration badge right in line */}
                                  <div className={`flex items-center gap-1 px-2.5 py-0.5 rounded border text-[10px] font-mono font-bold leading-tight ${
                                    ciState === "success"
                                      ? "bg-emerald-950/40 text-emerald-400 border-emerald-900"
                                      : ciState === "failure"
                                      ? "bg-red-950/40 text-red-400 border-red-900"
                                      : "bg-amber-950/40 text-amber-400 border-amber-900"
                                  }`}>
                                    <span>CI: {ciState}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0 flex flex-col items-end gap-1 font-mono text-[10.5px]">
                                <span className="text-emerald-400 flex items-center gap-1 font-bold">
                                  +{pr.diff?.reduce((acc, curr) => acc + (curr.additions || 0), 0) || 0}
                                </span>
                                <span className="text-red-400 flex items-center gap-1 font-bold">
                                  -{pr.diff?.reduce((acc, curr) => acc + (curr.deletions || 0), 0) || 0}
                                </span>
                                <span className="text-gray-500 text-[9.5px]">Comments: {typeof pr.comments === "number" ? pr.comments : pr.comments?.length ?? 0}</span>
                              </div>
                            </div>
	                          );
	                        })
	                      )}
	                  </section>
	
	                  <section className="space-y-3">
	                    <div className="flex items-center gap-2 border-b border-[#3e3e3e] pb-2">
	                      <GitBranch size={14} className="text-blue-400" />
	                      <h3 className="text-xs font-mono font-bold text-white">Branches ({branches.length})</h3>
	                    </div>
	                    <div className="space-y-2.5">
	                      {branches.map((b) => (
	                        <div
	                          key={b.name}
                          className="p-3.5 rounded bg-[#252526] border border-[#3e3e3e]/80 flex items-center justify-between group select-none"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-1 px-1.5 bg-[#1b1b1c] rounded border border-gray-700/50 text-[#007acc]">
                              <GitBranch size={13} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-white break-all font-mono">
                                {b.name}
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
                                Head Commit Pointer: <code className="bg-[#111] px-1 py-0.5 text-amber-300 font-semibold rounded">{b.commit.sha}</code>
                              </div>
                            </div>
                          </div>

	                          <div className="flex items-center gap-4 font-mono text-[11px] text-gray-400">
	                            <span className="flex items-center gap-1">
	                              <Clock size={11} className="text-gray-500" />
	                              Pushed {formatRelativeTime(b.commit.date)}
	                            </span>
	                          </div>
	                        </div>
	                      ))}
	                    </div>
	                  </section>
		              </>
	            </div>
          </div>
        </div>
	      ) : showProjectsOverview ? (
	        <div data-testid="projects-dashboard" className="flex-1 flex min-h-0 overflow-hidden bg-[#141416]">
	          <div className="flex-1 flex flex-col min-h-0 bg-[#161619]">
	            <div className="p-4 border-b border-[#3e3e3e] bg-[#222224] flex items-center justify-between gap-4 select-none shrink-0">
	              <div className="flex items-center gap-2">
	                <Layers size={16} className="text-[#007acc]" />
	                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">Projects</h3>
	              </div>
	              <span className="text-[10px] text-gray-500 font-mono">{projectTags.length} topics</span>
	            </div>
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
	                      <div
	                        key={project.id}
	                        data-testid="project-card"
	                        className="bg-[#222224] border border-[#3e3e3e]/80 rounded p-4 flex flex-col gap-3 shadow"
	                      >
	                        <div className="flex items-start justify-between gap-3">
	                          <div className="min-w-0">
	                            <div className="flex items-center gap-2">
	                              <span
	                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
	                                style={{ backgroundColor: project.color }}
	                              />
	                              <h4 className="font-bold text-xs text-white break-words font-mono leading-snug">
	                                {project.name}
	                              </h4>
	                            </div>
	                            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500 font-mono">
	                              <span>Repos: <strong className="text-gray-300">{projectRepos.length}</strong></span>
	                              <span>Issues: <strong className="text-gray-300">{issueCount}</strong></span>
	                            </div>
	                          </div>
	                        </div>
	                        <div className="mt-auto flex items-center gap-2 pt-2 border-t border-[#3e3e3e]/60">
	                          <button
	                            type="button"
	                            onClick={() => openProject(project.id)}
	                            className="px-2.5 py-1 rounded bg-[#094771] hover:bg-[#0e5f95] text-white text-[10px] font-mono font-semibold"
	                          >
	                            Open project dashboard
	                          </button>
	                        </div>
	                      </div>
	                    );
	                  })}
	                </div>
	              )}
	            </div>
	          </div>
	        </div>
	      ) : activeProjectDashboard ? (
        <div data-testid="project-dashboard" className="flex-1 flex min-h-0 overflow-hidden bg-[#18181a]">
          <div className="w-80 border-r border-[#3e3e3e] bg-[#222224] p-5 overflow-y-auto select-none">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-3 w-3 rounded-full border border-black/30 shrink-0"
                  style={{ backgroundColor: activeProjectDashboard.color }}
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm tracking-tight leading-snug break-words">
                    {activeProjectDashboard.name}
                  </h3>
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
                  <span className="text-gray-300">
                    {activeProjectRepos.reduce((total, repo) => total + (repo.open_issues_count ?? 0), 0)}
                  </span>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span className="text-gray-500">Explorer filter:</span>
                  <span className="text-gray-400">Unchanged</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1f]">
            <div className="h-10 bg-[#252526] border-b border-[#3e3e3e] px-4 flex items-center gap-2 shrink-0 select-none">
              <Layers size={14} className="text-[#007acc]" />
              <span className="text-xs font-mono font-bold text-white">Project Repositories</span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              {activeProjectRepos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <FolderGit2 size={28} className="text-gray-600 mb-3" />
                  <p className="text-xs font-mono">No repositories assigned to this project.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeProjectRepos.map((repo) => (
                    <div
                      key={repo.id}
                      data-testid="project-dashboard-repo"
                      onClick={() => openRepo(repo.full_name)}
                      className="p-4 rounded bg-[#252526] border border-[#3e3e3e]/80 hover:border-gray-500 cursor-pointer transition-colors flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white tracking-tight break-all font-mono">
                            {repo.full_name}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-relaxed break-words">
                          {repo.description || "No repository description."}
                        </p>
                        <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 font-mono">
                          <span>Latest commit {formatRelativeTime(repo.latest_commit_at)}</span>
                          <span>Issues: {repo.open_issues_count ?? 0}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveRepoFromTag(activeProjectDashboard.id, repo.full_name);
                        }}
                        className="shrink-0 p-1.5 rounded border border-[#3e3e3e] text-gray-400 hover:text-white hover:border-gray-500"
                        title={`Remove ${repo.full_name} from ${activeProjectDashboard.name}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* RENDER VIEW 2: THE MAIN REPOSITORY EXPLORER GRID VIEW (Clean Full Width, Filtered via LHS) */
        <div className="flex-1 flex min-h-0 overflow-hidden bg-[#141416]">

          {/* Core Repository Grid container segment */}
          <div className="flex-1 flex flex-col min-h-0 bg-[#161619]">
            
            {/* Upper Advanced Filter Box */}
            <div className="p-4 border-b border-[#3e3e3e] bg-[#222224] flex flex-wrap items-center justify-between gap-4 select-none shrink-0">
              
              {/* Left filter selections: Fuzzy Search + Project */}
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                {/* Active Sidebar Project Filter Chip Indicator */}
                {(() => {
                  const activeProject = projectTags.find((p) => p.id === selectedProjectFilter);
                  if (!activeProject) return null;
                  return (
                    <div className="flex items-center gap-2 bg-[#094771]/50 border border-[#007acc]/45 pl-2.5 pr-1.5 py-1 rounded text-xs select-none shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: activeProject.color }} />
                      <span className="text-gray-400 font-mono text-[10.5px]">Project:</span>
                      <span className="text-white font-semibold font-mono">{activeProject.name}</span>
                      <button
                        onClick={() => onSelectProjectFilter("all")}
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
	                    onChange={(e) => setSearchQuery(e.target.value)}
	                    placeholder="Search repositories"
	                    className="w-full bg-transparent outline-none placeholder-gray-600 font-mono"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="text-gray-500 hover:text-white shrink-0 p-0.5 rounded cursor-pointer"
                    >
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

            {/* Empty result indication box */}
            {sortedRepos.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
                <Inbox size={32} className="text-gray-600 mb-3" />
                <p className="text-xs font-mono">No matching repository index matches current filter parameters.</p>
                {searchQuery && (
	                  <button
	                    onClick={() => setSearchQuery("")}
	                    className="text-[#007acc] hover:underline text-xs mt-2 font-mono cursor-pointer"
	                  >
	                    Clear search
	                  </button>
                )}
              </div>
            ) : (
              /* The Beautiful Cards Grid Segment */
              <div className="flex-1 overflow-y-auto p-5 select-none custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5">
                  {sortedRepos.map((repo) => {
                    const mappedProjs = getMappedProjectsForRepo(repo.full_name);
                    const isDragged = draggedRepo === repo.full_name;
                    
                    return (
	                      <div
	                        key={repo.id}
	                        data-testid="repo-card"
	                        draggable={true}
	                        onDragStart={(e) => handleDragStart(e, repo.full_name)}
	                        onDragEnd={handleDragEnd}
	                        onTouchStart={(e) => handleTouchStart(e, repo)}
	                        onTouchEnd={handleTouchEnd}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setTouchMenuRepo(repo);
                          setTouchMenuPos({ x: e.clientX, y: e.clientY });
                        }}
	                        className={`bg-[#222224] border rounded p-4 flex flex-col justify-between gap-4 shadow transition-all active:cursor-grabbing relative overflow-hidden select-none hover:shadow-md ${
                          isDragged
                            ? "opacity-40 border-dashed border-amber-500 bg-[#3a2010]"
                            : "border-[#3e3e3e]/80 hover:border-gray-500"
                        }`}
                      >
                        {/* Main info card body */}
                        <div className="space-y-2.5">
                          {/* Title with metadata lock indicator */}
	                          <div className="flex items-start justify-between gap-2">
	                            <div className="flex items-center gap-2 min-w-0">
	                              <span className="w-5.5 h-5.5 rounded bg-gray-800 border border-gray-700 shrink-0 flex items-center justify-center">
	                                <FolderGit2 size={13} className="text-[#007acc]" />
	                              </span>
	                              <h3 className="font-bold text-xs text-white break-all font-mono leading-none tracking-tight">
	                                {repo.name}
                              </h3>
                            </div>

                          </div>

                          {/* Descriptive blurb */}
                          {repo.description ? (
                            <p className="text-[11px] text-gray-400 leading-relaxed break-words select-text">
                              {repo.description}
                            </p>
                          ) : (
                            <div className="h-8.5 flex items-center">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wider font-mono uppercase bg-red-950/45 text-red-400 border border-red-900/40 leading-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                                No description
                              </span>
                            </div>
                          )}

                        </div>

                        {/* Stats items rows & launched button */}
                        <div className="space-y-3 pt-3 border-t border-[#3e3e3e]/60">
                          {/* Inner columns stats metadata */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-500">
                            <div className="flex items-center gap-1">
                              <AlertCircle size={11} className="text-emerald-500 shrink-0" />
                              {/* Standard GitHub API open issues contains also pull requests */}
                              <span>Issues: <strong className="text-gray-300">{repo.open_issues_count ?? 0}</strong></span>
                            </div>

                            <div className="col-span-2 flex items-center gap-1 text-[9.5px] text-gray-500 mt-1">
                              <Clock size={10} className="shrink-0" />
                              <span>Latest commit: <strong className="text-gray-400">{formatRelativeTime(repo.latest_commit_at)}</strong></span>
                            </div>
                          </div>

	                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-1">
                              {mappedProjs.length === 0 ? (
                                <span className="text-[9px] font-mono text-gray-600 italic select-none">No Projects mapped</span>
                              ) : (
                                mappedProjs.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openProject(p.id);
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold leading-none border"
                                    style={{
                                      backgroundColor: `${p.color}15`,
                                      borderColor: `${p.color}45`,
                                      color: p.color
                                    }}
                                  >
                                    {p.name}
                                  </button>
                                ))
                              )}
                            </div>
	                            {getAvailableProjectsForRepo(repo.full_name).length > 0 ? (
                              <select
                                data-testid="repo-card-project-select"
                                value=""
                                onClick={(e) => e.stopPropagation()}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  const project = projectTags.find((tag) => tag.id === event.target.value);
                                  if (project) {
                                    onAddProjectTag(project.name, repo.full_name);
                                  }
                                }}
                                className="w-full bg-[#1a1a1c] border border-[#3e3e3e] text-gray-400 text-[10px] rounded px-2 py-1 outline-none focus:border-[#007acc]"
                              >
                                <option value="" disabled>Assign to project...</option>
                                {getAvailableProjectsForRepo(repo.full_name).map((project) => (
                                  <option key={project.id} value={project.id}>{project.name}</option>
                                ))}
                              </select>
	                            ) : projectTags.length === 0 ? (
	                              <span className="text-[9px] font-mono text-gray-600 italic select-none" title="Right-click this repo to create a topic">No Projects mapped</span>
	                            ) : null}
	                            <div className="flex items-center gap-2">
	                              <button
	                                type="button"
	                                onClick={() => openRepo(repo.full_name)}
	                                className="px-2.5 py-1 rounded bg-[#094771] hover:bg-[#0e5f95] text-white text-[10px] font-mono font-semibold"
	                              >
	                                Open repository dashboard
	                              </button>
	                              <a
	                                href={repo.html_url}
	                                target="_blank"
	                                rel="noopener noreferrer"
	                                className="px-2.5 py-1 rounded border border-[#3e3e3e] text-gray-400 hover:text-white hover:border-gray-500 text-[10px] font-mono"
	                              >
	                                GitHub
	                              </a>
	                            </div>
	                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Touch Screen/Desktop context helper overlays floating menus (Assigned on long press or right click) */}
	      {touchMenuRepo && touchMenuPos && (
	        <div
	          role="menu"
	          className="fixed bg-[#1f1f20] border border-gray-700 rounded shadow-2xl py-1 w-52 z-50 text-xs font-sans text-gray-200 select-none animate-in fade-in zoom-in-95 duration-100"
	          style={{ top: `${touchMenuPos.y}px`, left: `${touchMenuPos.x}px` }}
	          onClick={(event) => event.stopPropagation()}
	        >
          <div className="px-3 py-1.5 text-gray-500 font-mono font-semibold text-[10px] uppercase border-b border-gray-800">
            {touchMenuRepo.name} options
          </div>

          <div>
            <div className="px-3.5 py-1 text-[9px] font-mono font-bold text-[#f59e0b] uppercase select-none">
              Assign to Project
            </div>

            {projectTags.map((p) => {
              const isMapped = p.repos.includes(touchMenuRepo.full_name);
              return (
	                <button
	                  role="menuitem"
	                  key={p.id}
	                  onClick={() => {
                    if (isMapped) {
                      onRemoveRepoFromTag(p.id, touchMenuRepo.full_name);
                    } else {
                      onAddProjectTag(p.name, touchMenuRepo.full_name);
                    }
                    setTouchMenuRepo(null);
                  }}
                  className={`w-full text-left px-3.5 py-1.5 hover:bg-[#007acc] hover:text-white transition-colors flex items-center justify-between cursor-pointer ${
                    isMapped ? "text-emerald-400 font-bold" : "text-gray-400"
                  }`}
                >
                  <span className="break-words pr-1">{p.name}</span>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                </button>
	              );
	            })}
	          </div>
	        </div>
	      )}
    </div>
  );
}
