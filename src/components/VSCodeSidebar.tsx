import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  Hash,
  Search,
  FolderGit,
  Tags,
  Compass,
  CircleDot,
  X
} from "lucide-react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Repo, Issue, PullRequest, ProjectTag } from "../types";
import { ProjectAssignmentDialog } from "./WorkspacePrimitives";

type SidebarContextMenu =
  | { type: "repo"; x: number; y: number; repoFullName: string }
  | { type: "repositories"; x: number; y: number }
  | { type: "projects"; x: number; y: number }
  | { type: "project"; x: number; y: number; projectId: string };

interface VSCodeSidebarProps {
  activeView: "explorer" | "sync" | "settings";
  repos: Repo[];
  projectTags: ProjectTag[];
  syncTimestamps: Record<string, string>;
  isSyncing: Record<string, boolean>;
  onSelectIssue: (owner: string, repoName: string, issue: Issue) => void;
  onSelectPR: (owner: string, repoName: string, pr: PullRequest) => void;
  onAddProjectTag: (tagName: string, repoFullName: string) => void;
  onCreateProjectWithRepo: (name: string, repoFullName: string) => void;
  onRemoveRepoFromTag: (tagId: string, repoFullName: string) => void;
  onDeleteProjectTag: (tagId: string) => void;
  openRepo: (repoFullName: string) => void;
  openProject: (projectId: string) => void;
  openRepositoryExplorer: () => void;
  openProjectsDashboard: () => void;
  openTabs: (id: string, type: "issue" | "pr" | "settings" | "welcome", title: string, owner?: string, repo?: string, number?: number) => void;
  activeTabId: string;
  onClose?: () => void;
  selectedProjectFilter: string;
  activeProjectDashboardId: string | null;
  onSelectProjectFilter: (filterId: string) => void;
}

export default function VSCodeSidebar({
  activeView,
  repos,
  projectTags,
  syncTimestamps,
  isSyncing,
  onSelectIssue,
  onSelectPR,
  onAddProjectTag,
  onCreateProjectWithRepo,
  onRemoveRepoFromTag,
  onDeleteProjectTag,
  openRepo,
  openProject,
  openRepositoryExplorer,
  openProjectsDashboard,
  openTabs,
  activeTabId,
  onClose,
  selectedProjectFilter,
  activeProjectDashboardId,
  onSelectProjectFilter
}: VSCodeSidebarProps) {
  // Navigation / Collapsible section states
  const [reposExpanded, setReposExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // Track expanded repositories
  const [expandedRepos, setExpandedRepos] = useState<Record<string, boolean>>({});
  // Track expanded issues folder vs PR folder inside repos
  const [expandedSubfolders, setExpandedSubfolders] = useState<Record<string, boolean>>({});

  // Loaded child contents per repo
  const [repoIssues, setRepoIssues] = useState<Record<string, Issue[]>>({});
  const [repoPRs, setRepoPRs] = useState<Record<string, PullRequest[]>>({});
  const [loadingContent, setLoadingContent] = useState<Record<string, boolean>>({});

  const normalizeFullName = (fullName: string) => fullName.replace(/\//g, "-");

  // Right-click Context Menu state
  const [contextMenu, setContextMenu] = useState<SidebarContextMenu | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<
    { type: "repo"; repo: Repo } | { type: "project"; project: ProjectTag } | null
  >(null);

  // Handle right click menu cleanup
  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const loadRepoContent = async (repo: Repo) => {
    if (loadingContent[repo.full_name]) {
      return;
    }
    setLoadingContent((prev) => ({ ...prev, [repo.full_name]: true }));
    try {
      const [issuesRes, prsRes] = await Promise.all([
        fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/issues`),
        fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/prs`),
      ]);
      if (!issuesRes.ok) {
        throw new Error(`Issue list failed for ${repo.full_name} with HTTP ${issuesRes.status}`);
      }
      if (!prsRes.ok) {
        throw new Error(`PR list failed for ${repo.full_name} with HTTP ${prsRes.status}`);
      }
      const issues = await issuesRes.json() as Issue[];
      const prs = await prsRes.json() as PullRequest[];
      if (!Array.isArray(issues)) {
        throw new Error(`Issue list for ${repo.full_name} was not an array.`);
      }
      if (!Array.isArray(prs)) {
        throw new Error(`PR list for ${repo.full_name} was not an array.`);
      }

      setRepoIssues((prev) => ({ ...prev, [repo.full_name]: issues }));
      setRepoPRs((prev) => ({ ...prev, [repo.full_name]: prs }));
    } finally {
      setLoadingContent((prev) => ({ ...prev, [repo.full_name]: false }));
    }
  };

  // Fetch issues & PRs when a repository folder is expanded.
  const handleToggleRepo = async (owner: string, repoName: string, fullName: string) => {
    const isNowExpanded = !expandedRepos[fullName];
    setExpandedRepos((prev) => ({ ...prev, [fullName]: isNowExpanded }));

    if (isNowExpanded && !repoIssues[fullName]) {
      const repo = repos.find((item) => item.full_name === fullName);
      if (!repo || repo.owner.login !== owner || repo.name !== repoName) {
        throw new Error(`Repository ${fullName} was not available for sidebar loading.`);
      }
      await loadRepoContent(repo);
    }
  };

  const handleToggleSubfolder = (fullName: string, type: "issues" | "prs") => {
    const key = `${fullName}-${type}`;
    setExpandedSubfolders((prev) => ({ ...prev, [key]: !prev[key] }));
    const repo = repos.find((item) => item.full_name === fullName);
    if (!repo) {
      throw new Error(`Repository ${fullName} was not available for sidebar subfolder loading.`);
    }
    if (!repoIssues[fullName] && !loadingContent[fullName]) {
      void loadRepoContent(repo);
    }
  };

  const handleRightClickRepo = (e: React.MouseEvent, repoFullName: string) => {
    e.preventDefault();
    setContextMenu({
      type: "repo",
      x: e.clientX,
      y: e.clientY,
      repoFullName
    });
  };

  const openSectionContextMenu = (e: React.MouseEvent, type: "repositories" | "projects") => {
    e.preventDefault();
    setContextMenu({
      type,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const openProjectContextMenu = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      type: "project",
      x: e.clientX,
      y: e.clientY,
      projectId,
    });
  };

  // Helper relative time reporter
  const formatTimeAgo = (isoString: string | null) => {
    if (isoString == null) {
      return "No commits";
    }
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const filteredRepos = repos.filter((repo) => {
    const matchesSearch =
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description || "").toLowerCase().includes(searchQuery.toLowerCase());

    let matchesProject = true;
    if (selectedProjectFilter !== "all") {
      const proj = projectTags.find((t) => t.id === selectedProjectFilter);
      matchesProject = proj ? proj.repos.includes(repo.full_name) : false;
    }

    return matchesSearch && matchesProject;
  });

  const expandAllRepos = () => {
    setReposExpanded(true);
    setExpandedRepos(Object.fromEntries(filteredRepos.map((repo) => [repo.full_name, true])));
  };

  const collapseAllRepos = () => {
    setExpandedRepos({});
    setExpandedSubfolders({});
  };

  const expandAllProjects = () => {
    setProjectsExpanded(true);
    setExpandedProjects(Object.fromEntries(projectTags.map((tag) => [tag.id, true])));
  };

  const collapseAllProjects = () => {
    setExpandedProjects(Object.fromEntries(projectTags.map((tag) => [tag.id, false])));
  };

  const contextMenuStyle = (x: number, y: number) => ({
    top: `${Math.max(8, Math.min(y, window.innerHeight - 220))}px`,
    left: `${Math.max(8, Math.min(x, window.innerWidth - 240))}px`
  });

  return (
    <div className="w-full h-full bg-[#252526] flex flex-col select-none text-[#cccccc] relative font-sans">
      {/* Sidebar Header */}
      <div className="px-4 py-3 flex justify-between items-center border-b border-[#3e3e3e] bg-[#2d2d2d] shrink-0">
        <span className="text-[11px] font-bold tracking-widest text-[#bbbbbb] uppercase font-sans">
          {activeView === "explorer"
            ? "EXPLORER"
            : activeView === "sync"
            ? "SYNC LOGS"
            : "SETTINGS CONFIG"}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-[#3c3c3c] flex items-center justify-center animate-fade-in"
            title="Collapse Side Bar"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {activeView === "explorer" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Quick Find Search box */}
          <div className="p-2 shrink-0">
            <div className="relative flex items-center bg-[#3c3c3c] rounded border border-[#3e3e3e] focus-within:border-[#007acc] text-xs">
              <Search size={13} className="text-gray-400 ml-2 shrink-0" />
              <input
                type="text"
                placeholder="Filter repositories (e.g. react)"
                className="w-full bg-transparent border-none outline-none py-1 px-2 text-white placeholder-gray-500 font-sans text-xs focus:ring-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Tree Navigation Contents */}
          <div className="flex-1 flex flex-col min-h-0 text-xs">
            <PanelGroup orientation="vertical">
              <Panel defaultSize={55} minSize={20} collapsible={true} className="flex flex-col min-h-0">
                {/* 1. ALL REPOSITORIES ACCORDION PANEL */}
                <div className={`flex flex-col h-full border-b border-[#3e3e3e] overflow-hidden ${reposExpanded ? "flex-1" : "shrink-0"}`}>
              <div
                data-testid="sidebar-all-repos-header"
                onClick={() => setReposExpanded(!reposExpanded)}
                onContextMenu={(event) => openSectionContextMenu(event, "repositories")}
                className="flex items-center justify-between py-1.5 px-2.5 bg-[#37373d] text-white text-xs cursor-pointer select-none font-bold shrink-0"
                title="Right-click for repository tree actions"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-300 w-3 text-center">{reposExpanded ? "▼" : "▶"}</span>
                  <span className="tracking-wider uppercase text-[11px] font-bold">ALL REPOS</span>
                </div>
                <Compass size={12} className="text-gray-300" />
              </div>

              {reposExpanded && (
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 space-y-0.5 custom-scrollbar">
                  {filteredRepos.length === 0 ? (
                    <div className="text-gray-500 italic px-6 py-2">No matching repositories found.</div>
                  ) : (
                    filteredRepos.map((repo) => {
                      const isExpanded = !!expandedRepos[repo.full_name];
                      const repoProjects = projectTags.filter((tag) =>
                        tag.repos.includes(repo.full_name),
                      );

                      return (
                        <div key={repo.id} className="relative select-none">
                          {/* Repo Folder Trigger */}
                          <div
                            data-testid={`sidebar-repo-${normalizeFullName(repo.full_name)}`}
                            onContextMenu={(e) => handleRightClickRepo(e, repo.full_name)}
                            onClick={() =>
                              handleToggleRepo(repo.owner.login, repo.name, repo.full_name)
                            }
                            className={`py-1.5 pr-2.5 pl-4 hover:bg-[#2a2d2e] cursor-pointer group ${
                              isExpanded ? "text-white" : "text-gray-400"
                            }`}
                            title="Right-click for repository actions"
                          >
                            <div className="flex min-w-0 items-start gap-2">
                              <span className="text-[#858585] shrink-0">
                                {isExpanded ? (
                                  <FolderOpen size={14} className="text-[#007acc]" />
                                ) : (
                                  <Folder size={14} className="text-gray-500" />
                                )}
                              </span>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div
                                  className="font-mono break-all text-[12px] font-medium transition-colors hover:text-white"
                                  title={repo.full_name}
                                >
                                  {repo.full_name}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-gray-500">
                                  <span title={`Latest commit ${repo.latest_commit_at}`}>
                                    Latest commit {formatTimeAgo(repo.latest_commit_at)}
                                  </span>
                                  {repoProjects.map((tag) => (
                                    <button
                                      key={tag.id}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openProject(tag.id);
                                      }}
                                      className="rounded border px-1.5 py-0.5 text-[9.5px] font-semibold"
                                      style={{
                                        backgroundColor: `${tag.color}1f`,
                                        borderColor: `${tag.color}66`,
                                        color: tag.color,
                                      }}
                                      title={`Open ${tag.name}`}
                                    >
                                      {tag.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Nested Issue/PR Contents under expanded repository */}
	                          {isExpanded && (
	                            <div className="pl-4 border-l border-gray-700/60 ml-5 my-0.5 space-y-0.5">
	                              {loadingContent[repo.full_name] && (
	                                <div className="text-gray-500 italic py-1 px-3">Loading directory...</div>
	                              )}
	                                  {/* Subfolder: Issues */}
	                                  <div>
                                    <div
                                      data-testid={`sidebar-subfolder-${normalizeFullName(repo.full_name)}-issues`}
                                      onClick={() => handleToggleSubfolder(repo.full_name, "issues")}
                                      className="flex items-center gap-2.5 py-1 px-2.5 hover:bg-[#2a2d2e] cursor-pointer text-gray-400 hover:text-white"
                                    >
                                      {expandedSubfolders[`${repo.full_name}-issues`] ? (
                                        <ChevronDown size={12} />
                                      ) : (
                                        <ChevronRight size={12} />
                                      )}
                                      <FolderGit size={12} className="text-sky-500 shrink-0" />
                                      <span className="font-mono font-medium">issues ({(repoIssues[repo.full_name] || []).length})</span>
                                    </div>

                                    {expandedSubfolders[`${repo.full_name}-issues`] && (
                                      <div className="pl-6 border-l border-gray-800 ml-4.5 space-y-0.5 py-0.5">
	                                        {loadingContent[repo.full_name] ? (
	                                          <div className="text-gray-600 italic py-1 px-3 text-[11px]">
	                                            Loading issues...
	                                          </div>
	                                        ) : (repoIssues[repo.full_name] || []).length === 0 ? (
	                                          <div className="text-gray-600 italic py-1 px-3 text-[11px]">
	                                            No issues of this state cached.
                                          </div>
                                        ) : (
                                          (repoIssues[repo.full_name] || []).map((issue) => {
                                            const isActive = activeTabId === `issue-${repo.full_name}-${issue.number}`;
                                            return (
                                              <div
                                                data-testid={`sidebar-issue-${normalizeFullName(repo.full_name)}-${issue.number}`}
                                                key={issue.number}
                                                onClick={() => {
                                                  onSelectIssue(repo.owner.login, repo.name, issue);
                                                  openTabs(
                                                    `issue-${repo.full_name}-${issue.number}`,
                                                    "issue",
                                                    `#${issue.number} ${issue.title}`,
                                                    repo.owner.login,
                                                    repo.name,
                                                    issue.number
                                                  );
                                                }}
                                                className={`flex items-center gap-2 py-1 px-2.5 hover:bg-[#2a2d2e] cursor-pointer rounded-sm group transition-colors ${
                                                  isActive
                                                    ? "bg-[#37373d] text-white border-l-2 border-[#007acc]"
                                                    : "text-gray-400 hover:text-gray-200"
                                                }`}
                                              >
                                                {issue.state === "open" ? (
                                                  <CircleDot size={12} className="text-emerald-500 shrink-0" />
                                                ) : (
                                                  <CheckCircle2 size={12} className="text-purple-400 shrink-0" />
                                                )}
                                                <span className="break-words font-mono text-[11.5px]" title={issue.title}>
                                                  <span className="text-gray-500 group-hover:text-gray-300 font-semibold mr-1.5">#{issue.number}</span>
                                                  {issue.title}
                                                </span>
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Subfolder: PRs */}
                                  <div>
                                    <div
                                      data-testid={`sidebar-subfolder-${normalizeFullName(repo.full_name)}-prs`}
                                      onClick={() => handleToggleSubfolder(repo.full_name, "prs")}
                                      className="flex items-center gap-2.5 py-1 px-2.5 hover:bg-[#2a2d2e] cursor-pointer text-gray-400 hover:text-white"
                                    >
                                      {expandedSubfolders[`${repo.full_name}-prs`] ? (
                                        <ChevronDown size={12} />
                                      ) : (
                                        <ChevronRight size={12} />
                                      )}
                                      <GitPullRequest size={12} className="text-purple-500 shrink-0" />
                                      <span className="font-mono font-medium">pull_requests ({(repoPRs[repo.full_name] || []).length})</span>
                                    </div>

                                    {expandedSubfolders[`${repo.full_name}-prs`] && (
                                      <div className="pl-6 border-l border-gray-800 ml-4.5 space-y-0.5 py-0.5">
	                                        {loadingContent[repo.full_name] ? (
	                                          <div className="text-gray-600 italic py-1 px-3 text-[11px]">
	                                            Loading PRs...
	                                          </div>
	                                        ) : (repoPRs[repo.full_name] || []).length === 0 ? (
	                                          <div className="text-gray-600 italic py-1 px-3 text-[11px]">
	                                            No pull requests listed.
                                          </div>
                                        ) : (
                                          (repoPRs[repo.full_name] || []).map((pr) => {
                                            const isActive = activeTabId === `pr-${repo.full_name}-${pr.number}`;
                                            return (
                                              <div
                                                data-testid={`sidebar-pr-${normalizeFullName(repo.full_name)}-${pr.number}`}
                                                key={pr.number}
                                                onClick={() => {
                                                  onSelectPR(repo.owner.login, repo.name, pr);
                                                  openTabs(
                                                    `pr-${repo.full_name}-${pr.number}`,
                                                    "pr",
                                                    `#${pr.number} ${pr.title}`,
                                                    repo.owner.login,
                                                    repo.name,
                                                    pr.number
                                                  );
                                                }}
                                                className={`flex items-center gap-2 py-1 px-2.5 hover:bg-[#2a2d2e] cursor-pointer rounded-sm group transition-colors ${
                                                  isActive
                                                    ? "bg-[#37373d] text-white border-l-2 border-[#007acc]"
                                                    : "text-gray-400 hover:text-gray-200"
                                                }`}
                                              >
                                                <GitPullRequest size={12} className="text-emerald-500 shrink-0" />
                                                <span className="break-words font-mono text-[11.5px]" title={pr.title}>
                                                  <span className="text-gray-500 group-hover:text-gray-300 font-semibold mr-1.5">#{pr.number}</span>
                                                  {pr.title}
                                                </span>

                                                {/* CI bullet feedback */}
                                                {pr.ci_status && (
                                                  <span
                                                    className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${
                                                      pr.ci_status.state === "success"
                                                        ? "bg-emerald-500"
                                                        : pr.ci_status.state === "failure"
                                                        ? "bg-red-500"
                                                        : "bg-amber-500"
                                                    }`}
                                                    title={`CI state: ${pr.ci_status.state}`}
                                                  />
                                                )}
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    )}
	                                  </div>
	                            </div>
	                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

              </Panel>

              <PanelResizeHandle className="h-[4px] bg-[#1a1a1c]/80 hover:bg-[#007acc] active:bg-[#007acc] transition-colors cursor-row-resize select-none shrink-0" />

              <Panel defaultSize={45} minSize={20} collapsible={true} className="flex flex-col min-h-0">
                {/* 2. PROJECT TAGS GROUPING ACCORDION PANEL */}
                <div className={`flex flex-col h-full border-b border-[#3e3e3e] overflow-hidden ${projectsExpanded ? "flex-1" : "shrink-0"}`}>
              <div
                data-testid="sidebar-projects-header"
                onClick={() => setProjectsExpanded(!projectsExpanded)}
                onContextMenu={(event) => openSectionContextMenu(event, "projects")}
                className="flex items-center justify-between py-1 px-2.5 bg-[#37373d] text-white text-xs cursor-pointer select-none font-bold shrink-0"
                title="Right-click for project tree actions"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-300 w-3 text-center">{projectsExpanded ? "▼" : "▶"}</span>
                  <span className="tracking-wider uppercase text-[11px] font-bold">PROJECTS</span>
                </div>
              </div>

              {projectsExpanded && (
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 space-y-1 custom-scrollbar">
                  {projectTags.length === 0 ? (
                    <div className="text-gray-500 italic px-6 py-2">No projects yet.</div>
                  ) : (
                    projectTags.map((tag) => {
                      const isProjectOpen = expandedProjects[tag.id] ?? true;

                      return (
                      <div key={tag.id} className="group/tag select-none mb-1">
                        <div
                          data-testid={`sidebar-project-${tag.id}`}
                          onContextMenu={(event) => openProjectContextMenu(event, tag.id)}
                          className={`flex items-center justify-between py-1 px-3 cursor-pointer rounded text-[11.5px] transition-all ${
                            activeProjectDashboardId === tag.id
                              ? "bg-[#094771] text-white border-l-2 border-[#007acc] rounded-none"
                              : "hover:bg-[#2a2d2e] text-[#cccccc]"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedProjects((current) => ({
                                  ...current,
                                  [tag.id]: !(current[tag.id] ?? true),
                                }));
                              }}
                              className="text-[10px] text-gray-400 w-3 text-center hover:text-white cursor-pointer"
                              title={isProjectOpen ? "Hide project repositories" : "Show project repositories"}
                            >
                              {isProjectOpen ? "▼" : "▶"}
                            </button>
                            <Tags size={12} style={{ color: tag.color }} className="shrink-0" />
                            <button
                              type="button"
                              onClick={() => openProject(tag.id)}
                              className="font-mono font-medium break-words text-left hover:text-white cursor-pointer"
                            >
                              {tag.name}
                            </button>
                            <span className="text-[10px] text-gray-500 shrink-0">({tag.repos.length})</span>
                          </div>
                        </div>

                        {/* List of repos inside this Tag Group Accordion */}
                        {isProjectOpen && tag.repos.length > 0 && (
                          <div className="pl-6.5 pr-2.5 space-y-0.5 border-l border-gray-800 ml-5.5 py-0.5">
                            {tag.repos.map((repoFullName) => {
                              const rInfo = repos.find((r) => r.full_name === repoFullName);
                              return (
                                <div
                                  key={repoFullName}
                                  className="flex items-center justify-between py-1 px-2 hover:bg-[#2a2d2e] rounded text-gray-400 group/rep"
                                >
                                  <div
                                    onClick={() => {
                                      if (rInfo) {
                                        handleToggleRepo(rInfo.owner.login, rInfo.name, rInfo.full_name);
                                      }
                                    }}
                                    className="font-mono text-[11px] hover:text-white break-all cursor-pointer"
                                    title={repoFullName}
                                  >
                                    {rInfo ? rInfo.name : repoFullName.split("/")[1] || repoFullName}
                                  </div>
                                  <button
                                    onClick={() => onRemoveRepoFromTag(tag.id, repoFullName)}
                                    className="opacity-0 group-hover/rep:opacity-100 text-gray-500 hover:text-red-400 transition-opacity scale-90 cursor-pointer"
                                    title={`Remove from project`}
                                  >
                                    &times;
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      );
                    })
                  )}
                </div>
              )}
                </div>
              </Panel>
            </PanelGroup>
          </div>
        </div>
      )}

      {activeView === "sync" && (
        <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e]">
          <div className="p-3 text-[11px] font-mono text-gray-300 bg-[#252526] border-b border-[#3e3e3e] select-text leading-relaxed">
            <div className="font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              GitHub Sync Log
            </div>
            Repository update times from the current session.
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar text-[11px] font-mono leading-relaxed select-text">
            <div className="text-gray-500 font-bold uppercase p-1">Repositories</div>
            {repos.map((repo) => (
              <div key={repo.id} className="p-1 px-2 bg-[#2d2d2d] rounded flex items-center justify-between">
                <span className="text-gray-300 break-all font-semibold" title={repo.full_name}>{repo.name}</span>
                <span className="text-[10px] text-gray-500 shrink-0 select-none">
                  {syncTimestamps[repo.full_name]
                    ? formatTimeAgo(syncTimestamps[repo.full_name])
                    : "Not synced"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeView === "settings" && (
        <div className="flex-1 p-4 overflow-y-auto text-xs space-y-4 leading-relaxed font-sans scrollbar-thin">
          <div className="bg-[#2d2d2d] p-3.5 rounded border border-gray-700/60 shadow-md">
            <h4 className="text-white font-semibold flex items-center gap-2 mb-2 font-mono text-sm uppercase text-sky-400 leading-snug">
              GitHub Token
            </h4>
            <p className="text-gray-300 text-[11.5px]">
              The server reads{" "}
              <code className="text-[#007acc] bg-[#1e1e1e] p-0.5 rounded font-mono text-[11px]">GITHUB_TOKEN</code>.
            </p>
            <p className="text-gray-400 mt-2 text-[11.5px]">
              If the token is absent, the server stops before serving the dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Right-click context menus */}
      {contextMenu && (() => {
        const menuClass = "fixed bg-[#1c1c1c] border border-gray-700/80 rounded shadow-2xl py-1 z-[100] w-56 text-xs select-none";
        const menuButtonClass = "w-full px-3 py-1.5 text-left text-gray-300 hover:bg-[#007acc] hover:text-white transition-colors cursor-pointer";

        if (contextMenu.type === "repositories") {
          return (
            <div
              role="menu"
              className={menuClass}
              style={contextMenuStyle(contextMenu.x, contextMenu.y)}
              onClick={(event) => event.stopPropagation()}
            >
              <button role="menuitem" type="button" onClick={() => { openRepositoryExplorer(); setContextMenu(null); }} className={menuButtonClass}>
                Open Repositories Dashboard
              </button>
              <button role="menuitem" type="button" onClick={() => { expandAllRepos(); setContextMenu(null); }} className={menuButtonClass}>
                Expand all repos
              </button>
              <button role="menuitem" type="button" onClick={() => { collapseAllRepos(); setContextMenu(null); }} className={menuButtonClass}>
                Collapse all repos
              </button>
            </div>
          );
        }

        if (contextMenu.type === "projects") {
          return (
            <div
              role="menu"
              className={menuClass}
              style={contextMenuStyle(contextMenu.x, contextMenu.y)}
              onClick={(event) => event.stopPropagation()}
            >
              <button role="menuitem" type="button" onClick={() => { openProjectsDashboard(); setContextMenu(null); }} className={menuButtonClass}>
                Open Projects Dashboard
              </button>
              <button role="menuitem" type="button" onClick={() => { expandAllProjects(); setContextMenu(null); }} className={menuButtonClass}>
                Expand all projects
              </button>
              <button role="menuitem" type="button" onClick={() => { collapseAllProjects(); setContextMenu(null); }} className={menuButtonClass}>
                Collapse all projects
              </button>
            </div>
          );
        }

        if (contextMenu.type === "project") {
          const project = projectTags.find((tag) => tag.id === contextMenu.projectId);
          if (!project) {
            throw new Error(`context menu project missing: ${contextMenu.projectId}`);
          }
          return (
            <div
              role="menu"
              className={menuClass}
              style={contextMenuStyle(contextMenu.x, contextMenu.y)}
              onClick={(event) => event.stopPropagation()}
            >
              <button role="menuitem" type="button" onClick={() => { openProject(project.id); setContextMenu(null); }} className={menuButtonClass}>
                Open Project Dashboard
              </button>
              <button role="menuitem" type="button" onClick={() => { setExpandedProjects((current) => ({ ...current, [project.id]: true })); setContextMenu(null); }} className={menuButtonClass}>
                Expand project
              </button>
              <button role="menuitem" type="button" onClick={() => { setExpandedProjects((current) => ({ ...current, [project.id]: false })); setContextMenu(null); }} className={menuButtonClass}>
                Collapse project
              </button>
              <button
                role="menuitem"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setAssignmentTarget({ type: "project", project });
                  setContextMenu(null);
                }}
                onClick={() => {
                  setAssignmentTarget({ type: "project", project });
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-gray-300 hover:bg-[#007acc] hover:text-white transition-colors cursor-pointer border-t border-gray-800"
              >
                Manage Project
              </button>
            </div>
          );
        }

        const menuRepo = repos.find((repo) => repo.full_name === contextMenu.repoFullName);
        if (!menuRepo) {
          throw new Error(`context menu repo missing: ${contextMenu.repoFullName}`);
        }

        return (
          <div
            role="menu"
            className={menuClass}
            style={contextMenuStyle(contextMenu.x, contextMenu.y)}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                openRepo(contextMenu.repoFullName);
                setContextMenu(null);
              }}
              className={menuButtonClass}
            >
              Open Repo Dashboard
            </button>
            <a
              role="menuitem"
              data-testid="context-open-github"
              href={menuRepo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-3 py-1.5 text-left text-gray-300 hover:bg-[#007acc] hover:text-white transition-colors cursor-pointer"
              onClick={() => setContextMenu(null)}
            >
              Open in GitHub
            </a>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setAssignmentTarget({ type: "repo", repo: menuRepo });
                setContextMenu(null);
              }}
              className={menuButtonClass}
            >
              Manage Projects
            </button>
          </div>
        );
      })()}
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
