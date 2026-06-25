import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import VSCodeActivityBar from "./components/VSCodeActivityBar";
import VSCodeSidebar from "./components/VSCodeSidebar";
import WelcomeDashboard from "./components/WelcomeDashboard";
import RepositoryExplorer from "./components/RepositoryExplorer";
import IssueDetailView from "./components/IssueDetailView";
import PRDetailView from "./components/PRDetailView";
import CommandPalette from "./components/CommandPalette";
import { WorkspaceContext } from "./context/WorkspaceContext";
import { Repo, ProjectTag, SyncLog, RateLimit, Tab, Issue, PullRequest, User } from "./types";
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps, DockviewApi } from "dockview";
import { deriveProjectTagsFromWorkspaceRepos, normalizeProjectTopicName } from "./utils/projectTopics";

type ProjectMutationStatus = "queued" | "saving" | "saved" | "error";

type DockPanelParams = {
  owner?: string;
  repoName?: string;
  number?: number;
  data?: Issue | PullRequest;
  explorerMode?: "repositories" | "projects" | "repo" | "project";
  repoFullName?: string;
  projectId?: string;
};

interface ProjectMutationNotification {
  id: string;
  label: string;
  status: ProjectMutationStatus;
  detail: string;
}

function DockviewIssueWrapper({ params, api }: IDockviewPanelProps<{ owner?: string; repoName?: string; number?: number; data?: Issue }>) {
  const [issue, setIssue] = useState<Issue | null>(params.data ?? null);
  const hasParams = Boolean(params.owner && params.repoName && params.number);
  const [loading, setLoading] = useState(hasParams && !params.data);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!hasParams) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/github/repos/${params.owner}/${params.repoName}/issues/${params.number}`);
        if (!response.ok) {
          throw new Error(`Issue endpoint failed with ${response.status}`);
        }
        const data = await response.json() as Issue;
        if (active) {
          setIssue(data);
          api.updateParameters({ data });
        }
      } catch (err) {
        if (active) {
          setLoadError(`Failed to load issue #${params.number}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [params.owner, params.repoName, params.number, hasParams, api]);

  if (!hasParams) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-500 bg-[#1e1e1e]">
        Issue panel parameters are incomplete.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 bg-[#1e1e1e] space-y-2">
        <span className="animate-spin text-lg">↻</span>
        <span>Loading Github Issue details...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-red-400 bg-[#1e1e1e] px-4 text-center">
        {loadError}
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-500 bg-[#1e1e1e]">
        No issue details are available for this panel.
      </div>
    );
  }

  return (
    <IssueDetailView
      owner={params.owner!}
      repoName={params.repoName!}
      issue={issue}
      onRefreshItem={async () => {
        if (!params.owner || !params.repoName || !params.number) {
          return;
        }

        try {
          const res = await fetch(`/api/github/repos/${params.owner}/${params.repoName}/issues/${params.number}`);
          if (!res.ok) {
            return;
          }
          const data = await res.json() as Issue;
          setIssue(data);
          api.updateParameters({ data });
        } catch (err) {
          console.error("Failed to refresh issue summary", err);
        }
      }}
    />
  );
}

function DockviewPRWrapper({ params, api }: IDockviewPanelProps<{ owner?: string; repoName?: string; number?: number; data?: PullRequest }>) {
  const [pr, setPr] = useState<PullRequest | null>(params.data ?? null);
  const hasParams = Boolean(params.owner && params.repoName && params.number);
  const [loading, setLoading] = useState(hasParams && !params.data);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!hasParams) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/github/repos/${params.owner}/${params.repoName}/prs/${params.number}`);
        if (!response.ok) {
          throw new Error(`PR endpoint failed with ${response.status}`);
        }
        const data = await response.json() as PullRequest;
        if (active) {
          setPr(data);
          api.updateParameters({ data });
        }
      } catch (err) {
        if (active) {
          setLoadError(`Failed to load pull request #${params.number}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [params.owner, params.repoName, params.number, hasParams, api]);

  if (!hasParams) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-500 bg-[#1e1e1e]">
        Pull request panel parameters are incomplete.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-xs text-gray-400 bg-[#1e1e1e] space-y-2">
        <span className="animate-spin text-lg">↻</span>
        <span>Loading Github PR details...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-red-400 bg-[#1e1e1e] px-4 text-center">
        {loadError}
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-500 bg-[#1e1e1e]">
        No pull request details are available for this panel.
      </div>
    );
  }

  return (
    <PRDetailView
      owner={params.owner!}
      repoName={params.repoName!}
      pr={pr}
      onRefreshItem={async () => {
        if (!params.owner || !params.repoName || !params.number) {
          return;
        }

        const res = await fetch(`/api/github/repos/${params.owner}/${params.repoName}/prs/${params.number}`);
        if (!res.ok) {
          throw new Error(`PR refresh failed with ${res.status}`);
        }
        const data = await res.json() as PullRequest;
        setPr(data);
        api.updateParameters({ data });
      }}
    />
  );
}

export default function App() {
  const dockviewApiRef = useRef<DockviewApi | null>(null);

  // Navigation / Layout views
  const [activeView, setActiveView] = useState<"explorer" | "sync" | "settings">("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
  const reposRef = useRef<Repo[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const projectTagsRef = useRef<ProjectTag[]>([]);
  const [projectMutationNotifications, setProjectMutationNotifications] = useState<ProjectMutationNotification[]>([]);
  const [isInitialRepoLoadRunning, setIsInitialRepoLoadRunning] = useState(false);
  const [syncTimestamps, setSyncTimestamps] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState<Record<string, boolean>>({});
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>("all");
  const [activeRepoFullName, setActiveRepoFullName] = useState<string | null>(null);
  const [activeProjectDashboardId, setActiveProjectDashboardId] = useState<string | null>(null);

  // Auth / verification states
  const [isTokenConfigured, setIsTokenConfigured] = useState(false);
  const [githubUser, setGithubUser] = useState<User | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimit>({ limit: 60, remaining: 60, reset: 0 });

  // Sync actions terminal log items
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  // Active workspace tabs
  const [activeTabId, setActiveTabId] = useState<string>("welcome");

  // Multi-item details loading on demand

  // Global actions loading block
  const [isSyncingGlobal, setIsSyncingGlobal] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Keyboard shortcut listener for opening the command palette.
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

  useEffect(() => {
    reposRef.current = repos;
  }, [repos]);

  useEffect(() => {
    projectTagsRef.current = projectTags;
  }, [projectTags]);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/github/repos");
      const data = await res.json();
      if (data.repos) {
        setRepos(data.repos);
        setProjectTags(deriveProjectTagsFromWorkspaceRepos(data.repos));
      }

      if (data.syncTimestamps) {
        setSyncTimestamps(data.syncTimestamps);
      }
      if (data.rateLimit) {
        setRateLimit(data.rateLimit);
      }
    } catch (err) {
      console.error("Error gathering repos", err);
    }
  }, []);

  const refreshSyncDiagnostics = useCallback(async () => {
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
  }, []);

  const bootstrapWorkspace = useCallback(async () => {
    try {
      // 1) Verify API config settings
      const configRes = await fetch("/api/github/config");
      const config = await configRes.json();
      setIsTokenConfigured(config.configured);
      setGithubUser(config.user);

      // 2) Load core repos list
      setIsInitialRepoLoadRunning(true);
      await fetchRepos();
      setIsInitialRepoLoadRunning(false);

      // 3) Pull developer sync logs & limits
      await refreshSyncDiagnostics();
    } catch (err) {
      console.error("Workspace boot process error", err);
    }
  }, [fetchRepos, refreshSyncDiagnostics]);

  // Perform force incremental GET syncing for a repo using Server-side ETags
  const handleForceSyncRepo = useCallback(async (owner: string, repoName: string) => {
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
  }, [fetchRepos, refreshSyncDiagnostics]);

  // Trigger full delta scan of workspace
  const handleGlobalSync = useCallback(async () => {
    setIsSyncingGlobal(true);
    try {
      for (const repo of repos) {
        await handleForceSyncRepo(repo.owner.login, repo.name);
      }
    } finally {
      setIsSyncingGlobal(false);
    }
  }, [repos, handleForceSyncRepo]);

  // OPEN standard editor tab
  const handleOpenTab = useCallback((
    id: string,
    type: Tab["type"],
    title: string,
    owner?: string,
    repo?: string,
    number?: number,
    extraParams?: Partial<DockPanelParams>
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
          params: { id, type, title, owner, repoName: repo, number, ...extraParams },
          position: existingPanel
            ? { referencePanel: existingPanel.id, direction: "within" }
            : undefined,
        });
      }
    }
  }, []);

  const handleOpenRepo = useCallback((repoFullName: string) => {
    const repo = reposRef.current.find((item) => item.full_name === repoFullName);
    if (!repo) {
      throw new Error(`Repository ${repoFullName} was not found.`);
    }
    setActiveRepoFullName(repoFullName);
    setActiveProjectDashboardId(null);
    handleOpenTab(
      `repo-dashboard-${repoFullName.replace(/\//g, "-")}`,
      "welcome",
      repo.name,
      undefined,
      undefined,
      undefined,
      { explorerMode: "repo", repoFullName }
    );
  }, [handleOpenTab]);

  const handleOpenProject = useCallback((projectId: string) => {
    const project = projectTagsRef.current.find((item) => item.id === projectId);
    if (!project) {
      throw new Error(`Project ${projectId} was not found.`);
    }
    setActiveProjectDashboardId(projectId);
    setActiveRepoFullName(null);
    handleOpenTab(
      `project-dashboard-${projectId}`,
      "welcome",
      project.name,
      undefined,
      undefined,
      undefined,
      { explorerMode: "project", projectId }
    );
  }, [handleOpenTab]);

  const handleOpenRepositoryExplorer = useCallback(() => {
    setActiveRepoFullName(null);
    setActiveProjectDashboardId(null);
    handleOpenTab(
      "repositories-dashboard",
      "welcome",
      "Repositories",
      undefined,
      undefined,
      undefined,
      { explorerMode: "repositories" }
    );
  }, [handleOpenTab]);

  const handleOpenProjectsDashboard = useCallback(() => {
    setActiveRepoFullName(null);
    setActiveProjectDashboardId(null);
    handleOpenTab(
      "projects-dashboard",
      "welcome",
      "Projects",
      undefined,
      undefined,
      undefined,
      { explorerMode: "projects" }
    );
  }, [handleOpenTab]);

  const updateProjectNotification = useCallback((id: string, patch: Partial<ProjectMutationNotification>) => {
    setProjectMutationNotifications((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const removeProjectNotification = useCallback((id: string) => {
    setProjectMutationNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const runProjectMutation = useCallback(async (label: string, execute: () => Promise<void>) => {
    const id = crypto.randomUUID();
    setProjectMutationNotifications((current) => [
      ...current,
      { id, label, status: "queued", detail: "Queued" }
    ]);
    updateProjectNotification(id, { status: "saving", detail: "Saving" });

    try {
      await execute();
      updateProjectNotification(id, { status: "saved", detail: "Saved" });
      window.setTimeout(() => removeProjectNotification(id), 1800);
    } catch (error) {
      updateProjectNotification(id, {
        status: "error",
        detail: error instanceof Error ? error.message : "Project update failed"
      });
    }
  }, [updateProjectNotification, removeProjectNotification]);

  const replaceRepoTopics = useCallback(async (repoFullName: string, nextTopics: string[]) => {
    const repo = repos.find((item) => item.full_name === repoFullName);
    if (!repo) {
      throw new Error(`Repository ${repoFullName} was not found.`);
    }

    const res = await fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/topics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topics: nextTopics })
    });
    if (!res.ok) {
      throw new Error(`Topic update failed with HTTP ${res.status}`);
    }

    await res.json() as { topics: string[] };
    await fetchRepos();
    await refreshSyncDiagnostics();
  }, [repos, fetchRepos, refreshSyncDiagnostics]);

  // Metadata project tag assigning
  const handleAddProjectTag = useCallback((tagName: string, repoFullName: string) => {
    const repo = repos.find((item) => item.full_name === repoFullName);
    if (!repo) {
      throw new Error(`Repository ${repoFullName} was not found.`);
    }
    const topic = normalizeProjectTopicName(tagName);
    if (repo.topics.includes(topic)) {
      return;
    }

    void runProjectMutation(`Add ${repoFullName} to ${topic}`, async () => {
      await replaceRepoTopics(repoFullName, [...repo.topics, topic].sort((left, right) => left.localeCompare(right)));
    });
  }, [repos, runProjectMutation, replaceRepoTopics]);

  const handleRemoveRepoFromTag = useCallback((tagId: string, repoFullName: string) => {
    const tag = projectTagsRef.current.find((item) => item.id === tagId);
    if (!tag) {
      throw new Error(`Project ${tagId} was not found.`);
    }
    const repo = repos.find((item) => item.full_name === repoFullName);
    if (!repo) {
      throw new Error(`Repository ${repoFullName} was not found.`);
    }

    void runProjectMutation(`Remove ${repoFullName} from ${tag.name}`, async () => {
      await replaceRepoTopics(repoFullName, repo.topics.filter((topic) => topic !== tag.id));
    });
  }, [repos, runProjectMutation, replaceRepoTopics]);

  const handleCreateProjectWithRepo = useCallback((name: string, repoFullName: string) => {
    const topic = normalizeProjectTopicName(name);
    handleAddProjectTag(topic, repoFullName);
  }, [handleAddProjectTag]);

  const handleDeleteProjectTag = useCallback((tagId: string) => {
    const tag = projectTagsRef.current.find((item) => item.id === tagId);
    if (!tag) {
      throw new Error(`Project ${tagId} was not found.`);
    }
    if (selectedProjectFilter === tagId) {
      setSelectedProjectFilter("all");
    }
    if (activeProjectDashboardId === tagId) {
      setActiveProjectDashboardId(null);
    }
    void runProjectMutation(`Delete project ${tag.name}`, async () => {
      const res = await fetch(`/api/github/projects/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Project deletion failed with HTTP ${res.status}`);
      }
      await fetchRepos();
      await refreshSyncDiagnostics();
    });
  }, [selectedProjectFilter, activeProjectDashboardId, runProjectMutation, fetchRepos, refreshSyncDiagnostics]);

  // Init fetch: config verify, repos list, projects metadata and sync logs
  useEffect(() => {
    void bootstrapWorkspace();
  }, [bootstrapWorkspace]);

  const components = useMemo(() => {
    return {
      welcome: () => (
        <WelcomeDashboard />
      ),
      explorer: (props: IDockviewPanelProps<DockPanelParams>) => (
        <RepositoryExplorer panelParams={props.params} />
      ),
      issue: (props: IDockviewPanelProps<{ owner?: string; repoName?: string; number?: number; data?: Issue }>) => (
        <DockviewIssueWrapper {...props} />
      ),
      pr: (props: IDockviewPanelProps<{ owner?: string; repoName?: string; number?: number; data?: PullRequest }>) => (
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
    activeProjectDashboardId,
    setSelectedProjectFilter,
    openRepo: handleOpenRepo,
    openProject: handleOpenProject,
    openRepositoryExplorer: handleOpenRepositoryExplorer,
    openProjectsDashboard: handleOpenProjectsDashboard,
    onGlobalRefresh: handleGlobalSync,
    onAddProjectTag: handleAddProjectTag,
    onCreateProjectWithRepo: handleCreateProjectWithRepo,
    onRemoveRepoFromTag: handleRemoveRepoFromTag,
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
    activeProjectDashboardId,
    handleOpenRepo,
    handleOpenProject,
    handleOpenRepositoryExplorer,
    handleOpenProjectsDashboard,
    handleGlobalSync,
    handleAddProjectTag,
    handleCreateProjectWithRepo,
    handleRemoveRepoFromTag,
    handleDeleteProjectTag,
    handleOpenTab,
  ]);

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <div className="w-screen h-screen flex flex-col bg-[#1e1e1e] overflow-hidden text-[#cccccc] font-sans">
      {(isInitialRepoLoadRunning || projectMutationNotifications.length > 0) && (
        <div className="fixed right-4 bottom-4 z-[200] w-[360px] max-w-[calc(100vw-2rem)] space-y-2">
          {isInitialRepoLoadRunning && (
            <div
              data-testid="initial-repo-loading-toast"
              className="border rounded bg-[#252526] shadow-xl px-3 py-2 text-xs border-[#3e3e3e] text-gray-200"
            >
              <div className="flex items-start gap-2">
                <RefreshCw size={13} className="mt-0.5 shrink-0 animate-spin text-[#007acc]" />
                <div className="min-w-0">
                  <div className="font-semibold leading-snug break-words">Loading repositories</div>
                  <div className="mt-1 text-[11px] text-gray-400 break-words">Reading live GitHub repository index</div>
                </div>
              </div>
            </div>
          )}
          {projectMutationNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`border rounded bg-[#252526] shadow-xl px-3 py-2 text-xs ${
                notification.status === "error"
                  ? "border-red-800 text-red-200"
                  : notification.status === "saved"
                  ? "border-emerald-800 text-emerald-200"
                  : "border-[#3e3e3e] text-gray-200"
              }`}
            >
              <div className="flex items-start gap-2">
                {notification.status === "queued" || notification.status === "saving" ? (
                  <RefreshCw size={13} className="mt-0.5 shrink-0 animate-spin text-[#007acc]" />
                ) : null}
                <div className="min-w-0">
                  <div className="font-semibold leading-snug break-words">{notification.label}</div>
                  <div className="mt-1 text-[11px] text-gray-400 break-words">{notification.detail}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* 1. Main Workspace Body row */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 1.1 Left Vertical VSCode Utility Activity Bar */}
        <VSCodeActivityBar
          activeView={activeView}
          setActiveView={handleToggleView}
          isTokenConfigured={isTokenConfigured}
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
              onSelectIssue={(owner, repo, data) => handleOpenTab(`issue-${owner}-${repo}-${data.number}`, "issue", `#${data.number}: ${data.title}`, owner, repo, data.number)}
              onSelectPR={(owner, repo, data) => handleOpenTab(`pr-${owner}-${repo}-${data.number}`, "pr", `PR #${data.number}: ${data.title}`, owner, repo, data.number)}
              onAddProjectTag={handleAddProjectTag}
              onCreateProjectWithRepo={handleCreateProjectWithRepo}
              onRemoveRepoFromTag={handleRemoveRepoFromTag}
              onDeleteProjectTag={handleDeleteProjectTag}
              openRepo={handleOpenRepo}
              openProject={handleOpenProject}
              openProjectsDashboard={handleOpenProjectsDashboard}
              openRepositoryExplorer={handleOpenRepositoryExplorer}
              openTabs={handleOpenTab}
              activeTabId={activeTabId}
              onClose={() => setSidebarOpen(false)}
              selectedProjectFilter={selectedProjectFilter}
              activeProjectDashboardId={activeProjectDashboardId}
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

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        projectTags={projectTags}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onToggleExplorer={() => handleOpenTab("explorer", "welcome", "Repository Explorer")}
        onSelectProjectFilter={setSelectedProjectFilter}
        onDeleteProjectTag={handleDeleteProjectTag}
        onGlobalRefresh={handleGlobalSync}
        onSwitchSidebarView={setActiveView}
        openTabs={handleOpenTab}
      />

    </div>
    </WorkspaceContext.Provider>
  );
}
