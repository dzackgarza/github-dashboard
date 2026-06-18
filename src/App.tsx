import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  FolderGit2,
  Database,
  RefreshCw,
  Settings as SettingsIcon,
  Home,
  X,
  PlayCircle,
  XCircle,
  HelpCircle,
  CheckCircle,
  Github,
  Award,
  BookOpen,
  Sliders,
  ChevronRight,
  ShieldCheck,
  CodeXml
} from "lucide-react";
import VSCodeActivityBar from "./components/VSCodeActivityBar";
import VSCodeSidebar from "./components/VSCodeSidebar";
import WelcomeDashboard from "./components/WelcomeDashboard";
import RepositoryExplorer from "./components/RepositoryExplorer";
import IssueDetailView from "./components/IssueDetailView";
import PRDetailView from "./components/PRDetailView";
import CommandPalette from "./components/CommandPalette";
import { WorkspaceContext } from "./context/WorkspaceContext";
import { Repo, ProjectTag, SyncLog, RateLimit, Tab, Issue, PullRequest } from "./types";
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps, DockviewApi } from "dockview";

function DockviewIssueWrapper({ params, api }: IDockviewPanelProps<{ owner?: string; repoName?: string; number?: number; data?: any }>) {
  const [issue, setIssue] = useState<any>(params.data);
  const [loading, setLoading] = useState(!params.data);

  useEffect(() => {
    let active = true;
    if (!issue && params.owner && params.repoName && params.number) {
      setLoading(true);
      fetch(`/api/github/repos/${params.owner}/${params.repoName}/issues`)
        .then((r) => r.json())
        .then((issues) => {
          if (!active) return;
          const match = issues.find((i: any) => i.number === params.number);
          if (match) {
            setIssue(match);
            api.updateParameters({ data: match });
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [params.owner, params.repoName, params.number, issue, api]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 bg-[#1e1e1e] space-y-2">
        <span className="animate-spin text-lg">↻</span>
        <span>Loading Github Issue details...</span>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-red-500 bg-[#1e1e1e]">
        Failed loading item details. Please check the network connectivity or Git status.
      </div>
    );
  }

  return (
    <IssueDetailView
      owner={params.owner!}
      repoName={params.repoName!}
      issue={issue}
      onRefreshItem={async () => {
        const res = await fetch(`/api/github/repos/${params.owner}/${params.repoName}/issues`);
        const issues = await res.json();
        const match = issues.find((i: any) => i.number === params.number);
        if (match) {
          setIssue(match);
          api.updateParameters({ data: match });
        }
      }}
    />
  );
}

function DockviewPRWrapper({ params, api }: IDockviewPanelProps<{ owner?: string; repoName?: string; number?: number; data?: any }>) {
  const [pr, setPr] = useState<any>(params.data);
  const [loading, setLoading] = useState(!params.data);

  useEffect(() => {
    let active = true;
    if (!pr && params.owner && params.repoName && params.number) {
      setLoading(true);
      fetch(`/api/github/repos/${params.owner}/${params.repoName}/prs`)
        .then((r) => r.json())
        .then((prs) => {
          if (!active) return;
          const match = prs.find((p: any) => p.number === params.number);
          if (match) {
            setPr(match);
            api.updateParameters({ data: match });
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [params.owner, params.repoName, params.number, pr, api]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 bg-[#1e1e1e] space-y-2">
        <span className="animate-spin text-lg">↻</span>
        <span>Loading Github PR details...</span>
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-red-500 bg-[#1e1e1e]">
        Failed loading item details. Please check the network connectivity or Git status.
      </div>
    );
  }

  return (
    <PRDetailView
      owner={params.owner!}
      repoName={params.repoName!}
      pr={pr}
      onRefreshItem={async () => {
        const res = await fetch(`/api/github/repos/${params.owner}/${params.repoName}/prs`);
        const prs = await res.json();
        const match = prs.find((p: any) => p.number === params.number);
        if (match) {
          setPr(match);
          api.updateParameters({ data: match });
        }
      }}
    />
  );
}

export default function App() {
  const dockviewApiRef = useRef<DockviewApi | null>(null);

  // Navigation / Layout views
  const [activeView, setActiveView] = useState<"explorer" | "sync" | "settings">("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [centerViewType, setCenterViewType] = useState<"explorer" | "dashboard">("explorer");

  const handleToggleView = (view: "explorer" | "sync" | "settings") => {
    if (activeView === view) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setActiveView(view);
      setSidebarOpen(true);
    }
  };

  // GitHub items list states
  const [repos, setRepos] = useState<Repo[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [syncTimestamps, setSyncTimestamps] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState<Record<string, boolean>>({});
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>("all");
  const [activeRepoFullName, setActiveRepoFullName] = useState<string | null>(null);

  // Auth / verification states
  const [isTokenConfigured, setIsTokenConfigured] = useState(false);
  const [githubUser, setGithubUser] = useState<any | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimit>({ limit: 60, remaining: 60, reset: 0 });

  // Sync actions terminal log items
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  // Active workspace tabs
  const [activeTabId, setActiveTabId] = useState<string>("welcome");

  // Multi-item details loading on demand
  const [activeIssue, setActiveIssue] = useState<{ owner: string; repo: string; data: Issue } | null>(null);
  const [activePR, setActivePR] = useState<{ owner: string; repo: string; data: PullRequest } | null>(null);

  // Global actions loading block
  const [isSyncingGlobal, setIsSyncingGlobal] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Key bindings listener for Ctrl+P or Cmd+P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Init fetch: config verify, repos list, projects metadata and sync logs
  useEffect(() => {
    bootstrapWorkspace();
  }, []);

  const bootstrapWorkspace = async () => {
    try {
      // 1) Verify API config settings
      const configRes = await fetch("/api/github/config");
      const config = await configRes.json();
      setIsTokenConfigured(config.configured);
      setGithubUser(config.user);

      // 2) Load core repos list
      await fetchRepos();

      // 3) Pull developer sync logs & limits
      await refreshSyncDiagnostics();
    } catch (err) {
      console.error("Workspace boot process error", err);
    }
  };

  const fetchRepos = async () => {
    try {
      const res = await fetch("/api/github/repos");
      const data = await res.json();
      if (data.repos) {
        setRepos(data.repos);
      }
      
      setProjectTags(data.projectTags);

      if (data.syncTimestamps) {
        setSyncTimestamps(data.syncTimestamps);
      }
      if (data.rateLimit) {
        setRateLimit(data.rateLimit);
      }
    } catch (err) {
      console.error("Error gathering repos", err);
    }
  };

  const refreshSyncDiagnostics = async () => {
    try {
      const logsRes = await fetch("/api/github/sync-logs");
      const logs = await logsRes.json();
      setSyncLogs(logs);

      const limitsRes = await fetch("/api/github/rate-limit_status");
      const limit = await limitsRes.json();
      setRateLimit(limit);
    } catch (err) {
      console.error("Error refreshing sync diagnostics and rate limits", err);
    }
  };

  // Perform force incremental GET syncing for a repo using Server-side ETags
  const handleForceSyncRepo = async (owner: string, repoName: string) => {
    const fullName = `${owner}/${repoName}`;
    setIsSyncing((prev) => ({ ...prev, [fullName]: true }));

    try {
      const res = await fetch(`/api/github/repos/${owner}/${repoName}/sync`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncTimestamps((prev) => ({ ...prev, [fullName]: data.lastSynced }));
        // Reload list to populate cached changes
        await fetchRepos();
      }
    } catch (err) {
      console.error("Single sync trigger failure", err);
    } finally {
      setIsSyncing((prev) => ({ ...prev, [fullName]: false }));
      await refreshSyncDiagnostics();
    }
  };

  // Trigger full delta scan of workspace
  const handleGlobalSync = async () => {
    setIsSyncingGlobal(true);
    try {
      for (const repo of repos) {
        await handleForceSyncRepo(repo.owner.login, repo.name);
      }
    } catch {
      // Done
    } finally {
      setIsSyncingGlobal(false);
    }
  };

  // OPEN standard editor tab
  const handleOpenTab = (
    id: string,
    type: Tab["type"],
    title: string,
    owner?: string,
    repo?: string,
    number?: number
  ) => {
    setActiveTabId(id);

    if (dockviewApiRef.current) {
      const panel = dockviewApiRef.current.getPanel(id);
      if (panel) {
        panel.api.setActive();
      } else {
        let targetComponent: string = type;
        if (type === "welcome") {
          targetComponent = id === "welcome" ? "welcome" : "explorer";
        }

        // Find an existing editor panel as reference to group things in the editor tab group
        const panels = dockviewApiRef.current.panels;
        const existingPanel = panels[0];

        dockviewApiRef.current.addPanel({
          id,
          title,
          component: targetComponent,
          params: { id, type, title, owner, repoName: repo, number },
          position: existingPanel
            ? { referencePanel: existingPanel.id, direction: "within" }
            : undefined,
        });
      }
    }
  };

  const handleOpenRepo = (repoFullName: string) => {
    setActiveRepoFullName(repoFullName);
    handleOpenTab("explorer", "welcome", "Repositories");
  };

  const handleOpenProject = (projectId: string) => {
    setSelectedProjectFilter(projectId);
    setActiveRepoFullName(null);
    handleOpenTab("explorer", "welcome", "Repositories");
  };

  // Metadata project tag assigning
  const handleAddProjectTag = async (tagName: string, repoFullName: string) => {
    const updatedTags = projectTags.map((tag) => {
      if (tag.name === tagName) {
        const alreadyHas = tag.repos.includes(repoFullName);
        return {
          ...tag,
          repos: alreadyHas ? tag.repos : [...tag.repos, repoFullName]
        };
      }
      return tag;
    });

    try {
      const res = await fetch("/api/github/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags })
      });
      if (res.ok) {
        const data = await res.json();
        setProjectTags(data.projectTags);
        await refreshSyncDiagnostics();
      }
    } catch (e) {
      console.error("Metadata tag setting error", e);
    }
  };

  const handleRemoveRepoFromTag = async (tagId: string, repoFullName: string) => {
    const updatedTags = projectTags.map((tag) => {
      if (tag.id === tagId) {
        return {
          ...tag,
          repos: tag.repos.filter((r) => r !== repoFullName)
        };
      }
      return tag;
    });

    try {
      const res = await fetch("/api/github/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags })
      });
      if (res.ok) {
        const data = await res.json();
        setProjectTags(data.projectTags);
        await refreshSyncDiagnostics();
      }
    } catch (e) {
      console.error("Removing repo tag mapping fail", e);
    }
  };

  // Project Category Tags Creators & Deletion
  const handleCreateProjectTag = async (name: string, color: string) => {
    const newTag: ProjectTag = {
      id: `proj-${Date.now()}`,
      name,
      color,
      repos: []
    };
    const updatedTags = [...projectTags, newTag];

    try {
      const res = await fetch("/api/github/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags })
      });
      if (res.ok) {
        const data = await res.json();
        setProjectTags(data.projectTags);
        await refreshSyncDiagnostics();
      }
    } catch (err) {
      console.error("Failed creating tag folder category", err);
    }
  };

  const handleDeleteProjectTag = async (tagId: string) => {
    if (selectedProjectFilter === tagId) {
      setSelectedProjectFilter("all");
    }
    const updatedTags = projectTags.filter((t) => t.id !== tagId);

    try {
      const res = await fetch("/api/github/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags })
      });
      if (res.ok) {
        const data = await res.json();
        setProjectTags(data.projectTags);
        await refreshSyncDiagnostics();
      }
    } catch (err) {
      console.error("Failed destroying tag tag structure", err);
    }
  };

  // Update tabs callback to trigger reloading active items when comment adds
  const handleRefreshActiveItem = async () => {
    await fetchRepos();
    await refreshSyncDiagnostics();

    if (activeIssue) {
      const res = await fetch(`/api/github/repos/${activeIssue.owner}/${activeIssue.repo}/issues`);
      const issues = await res.json();
      const match = issues.find((i: any) => i.number === activeIssue.data.number);
      if (match) {
        setActiveIssue({ ...activeIssue, data: match });
      }
    }

    if (activePR) {
      const res = await fetch(`/api/github/repos/${activePR.owner}/${activePR.repo}/prs`);
      const prs = await res.json();
      const match = prs.find((p: any) => p.number === activePR.data.number);
      if (match) {
        setActivePR({ ...activePR, data: match });
      }
    }
  };

  const components = useMemo(() => {
    return {
      welcome: () => (
        <WelcomeDashboard />
      ),
      explorer: () => (
        <RepositoryExplorer />
      ),
      issue: (props: IDockviewPanelProps<{ owner?: string; repoName?: string; number?: number; data?: any }>) => (
        <DockviewIssueWrapper {...props} />
      ),
      pr: (props: IDockviewPanelProps<{ owner?: string; repoName?: string; number?: number; data?: any }>) => (
        <DockviewPRWrapper {...props} />
      ),
    };
  }, []);

  const onReady = (event: DockviewReadyEvent) => {
    dockviewApiRef.current = event.api;

    event.api.addPanel({
      id: "welcome",
      title: "Welcome Dashboard",
      component: "welcome",
    });

    event.api.onDidActivePanelChange((panel) => {
      if (panel) {
        setActiveTabId(panel.id);
        if (panel.id.startsWith("issue-")) {
          const params = panel.params;
          if (params?.data) {
            setActiveIssue({ owner: params.owner, repo: params.repoName, data: params.data });
          }
        } else if (panel.id.startsWith("pr-")) {
          const params = panel.params;
          if (params?.data) {
            setActivePR({ owner: params.owner, repo: params.repoName, data: params.data });
          }
        }
      }
    });
  };

  const contextValue = useMemo(() => ({
    repos,
    projectTags,
    syncTimestamps,
    isSyncing,
    syncLogs,
    rateLimit,
    isTokenConfigured,
    githubUser,
    isSyncingGlobal,
    selectedProjectFilter,
    activeRepoFullName,
    setSelectedProjectFilter,
    openRepo: handleOpenRepo,
    openProject: handleOpenProject,
    onForceSync: handleForceSyncRepo,
    onGlobalRefresh: handleGlobalSync,
    onAddProjectTag: handleAddProjectTag,
    onRemoveRepoFromTag: handleRemoveRepoFromTag,
    onCreateProjectTag: handleCreateProjectTag,
    onDeleteProjectTag: handleDeleteProjectTag,
    openTabs: handleOpenTab,
  }), [
    repos,
    projectTags,
    syncTimestamps,
    isSyncing,
    syncLogs,
    rateLimit,
    isTokenConfigured,
    githubUser,
    isSyncingGlobal,
    selectedProjectFilter,
    activeRepoFullName,
  ]);

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <div className="w-screen h-screen flex flex-col bg-[#1e1e1e] overflow-hidden text-[#cccccc] font-sans">
      
      {/* 1. Main Workspace Body row */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 1.1 Left Vertical VSCode Utility Activity Bar */}
        <VSCodeActivityBar
          activeView={activeView}
          setActiveView={handleToggleView}
          isTokenConfigured={isTokenConfigured}
          rateRemaining={rateLimit.remaining}
          sidebarOpen={sidebarOpen}
        />

        {/* 1.2 VSCode Left Sidebar - Fixed size outside custom dockview grid */}
        {sidebarOpen && (
          <div className="w-[280px] shrink-0 border-r border-[#2d2d2d] bg-[#252526] h-full flex flex-col min-w-0">
            <VSCodeSidebar
              activeView={activeView}
              repos={repos}
              projectTags={projectTags}
              syncTimestamps={syncTimestamps}
              isSyncing={isSyncing}
              onForceSync={handleForceSyncRepo}
              onSelectIssue={(owner, repo, data) => handleOpenTab(`issue-${owner}-${repo}-${data.number}`, "issue", `#${data.number}: ${data.title}`, owner, repo, data.number)}
              onSelectPR={(owner, repo, data) => handleOpenTab(`pr-${owner}-${repo}-${data.number}`, "pr", `PR #${data.number}: ${data.title}`, owner, repo, data.number)}
              onAddProjectTag={handleAddProjectTag}
              onRemoveRepoFromTag={handleRemoveRepoFromTag}
              onCreateProjectTag={handleCreateProjectTag}
              onDeleteProjectTag={handleDeleteProjectTag}
              openTabs={handleOpenTab}
              activeTabId={activeTabId}
              onClose={() => setSidebarOpen(false)}
              selectedProjectFilter={selectedProjectFilter}
              onSelectProjectFilter={setSelectedProjectFilter}
            />
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          <DockviewReact
            components={components}
            onReady={onReady}
            className="dockview-theme-abyss"
          />
        </div>
    </div>

      {/* 2. Visual Status Bar */}
      <div className="h-6 bg-[#007acc] flex items-center px-3 text-[11px] text-white space-x-4 select-none shrink-0 font-sans shadow-inner border-t border-blue-600/30">
        <div className="flex items-center">
          <span className="font-semibold">main</span>
        </div>
        <div className="flex items-center">
          <span className="mr-1">↻</span>
          <span>Workspace Refreshed</span>
        </div>
        <div className="ml-auto flex items-center space-x-3.5">
          <span>UTF-8</span>
          <span>TypeScript</span>
        </div>
      </div>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        projectTags={projectTags}
        repos={repos}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onToggleExplorer={() => handleOpenTab("explorer", "welcome", "Repository Explorer")}
        onSelectProjectFilter={setSelectedProjectFilter}
        onCreateProjectTag={handleCreateProjectTag}
        onDeleteProjectTag={handleDeleteProjectTag}
        onGlobalRefresh={handleGlobalSync}
        onSwitchSidebarView={setActiveView}
        openTabs={handleOpenTab}
      />

    </div>
    </WorkspaceContext.Provider>
  );
}
