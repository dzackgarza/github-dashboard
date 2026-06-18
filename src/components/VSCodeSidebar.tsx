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

interface VSCodeSidebarProps {
  activeView: "explorer" | "sync" | "settings";
  repos: Repo[];
  projectTags: ProjectTag[];
  syncTimestamps: Record<string, string>;
  isSyncing: Record<string, boolean>;
  onSelectIssue: (owner: string, repoName: string, issue: Issue) => void;
  onSelectPR: (owner: string, repoName: string, pr: PullRequest) => void;
  onAddProjectTag: (tagName: string, repoFullName: string) => void;
  onRemoveRepoFromTag: (tagId: string, repoFullName: string) => void;
  openProject: (projectId: string) => void;
  openTabs: (id: string, type: "issue" | "pr" | "settings" | "welcome", title: string, owner?: string, repo?: string, number?: number) => void;
  activeTabId: string;
  onClose?: () => void;
  selectedProjectFilter: string;
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
  onRemoveRepoFromTag,
  openProject,
  openTabs,
  activeTabId,
  onClose,
  selectedProjectFilter,
  onSelectProjectFilter
}: VSCodeSidebarProps) {
  // Navigation / Collapsible section states
  const [reposExpanded, setReposExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Track expanded repositories
  const [expandedRepos, setExpandedRepos] = useState<Record<string, boolean>>({});
  // Track expanded issues folder vs PR folder inside repos
  const [expandedSubfolders, setExpandedSubfolders] = useState<Record<string, boolean>>({});

  // Loaded child contents per repo
  const [repoIssues, setRepoIssues] = useState<Record<string, Issue[]>>({});
  const [repoPRs, setRepoPRs] = useState<Record<string, PullRequest[]>>({});
  const [loadingContent, setLoadingContent] = useState<Record<string, boolean>>({});

  // Right-click Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    repoFullName: string;
  } | null>(null);

  // Handle right click menu cleanup
  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Fetch issues & PRs when a repository folder is expanded of a repo
  const handleToggleRepo = async (owner: string, repoName: string, fullName: string) => {
    const isNowExpanded = !expandedRepos[fullName];
    setExpandedRepos((prev) => ({ ...prev, [fullName]: isNowExpanded }));

    if (isNowExpanded && !repoIssues[fullName]) {
      setLoadingContent((prev) => ({ ...prev, [fullName]: true }));
      try {
        const issuesRes = await fetch(`/api/github/repos/${owner}/${repoName}/issues`);
        const prsRes = await fetch(`/api/github/repos/${owner}/${repoName}/prs`);
        const issues = await issuesRes.json();
        const prs = await prsRes.json();

        setRepoIssues((prev) => ({ ...prev, [fullName]: issues }));
        setRepoPRs((prev) => ({ ...prev, [fullName]: prs }));
      } catch (err) {
        console.error("Error backing folder tree elements", err);
      } finally {
        setLoadingContent((prev) => ({ ...prev, [fullName]: false }));
      }
    }
  };

  const handleToggleSubfolder = (fullName: string, type: "issues" | "prs") => {
    const key = `${fullName}-${type}`;
    setExpandedSubfolders((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRightClickRepo = (e: React.MouseEvent, repoFullName: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      repoFullName
    });
  };

  // Helper sync reporter
  const formatTimeAgo = (isoString?: string) => {
    if (!isoString) return "Never synced";
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
      (repo.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.language || "").toLowerCase().includes(searchQuery.toLowerCase());

    let matchesProject = true;
    if (selectedProjectFilter !== "all") {
      const proj = projectTags.find((t) => t.id === selectedProjectFilter);
      matchesProject = proj ? proj.repos.includes(repo.full_name) : false;
    }

    return matchesSearch && matchesProject;
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
                onClick={() => setReposExpanded(!reposExpanded)}
                className="flex items-center justify-between py-1.5 px-2.5 bg-[#37373d] text-white text-xs cursor-pointer select-none font-bold shrink-0"
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
                      const syncTime = syncTimestamps[repo.full_name];
                      const syncing = !!isSyncing[repo.full_name];

                      return (
                        <div key={repo.id} className="relative select-none">
                          {/* Repo Folder Trigger */}
                          <div
                            onContextMenu={(e) => handleRightClickRepo(e, repo.full_name)}
                            onClick={() =>
                              handleToggleRepo(repo.owner.login, repo.name, repo.full_name)
                            }
                            className={`flex items-center justify-between py-1.5 pr-2.5 pl-4 hover:bg-[#2a2d2e] cursor-pointer group ${
                              isExpanded ? "text-white" : "text-gray-400"
                            }`}
                            title="Right-click to attach tagging groups or check sync histories"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[#858585] shrink-0">
                                {isExpanded ? (
                                  <FolderOpen size={14} className="text-[#007acc]" />
                                ) : (
                                  <Folder size={14} className="text-gray-500" />
                                )}
                              </span>
                              <span className="font-mono break-all text-[12px] font-medium transition-colors hover:text-white" title={repo.full_name}>
                                {repo.name}
                              </span>
                              {repo.private && (
                                <span className="text-[9px] bg-red-950 text-red-400 border border-red-900 rounded px-1 scale-90">
                                  Private
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                              <span
                                className="text-[10px] font-mono text-gray-500"
                                title={`Synced ${formatTimeAgo(syncTime)}`}
                              >
                                {syncing ? "Syncing..." : formatTimeAgo(syncTime)}
                              </span>
                            </div>
                          </div>

                          {/* Nested Issue/PR Contents under expanded repository */}
                          {isExpanded && (
                            <div className="pl-4 border-l border-gray-700/60 ml-5 my-0.5 space-y-0.5">
                              {loadingContent[repo.full_name] ? (
                                <div className="text-gray-500 italic py-1 px-3">Loading directory...</div>
                              ) : (
                                <>
                                  {/* Subfolder: Issues */}
                                  <div>
                                    <div
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
                                        {(repoIssues[repo.full_name] || []).length === 0 ? (
                                          <div className="text-gray-600 italic py-1 px-3 text-[11px]">
                                            No issues of this state cached.
                                          </div>
                                        ) : (
                                          (repoIssues[repo.full_name] || []).map((issue) => {
                                            const isActive = activeTabId === `issue-${repo.full_name}-${issue.number}`;
                                            return (
                                              <div
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
                                        {(repoPRs[repo.full_name] || []).length === 0 ? (
                                          <div className="text-gray-600 italic py-1 px-3 text-[11px]">
                                            No pull requests listed.
                                          </div>
                                        ) : (
                                          (repoPRs[repo.full_name] || []).map((pr) => {
                                            const isActive = activeTabId === `pr-${repo.full_name}-${pr.number}`;
                                            return (
                                              <div
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
                                </>
                              )}
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
                onClick={() => setProjectsExpanded(!projectsExpanded)}
                className="flex items-center justify-between py-1 px-2.5 bg-[#37373d] text-white text-xs cursor-pointer select-none font-bold shrink-0"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-300 w-3 text-center">{projectsExpanded ? "▼" : "▶"}</span>
                  <span className="tracking-wider uppercase text-[11px] font-bold">PROJECTS</span>
                </div>
              </div>

              {projectsExpanded && (
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 space-y-1 custom-scrollbar">
                  {projectTags.length === 0 ? (
                    <div className="text-gray-500 italic px-6 py-2">Create a project from the command palette.</div>
                  ) : (
                    projectTags.map((tag) => (
                      <div key={tag.id} className="group/tag select-none mb-1">
                        <div
                          onClick={() => openProject(tag.id)}
                          className={`flex items-center justify-between py-1 px-4 cursor-pointer rounded text-[11.5px] transition-all ${
                            selectedProjectFilter === tag.id
                              ? "bg-[#094771] text-white border-l-2 border-[#007acc] rounded-none"
                              : "hover:bg-[#2a2d2e] text-[#cccccc]"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Tags size={12} style={{ color: tag.color }} className="shrink-0" />
                            <span className="font-mono font-medium break-words">{tag.name}</span>
                            <span className="text-[10px] text-gray-500 shrink-0">({tag.repos.length})</span>
                          </div>
                        </div>

                        {/* List of repos inside this Tag Group Accordion */}
                        {tag.repos.length > 0 && (
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
                    ))
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
                  {formatTimeAgo(syncTimestamps[repo.full_name])}
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

      {/* PopUp Custom Right-Click Context Menu for Projects Management */}
      {contextMenu && (
        <div
          className="fixed bg-[#1c1c1c] border border-gray-700/80 rounded shadow-2xl py-1 z-[100] w-56 text-xs select-none"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-gray-800 text-[10px] font-mono text-gray-500 uppercase leading-none font-semibold">
            Tag Repositories to Project
          </div>
          {projectTags.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 italic">Create a project from the command palette.</div>
          ) : (
            projectTags.map((tag) => {
              const isAdded = tag.repos.includes(contextMenu.repoFullName);
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    onAddProjectTag(tag.name, contextMenu.repoFullName);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-[#007acc] hover:text-white transition-colors flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="break-words">{tag.name}</span>
                  </div>
                  {isAdded && <span className="text-[10px] text-emerald-400 font-bold shrink-0">Added</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
