import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  FolderGit2,
  AlertCircle,
  GitPullRequest,
  RefreshCw,
  Clock,
  CircleDot,
  Search,
  ChevronRight,
  Tag,
  FolderOpen
} from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import { Issue, PullRequest, Repo, Label } from "../types";
import { invariant } from "../utils/invariant";

type InboxActivityItem = (Issue | PullRequest) & {
  repoName: string;
  repoFullName: string;
  compositeId: string;
  type: "issue" | "pr";
};

interface InboxCachePayload {
  repoSignature: string;
  cachedAt: string;
  items: InboxActivityItem[];
}

const INBOX_CACHE_PREFIX = "github_dashboard_inbox_cache";

function getInboxItemTestId(item: InboxActivityItem): string {
  return `inbox-item-${item.type}-${item.repoFullName.replace(/\//g, "-")}-${item.number}`;
}

function getInboxCacheKey(login: string) {
  return `${INBOX_CACHE_PREFIX}:${login}`;
}

function getRepoSignature(repos: Repo[]) {
  return repos
    .map((repo) => `${repo.full_name}:${repo.latest_commit_at}`)
    .sort()
    .join("|");
}

function readInboxCache(cacheKey: string, repoSignature: string): InboxCachePayload | null {
  const rawCache = localStorage.getItem(cacheKey);
  if (!rawCache) {
    return null;
  }

  const parsed = JSON.parse(rawCache) as InboxCachePayload;
  if (parsed.repoSignature !== repoSignature || !Array.isArray(parsed.items)) {
    localStorage.removeItem(cacheKey);
    return null;
  }

  return {
    ...parsed,
    items: parsed.items.filter((item) => item.state === "open"),
  };
}

function writeInboxCache(cacheKey: string, repoSignature: string, items: InboxActivityItem[]) {
  const payload: InboxCachePayload = {
    repoSignature,
    cachedAt: new Date().toISOString(),
    items,
  };
  localStorage.setItem(cacheKey, JSON.stringify(payload));
  return payload;
}

export default function WelcomeDashboard() {
  const {
    repos,
    projectTags,
    githubUser,
    openRepositoryExplorer,
    openProjectsDashboard,
    openProject,
    openTabs
  } = useWorkspace();

  // Selected filters inside the unified inbox
  const [inboxQuery, setInboxQuery] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"all" | "issues" | "prs">("all");
  const [inboxLabelFilter, setInboxLabelFilter] = useState("all");

  // Flat list of combined issue and pull request activity items
  const [activityItems, setActivityItems] = useState<InboxActivityItem[]>([]);
  const [isLatchingDetails, setIsLatchingDetails] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ done: 0, total: 0 });
  const [inboxCacheLoadedAt, setInboxCacheLoadedAt] = useState<string | null>(null);
  const [isShowingCachedInbox, setIsShowingCachedInbox] = useState(false);

  // Stream data from each of the active repos in parallel using our ETag efficient endpoints
  useEffect(() => {
    if (!repos || repos.length === 0 || !githubUser?.login) {
      setActivityItems([]);
      setInboxCacheLoadedAt(null);
      setIsShowingCachedInbox(false);
      return;
    }

    let isMounted = true;
    const repoSignature = getRepoSignature(repos);
    const cacheKey = getInboxCacheKey(githubUser.login);

    try {
      const cachedInbox = readInboxCache(cacheKey, repoSignature);
      if (cachedInbox) {
        setActivityItems(cachedInbox.items);
        setInboxCacheLoadedAt(cachedInbox.cachedAt);
        setIsShowingCachedInbox(true);
      } else {
        setActivityItems([]);
        setInboxCacheLoadedAt(null);
        setIsShowingCachedInbox(false);
      }
    } catch (err) {
      localStorage.removeItem(cacheKey);
      setActivityItems([]);
      setInboxCacheLoadedAt(null);
      setIsShowingCachedInbox(false);
      console.error("Inbox cache could not be read", err);
    }

    setIsLatchingDetails(true);
    setFetchProgress({ done: 0, total: repos.length });

    const accumIssues: InboxActivityItem[] = [];
    const accumPRs: InboxActivityItem[] = [];
    let completed = 0;

    const pullAllRepoData = async () => {
      // Execute fetches in batches or parallel
      const fetchPromises = repos.map(async (repo) => {
        try {
          const [owner, name] = repo.full_name.split("/");
          
          // 1. Fetch issues
          const issuesRes = await fetch(`/api/github/repos/${owner}/${name}/issues`);
          if (issuesRes.ok) {
              const issuesData = await issuesRes.json();
            if (Array.isArray(issuesData)) {
              issuesData.forEach((issue: Issue) => {
                accumIssues.push({
                  ...issue,
                  repoName: repo.name,
                  repoFullName: repo.full_name,
                  compositeId: `issue-${repo.full_name}-${issue.number}`,
                  type: "issue"
                });
              });
            }
          }

          // 2. Fetch PRs
          const prsRes = await fetch(`/api/github/repos/${owner}/${name}/prs`);
          if (prsRes.ok) {
          const prsData = await prsRes.json();
            if (Array.isArray(prsData)) {
              prsData.forEach((pr: PullRequest) => {
                accumPRs.push({
                  ...pr,
                  repoName: repo.name,
                  repoFullName: repo.full_name,
                  compositeId: `pr-${repo.full_name}-${pr.number}`,
                  type: "pr"
                } as InboxActivityItem);
              });
            }
          }
        } catch (err) {
          console.error(`Error background parsing cache details for ${repo.full_name}`, err);
        } finally {
          if (isMounted) {
            completed++;
            setFetchProgress({ done: completed, total: repos.length });
          }
        }
      });

      await Promise.all(fetchPromises);

      if (isMounted) {
        // Sort items by creation timestamp descending (most recent first)
        const combined = [...accumIssues, ...accumPRs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const cachePayload = writeInboxCache(cacheKey, repoSignature, combined);
        setActivityItems(combined);
        setInboxCacheLoadedAt(cachePayload.cachedAt);
        setIsShowingCachedInbox(false);
        setIsLatchingDetails(false);
      }
    };

    pullAllRepoData();

    return () => {
      isMounted = false;
    };
  }, [repos, githubUser?.login]);

  // Compute profile aggregations
  const totalStars = useMemo(() => {
    return repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  }, [repos]);

  const inboxLabels = useMemo(() => {
    const labelsByName = new Map<string, Label>();
    activityItems.forEach((item) => {
      item.labels.forEach((label) => {
        labelsByName.set(label.name, label);
      });
    });
    return [...labelsByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [activityItems]);

  // Inbox filters
  const processedInboxItems = useMemo(() => {
    return activityItems.filter((item) => {
      // Search text query match
      const rawText = `${item.title} ${item.repoFullName} ${item.number} ${item.user?.login || ""}`.toLowerCase();
      const matchesSearch = rawText.includes(inboxQuery.toLowerCase());

      // Segment filters
      let matchesSegment = true;
      if (inboxFilter === "issues") {
        matchesSegment = item.type === "issue";
      } else if (inboxFilter === "prs") {
        matchesSegment = item.type === "pr";
      }

      const matchesLabel = inboxLabelFilter === "all" ||
        item.labels.some((label) => label.name === inboxLabelFilter);

      return matchesSearch && matchesSegment && matchesLabel;
    });
  }, [activityItems, inboxQuery, inboxFilter, inboxLabelFilter]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#1e1e19] text-[#cccccc] font-sans h-full scrollbar-thin select-text">
      
      {/* 1. Profile Banner Room */}
      <div className="bg-gradient-to-r from-[#202022] to-[#1a1a1b] border-b border-[#2d2d2d] px-6 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 bg-gray-800 rounded border border-gray-700 flex items-center justify-center shrink-0">
            <FolderGit2 size={24} className="text-[#007acc]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white flex items-center gap-2 break-words">
              <span>{githubUser?.name || githubUser?.login || "Guest Developer Workspace"}</span>
            </h1>
            <p className="text-xs text-gray-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>@{githubUser?.login || "anonymous"}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:self-center shrink-0 select-none">
          {isLatchingDetails && (
            <div className="text-xs bg-[#1a1a1c] border border-[#2d2d2d] px-2 py-1 rounded text-blue-400 font-mono flex items-center gap-1.5 animate-pulse">
              <RefreshCw size={11} className="animate-spin text-blue-500" />
              <span>
                {isShowingCachedInbox ? "Updating cached Inbox" : "Fetching Inbox"} {fetchProgress.done}/{fetchProgress.total}
              </span>
            </div>
          )}
          {isShowingCachedInbox && inboxCacheLoadedAt && (
            <div className="text-xs bg-amber-950/30 border border-amber-900 px-2 py-1 rounded text-amber-300 font-mono flex items-center gap-1.5">
              <Clock size={11} />
              <span>Cached {formatDistanceToNow(inboxCacheLoadedAt)} ago</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* 2. Top Metric KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={openRepositoryExplorer}
            className="text-left bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-sm hover:border-[#007acc] transition-colors"
          >
            <div className="flex items-center justify-between text-gray-400 pb-1 select-none">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Repos</span>
              <FolderGit2 size={15} className="text-blue-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1">{repos.length}</div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              Branch activity indexed
            </div>
          </button>

          <button
            type="button"
            onClick={openProjectsDashboard}
            className="text-left bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-sm hover:border-[#007acc] transition-colors"
          >
            <div className="flex items-center justify-between text-gray-400 pb-1 select-none">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Projects</span>
              <FolderOpen size={15} className="text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1">{projectTags.length}</div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              {projectTags.reduce((sum, tag) => sum + tag.repos.length, 0)} repository mappings
            </div>
          </button>

          <button
            type="button"
            onClick={() => setInboxFilter("issues")}
            className="text-left bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-sm hover:border-[#007acc] transition-colors"
          >
            <div className="flex items-center justify-between text-gray-400 pb-1 select-none">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Issues</span>
              <AlertCircle size={15} className="text-amber-500" />
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {activityItems.filter((i) => i.type === "issue" && i.state === "open").length}
            </div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              Across {new Set(activityItems.filter((i) => i.type === "issue").map((i) => i.repoName)).size} repositories
            </div>
          </button>

          <button
            type="button"
            onClick={() => setInboxFilter("prs")}
            className="text-left bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-sm hover:border-[#007acc] transition-colors"
          >
            <div className="flex items-center justify-between text-gray-400 pb-1 select-none">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">PRs</span>
              <GitPullRequest size={15} className="text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {activityItems.filter((i) => i.type === "pr" && i.state === "open").length}
            </div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              Across {new Set(activityItems.filter((i) => i.type === "pr").map((i) => i.repoName)).size} repositories
            </div>
          </button>
        </div>

        {/* 3. Main workspace layout split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Main Workspace Inbox (Col span 8) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-[#252526] rounded border border-[#3e3e3e] shadow-md overflow-hidden flex flex-col">
              
              {/* Inbox Header & Search Block */}
              <div className="p-4 bg-[#2c2c2d] border-b border-[#3e3e3e] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 select-none">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-sans flex items-center gap-1.5">
                    <Activity size={15} className="text-[#007acc]" />
                    Inbox
                  </h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">Issues and pull requests across tracked GitHub repositories</p>
                </div>

                {/* Search Inbox bar */}
                <div className="relative w-full sm:w-64">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={inboxQuery}
                    onChange={(e) => setInboxQuery(e.target.value)}
                    placeholder="Search titles, repos, authors..."
                    className="w-full bg-[#1e1e1f] border border-[#3e3e3e] focus:border-[#007acc] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
                  />
                </div>
              </div>

              {/* Segment Toggles */}
              <div className="px-4 py-2 bg-[#252526] border-b border-[#2d2d2d] flex items-center justify-between flex-wrap gap-2 text-xs select-none">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setInboxFilter("all")}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      inboxFilter === "all" ? "bg-[#3e3e42] text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    All items ({activityItems.length})
                  </button>
                  <button
                    onClick={() => setInboxFilter("issues")}
                    className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                      inboxFilter === "issues" ? "bg-amber-950/50 text-amber-300 border border-amber-900" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <AlertCircle size={11} />
                    Issues ({activityItems.filter((i) => i.type === "issue").length})
                  </button>
                  <button
                    onClick={() => setInboxFilter("prs")}
                    className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                      inboxFilter === "prs" ? "bg-purple-950/50 text-purple-300 border border-purple-900" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <GitPullRequest size={11} />
                    Pull Requests ({activityItems.filter((i) => i.type === "pr").length})
                  </button>
                </div>
                
	                <div className="flex items-center gap-2">
	                  <select
	                    data-testid="inbox-label-filter"
	                    value={inboxLabelFilter}
	                    onChange={(event) => setInboxLabelFilter(event.target.value)}
	                    className="bg-[#1e1e1f] border border-[#3e3e3e] rounded px-2 py-1 text-[11px] text-gray-300 outline-none focus:border-[#007acc]"
	                  >
	                    <option value="all">All labels</option>
	                    {inboxLabels.map((label) => (
	                      <option key={label.name} value={label.name}>{label.name}</option>
	                    ))}
	                  </select>
	                  <span className="text-[10px] font-mono text-gray-500 italic">
	                    Showing {processedInboxItems.length} items
	                  </span>
	                </div>
              </div>

              {/* Stream Contents */}
              <div className="divide-y divide-[#2d2d2d] max-h-[580px] overflow-y-auto custom-scrollbar bg-[#1e1e1f]">
                {isLatchingDetails && activityItems.length === 0 ? (
                  <div className="p-12 text-center text-xs text-gray-400 space-y-2">
                    <RefreshCw size={18} className="animate-spin text-[#007acc] mx-auto" />
                    <p className="font-mono">Cataloging initial repository lists...</p>
                  </div>
                ) : processedInboxItems.length === 0 ? (
                  <div className="p-16 text-center text-xs text-gray-500 font-mono space-y-1">
                    <p>No issues or pull requests found matching the current viewport criteria.</p>
                    <p className="text-[10px] text-gray-600">Try adjusting your filters or search keywords.</p>
                  </div>
                ) : (
                  processedInboxItems.map((item) => {
                    const isPR = item.type === "pr";
                    const commentCount = typeof item.comments === "number" ? item.comments : item.comments?.length ?? 0;

                    return (
                      <div
                        key={item.compositeId}
                        data-testid={getInboxItemTestId(item)}
                        onClick={() => openTabs(item.compositeId, item.type, `#${item.number}: ${item.title}`, item.repoFullName.split('/')[0], item.repoName, item.number)}
                        className="p-3.5 hover:bg-[#252528] transition-colors flex items-start justify-between gap-3 group cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          {/* Type Indicator Icon */}
                          <div className={`p-1.5 rounded mt-0.5 shrink-0 ${
                            isPR 
                              ? "bg-emerald-950/30 text-emerald-400"
                              : "bg-amber-950/30 text-amber-400"
                          }`}>
                            {isPR ? <GitPullRequest size={14} /> : <AlertCircle size={14} />}
                          </div>

                          <div className="min-w-0">
                            {/* Title Line */}
                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                              <span className="font-medium text-xs text-gray-200 group-hover:text-white group-hover:underline font-sans leading-tight pr-1">
                                {item.title}
                              </span>
                              
                              <span className="text-[10px] font-mono text-gray-400 bg-gray-800/80 px-1.5 py-0.5 rounded border border-gray-700/40 select-none shrink-0 inline-flex items-center gap-1">
                                {item.repoName} #{item.number}
                              </span>
                            </div>

                            {/* Subtitle / Metadata details */}
	                            <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
	                              <span className="flex items-center gap-1 select-none">
	                                <span className="text-gray-400 font-medium">@{item.user?.login}</span>
	                              </span>
                              <span>•</span>
                              <span>Created {formatDistanceToNow(item.created_at)}</span>
                              <span>•</span>
	                              <span>Updated {formatDistanceToNow(item.updated_at || item.created_at)}</span>
	                              <span>•</span>
	                              <span>{commentCount} comments</span>
	                              
	                              {item.labels && item.labels.length > 0 && (
                                <>
                                  <span>•</span>
                                  <div className="flex gap-1 select-none">
                                    {item.labels.slice(0, 2).map((lbl: Label) => (
                                      <span
                                        key={lbl.name}
                                        data-testid="inbox-item-label"
                                        className="text-[9px] px-1 py-0.2 rounded font-mono"
                                        style={{ backgroundColor: `${lbl.color}22`, color: `#${lbl.color}` || "gray" }}
                                      >
                                        {lbl.name}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <ChevronRight size={14} className="shrink-0 text-gray-600 group-hover:text-gray-300 transition-colors" />

                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>

          {/* Account Portfolio Sidebar (Col span 4) */}
          <div className="lg:col-span-4 space-y-4">

            {/* Custom Created Tag Groups */}
            <div className="bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-md select-none">
              <h3 className="text-xs font-bold font-sans tracking-wider uppercase text-white pb-3 border-b border-[#3e3e3e] flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Tag size={13} className="text-amber-400" />
                  Tags
                </span>
                <span className="font-mono text-[10px] bg-gray-800 text-gray-400 px-1.5 rounded">{projectTags.length} projects</span>
              </h3>

              <div className="mt-3.5 space-y-2">
                {projectTags.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-500 font-mono italic">
                    <p>No projects found.</p>
                  </div>
                ) : (
                  projectTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => openProject(tag.id)}
                      className="w-full text-left p-2.5 rounded bg-[#1e1e1f] hover:bg-[#282829] border border-gray-800 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                            style={{ backgroundColor: tag.color || "#0db981" }}
                          />
                          <span className="text-xs font-semibold text-gray-200 break-words">{tag.name}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1 font-mono">
                          Mapped: {tag.repos.length} {tag.repos.length === 1 ? "repository" : "repositories"}
                        </div>
                      </div>
                      <ChevronRight size={13} className="text-gray-600 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}

// Simple helper to compute direct relative differences inside WelcomeDashboard
function formatDistanceToNow(dateString: string): string {
  const date = new Date(dateString);
  const timestamp = date.getTime();
  invariant(!Number.isNaN(timestamp), "GitHub timestamp must be a valid date.");
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
