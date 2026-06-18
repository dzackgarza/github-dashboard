import React, { createContext, useContext } from "react";
import { Repo, ProjectTag, SyncLog, RateLimit, Tab } from "../types";

export interface WorkspaceContextType {
  repos: Repo[];
  projectTags: ProjectTag[];
  syncTimestamps: Record<string, string>;
  isSyncing: Record<string, boolean>;
  syncLogs: SyncLog[];
  rateLimit: RateLimit;
  isTokenConfigured: boolean;
  githubUser: any;
  isSyncingGlobal: boolean;
  selectedProjectFilter: string;
  activeRepoFullName: string | null;
  setSelectedProjectFilter: (filter: string) => void;
  openRepo: (repoFullName: string) => void;
  openProject: (projectId: string) => void;
  onForceSync: (owner: string, repo: string) => void;
  onGlobalRefresh: () => void;
  onAddProjectTag: (tagName: string, repoFullName: string) => void;
  onRemoveRepoFromTag: (tagId: string, repoFullName: string) => void;
  onCreateProjectTag: (name: string, color: string) => void;
  onDeleteProjectTag: (tagId: string) => void;
  openTabs: (id: string, type: Tab["type"], title: string, owner?: string, repo?: string, number?: number) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
