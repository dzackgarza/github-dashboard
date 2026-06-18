import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  FolderGit2,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  GitPullRequest,
  TrendingUp,
  Settings,
  HelpCircle,
  RefreshCw,
  Clock,
  Terminal,
  CircleDot,
  Search,
  ExternalLink,
  ChevronRight,
  Filter,
  User,
  Star,
  Tag,
  Workflow
} from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";
import { Issue, PullRequest, Repo } from "../types";

export default function WelcomeDashboard() {
  const {
    repos,
    syncLogs,
    rateLimit,
    projectTags,
    isTokenConfigured,
    githubUser,
    onGlobalRefresh,
    isSyncingGlobal,
    openTabs
  } = useWorkspace();

  // Selected filters inside the unified inbox
  const [inboxQuery, setInboxQuery] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"all" | "issues" | "prs" | "high">("all");

  // Flat list of combined issue and pull request activity items
  const [activityItems, setActivityItems] = useState<any[]>([]);
  const [isLatchingDetails, setIsLatchingDetails] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ done: 0, total: 0 });

  // Stream data from each of the active repos in parallel using our ETag efficient endpoints
  useEffect(() => {
    if (!repos || repos.length === 0) {
      setActivityItems([]);
      return;
    }

    let isMounted = true;
    setIsLatchingDetails(true);
    setFetchProgress({ done: 0, total: repos.length });

    const accumIssues: any[] = [];
    const accumPRs: any[] = [];
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
              issuesData.forEach((issue: any) => {
                // Skip PR items that GitHub returns as issues
                if (!issue.pull_request) {
                  accumIssues.push({
                    ...issue,
                    repoName: repo.name,
                    repoFullName: repo.full_name,
                    compositeId: `issue-${repo.full_name}-${issue.number}`,
                    type: "issue"
                  });
                }
              });
            }
          }

          // 2. Fetch PRs
          const prsRes = await fetch(`/api/github/repos/${owner}/${name}/prs`);
          if (prsRes.ok) {
            const prsData = await prsRes.json();
            if (Array.isArray(prsData)) {
              prsData.forEach((pr: any) => {
                accumPRs.push({
                  ...pr,
                  repoName: repo.name,
                  repoFullName: repo.full_name,
                  compositeId: `pr-${repo.full_name}-${pr.number}`,
                  type: "pr"
                });
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
        setActivityItems(combined);
        setIsLatchingDetails(false);
      }
    };

    pullAllRepoData();

    return () => {
      isMounted = false;
    };
  }, [repos]);

  // Compute profile aggregations
  const totalStars = useMemo(() => {
    return repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  }, [repos]);

  const privateCount = useMemo(() => {
    return repos.filter((r) => r.private).length;
  }, [repos]);

  const sortedLanguages = useMemo(() => {
    const counts: Record<string, number> = {};
    repos.forEach((r) => {
      const l = r.language || "Markdown/Docs";
      counts[l] = (counts[l] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([lang, count]) => ({ lang, count, percent: Math.round((count / (repos.length || 1)) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [repos]);

  // Unified inbox filters
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
      } else if (inboxFilter === "high") {
        matchesSegment = item.priority === "high";
      }

      return matchesSearch && matchesSegment;
    });
  }, [activityItems, inboxQuery, inboxFilter]);

  // Caching statistics
  const cacheHitCount = syncLogs.filter((l) => l.type === "304_HIT").length;
  const successCount = syncLogs.filter((l) => l.type === "SUCCESS").length;

  return (
    <div className="flex-1 overflow-y-auto bg-[#1e1e19] text-[#cccccc] font-sans h-full scrollbar-thin select-text">
      
      {/* 1. Profile Banner Room */}
      <div className="bg-gradient-to-r from-[#202022] to-[#1a1a1b] border-b border-[#2d2d2d] px-6 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {githubUser ? (
            <img
              src={githubUser.avatar_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60"}
              alt={githubUser.login}
              className="w-14 h-14 rounded-full border border-gray-700 shadow-lg shrink-0 object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-14 h-14 bg-gray-800 rounded-full border border-gray-700 flex items-center justify-center shrink-0">
              <User size={24} className="text-gray-500" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white flex items-center gap-2 truncate">
              <span>{githubUser?.name || githubUser?.login || "Guest Developer Workspace"}</span>
              {isTokenConfigured && (
                <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 rounded uppercase font-mono">
                  Personal Token Connected
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>@{githubUser?.login || "anonymous"}</span>
              <span>•</span>
              <span className="text-[#007acc] hover:underline cursor-pointer" onClick={() => window.open(githubUser?.html_url || "https://github.com", "_blank", "noopener,noreferrer")}>
                View GitHub Profile
              </span>
              <span>•</span>
              <span className="font-mono text-[11px] text-gray-500">Ctrl+P to open Commands</span>
            </p>
          </div>
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-2 md:self-center shrink-0 select-none">
          {isLatchingDetails && (
            <div className="text-xs bg-[#1a1a1c] border border-[#2d2d2d] px-2 py-1 rounded text-blue-400 font-mono flex items-center gap-1.5 animate-pulse">
              <RefreshCw size={11} className="animate-spin text-blue-500" />
              <span>Fetching {fetchProgress.done}/{fetchProgress.total} repos...</span>
            </div>
          )}
          
          <button
            onClick={onGlobalRefresh}
            disabled={isSyncingGlobal}
            className="px-3.5 py-1.5 bg-[#252526] hover:bg-[#2d2d2f] text-gray-200 border border-[#3e3e3e] rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={isSyncingGlobal ? "animate-spin" : ""} />
            <span>Workspace Sync</span>
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* 2. Top Metric KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-sm">
            <div className="flex items-center justify-between text-gray-400 pb-1 select-none">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Active Repos</span>
              <FolderGit2 size={15} className="text-blue-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1">{repos.length}</div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              {privateCount} private repos • {repos.length - privateCount} public
            </div>
          </div>

          <div className="bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-sm">
            <div className="flex items-center justify-between text-gray-400 pb-1 select-none">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Open Workspace Issues</span>
              <AlertCircle size={15} className="text-amber-500" />
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {activityItems.filter((i) => i.type === "issue" && i.state === "open").length}
            </div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              {activityItems.filter((i) => i.type === "issue" && i.priority === "high" && i.state === "open").length} high-priority bugs tagged
            </div>
          </div>

          <div className="bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-sm">
            <div className="flex items-center justify-between text-gray-400 pb-1 select-none">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Pending Pull Requests</span>
              <GitPullRequest size={15} className="text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {activityItems.filter((i) => i.type === "pr" && i.state === "open").length}
            </div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              Across {new Set(activityItems.filter((i) => i.type === "pr").map((i) => i.repoName)).size} core feature-branches
            </div>
          </div>

          <div className="bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-sm">
            <div className="flex items-center justify-between text-gray-400 pb-1 select-none">
              <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Server Cache Efficiency</span>
              <ShieldCheck size={15} className="text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {Math.round((cacheHitCount / (cacheHitCount + successCount || 1)) * 100)}%
            </div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              {cacheHitCount} saved calls • {rateLimit.remaining} limits remain
            </div>
          </div>
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
                    Unified Workspace Inbox
                  </h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">Unified stream of active issues and PRs across all managed GitHub repositories</p>
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
                  <button
                    onClick={() => setInboxFilter("high")}
                    className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                      inboxFilter === "high" ? "bg-red-950/50 text-red-300 border border-red-900" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    High Priority ({activityItems.filter((i) => i.priority === "high").length})
                  </button>
                </div>
                
                <span className="text-[10px] font-mono text-gray-500 italic">
                  Showing {processedInboxItems.length} items
                </span>
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
                    const isClosed = item.state === "closed";
                    const isHigh = item.priority === "high";

                    return (
                      <div
                        key={item.compositeId}
                        className="p-3.5 hover:bg-[#252528] transition-colors flex items-start justify-between gap-3 group"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          {/* Type Indicator Icon */}
                          <div className={`p-1.5 rounded mt-0.5 shrink-0 ${
                            isPR 
                              ? isClosed ? "bg-purple-950/30 text-purple-400" : "bg-emerald-950/30 text-emerald-400"
                              : isHigh ? "bg-red-950/30 text-red-400" : "bg-amber-950/30 text-amber-400"
                          }`}>
                            {isPR ? <GitPullRequest size={14} /> : <AlertCircle size={14} />}
                          </div>

                          <div className="min-w-0">
                            {/* Title Line */}
                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                              <span
                                onClick={() => openTabs(item.compositeId, item.type, `#${item.number}`, item.repoFullName.split('/')[0], item.repoName, item.number)}
                                className="font-medium text-xs text-gray-200 hover:text-white hover:underline cursor-pointer font-sans leading-tight pr-1"
                              >
                                {item.title}
                              </span>
                              
                              <span className="text-[10px] font-mono text-gray-400 bg-gray-800/80 px-1.5 py-0.5 rounded border border-gray-700/40 select-none shrink-0 inline-flex items-center gap-1">
                                {item.repoName} #{item.number}
                              </span>

                              {isHigh && (
                                <span className="text-[9px] font-mono font-bold text-red-400 bg-red-950/30 border border-red-900 px-1 rounded">
                                  HIGH PRIORITY
                                </span>
                              )}
                            </div>

                            {/* Subtitle / Metadata details */}
                            <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <span className="flex items-center gap-1 select-none">
                                <img
                                  src={item.user?.avatar_url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=50"}
                                  alt={item.user?.login}
                                  className="w-3.5 h-3.5 rounded-full object-cover border border-gray-800"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="text-gray-400 font-medium">@{item.user?.login}</span>
                              </span>
                              <span>•</span>
                              <span>Ref: {formatDistanceToNow(item.created_at)}</span>
                              
                              {item.labels && item.labels.length > 0 && (
                                <>
                                  <span>•</span>
                                  <div className="flex gap-1 select-none">
                                    {item.labels.slice(0, 2).map((lbl: any) => (
                                      <span
                                        key={lbl.name}
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

                        {/* GitHub Direct External Link */}
                        <div className="shrink-0 flex items-center select-none opacity-40 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => window.open(item.html_url, "_blank", "noopener,noreferrer")}
                            className="p-1 px-1.5 bg-[#1a1a1c] hover:bg-[#2e2e30] border border-gray-800 hover:border-gray-600 rounded text-gray-400 hover:text-white text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors"
                            title="Open direct issue page on github.com"
                          >
                            <ExternalLink size={10} />
                            <span>GitHub</span>
                          </button>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>

          {/* Account Portfolio Sidebar (Col span 4) */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* Tech Languages Portfolio Breakdown */}
            <div className="bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-md">
              <h3 className="text-xs font-bold font-sans tracking-wider uppercase text-white pb-3 border-b border-[#3e3e3e] flex items-center justify-between select-none">
                <span className="flex items-center gap-2">
                  <Workflow size={13} className="text-sky-400" />
                  Language Portfolio
                </span>
                <span className="font-mono text-[10px] text-gray-500 font-normal">Derivatives</span>
              </h3>
              
              <div className="mt-4 space-y-3.5">
                {sortedLanguages.length === 0 ? (
                  <p className="text-xs italic text-gray-500 font-mono text-center py-2">No language parameters detected.</p>
                ) : (
                  sortedLanguages.map(({ lang, count, percent }) => (
                    <div key={lang} className="space-y-1 select-none">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-gray-300 font-medium">{lang}</span>
                        <div className="text-gray-500 text-[11px]">
                          <span>{count} {count === 1 ? "repo" : "repos"}</span>
                          <span className="ml-1.5 text-gray-400">({percent}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-[#1e1e1f] rounded-full h-1.5 overflow-hidden border border-black/10">
                        <div
                          className="h-full bg-[#007acc] rounded-full transition-all duration-500"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: 
                              lang === "TypeScript" ? "#3178c6" :
                              lang === "JavaScript" ? "#f1e05a" :
                              lang === "Python" ? "#3572A5" :
                              lang === "HTML" ? "#e34c26" :
                              lang === "Rust" ? "#dea584" : "#007acc"
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Custom Created Tag Groups */}
            <div className="bg-[#252526] p-4 rounded border border-[#3e3e3e] shadow-md select-none">
              <h3 className="text-xs font-bold font-sans tracking-wider uppercase text-white pb-3 border-b border-[#3e3e3e] flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Tag size={13} className="text-amber-400" />
                  Cognitive Project Tags
                </span>
                <span className="font-mono text-[10px] bg-gray-800 text-gray-400 px-1.5 rounded">{projectTags.length} Groups</span>
              </h3>

              <div className="mt-3.5 space-y-2">
                {projectTags.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-500 font-mono italic">
                    <p>No project tag groups found.</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">Use Ctrl+P Palette to create active tags.</p>
                  </div>
                ) : (
                  projectTags.map((tag) => (
                    <div
                      key={tag.id}
                      className="p-2.5 rounded bg-[#1e1e1f] hover:bg-[#282829] border border-gray-800 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                            style={{ backgroundColor: tag.color || "#0db981" }}
                          />
                          <span className="text-xs font-semibold text-gray-200 truncate">{tag.name}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1 font-mono hover:underline cursor-pointer" onClick={() => openTabs("explorer", "welcome", "Repository Explorer")}>
                          Mapped: {tag.repos.length} {tag.repos.length === 1 ? "repository" : "repositories"}
                        </div>
                      </div>
                      <ChevronRight size={13} className="text-gray-600 shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active Rate Limits Monitor details */}
            <div className="bg-[#252526] p-4 rounded border border-[#3e3e3e] bg-gradient-to-br from-[#252526] to-[#121213] select-none text-xs">
              <div className="flex items-center gap-2 font-bold text-white border-b border-[#3e3e3e] pb-2.5 uppercase tracking-wide text-[11px]">
                <Database size={13} className="text-emerald-400" />
                <span>Rate Limits & Caching stats</span>
              </div>
              <div className="mt-3.5 space-y-2 font-mono text-[11px] text-gray-400">
                <div className="flex justify-between">
                  <span>Current Allowance remaining:</span>
                  <strong className="text-white">{rateLimit.remaining} / {rateLimit.limit}</strong>
                </div>
                <div className="flex justify-between">
                  <span>ETag efficiency hits:</span>
                  <strong className="text-emerald-400">{cacheHitCount} hits ({Math.round(cacheHitCount/(cacheHitCount+successCount||1)*100)}%)</strong>
                </div>
                {rateLimit.reset > 0 && (
                  <div className="flex justify-between text-[10px] text-gray-500 pt-1.5 border-t border-gray-800">
                    <span>Allowance Cycle renews:</span>
                    <span>{new Date(rateLimit.reset * 1000).toLocaleTimeString()}</span>
                  </div>
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
  try {
    const diff = new Date().getTime() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "recent";
  }
}
