import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  FolderGit2,
  Layers,
  Plus,
  Tags,
  Trash2,
  X
} from "lucide-react";
import { Label, ProjectTag, Repo } from "../types";
import { invariant } from "../utils/invariant";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export function WorkspaceBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav data-testid="workspace-breadcrumbs" className="flex items-center gap-1 text-[11px] font-mono text-gray-400">
      {items.map((item, index) => (
        <React.Fragment key={`${item.label}-${index}`}>
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              className="rounded px-1.5 py-0.5 hover:bg-[#2d2d2d] hover:text-white"
            >
              {item.label}
            </button>
          ) : (
            <span className="px-1.5 py-0.5 text-gray-300">{item.label}</span>
          )}
          {index < items.length - 1 ? <span className="text-gray-600">/</span> : null}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function LabelFilterSelect({
  labels,
  value,
  onChange,
  testId
}: {
  labels: Label[];
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  const orderedLabels = useMemo(
    () => [...labels].sort((left, right) => left.name.localeCompare(right.name)),
    [labels]
  );

  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="bg-[#1e1e1f] border border-[#3e3e3e] rounded px-2 py-1 text-[11px] text-gray-300 outline-none focus:border-[#007acc]"
    >
      <option value="all">All labels</option>
      {orderedLabels.map((label) => (
        <option key={label.name} value={label.name}>
          {label.name}
        </option>
      ))}
    </select>
  );
}

export function ProjectPill({
  project,
  onOpenProject,
  className = ""
}: {
  project: ProjectTag;
  onOpenProject: (projectId: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenProject(project.id)}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold ${className}`}
      style={{
        backgroundColor: `${project.color}18`,
        borderColor: `${project.color}55`,
        color: project.color
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
      {project.name}
    </button>
  );
}

export function RepoCard({
  repo,
  projects,
  onOpenRepo,
  onOpenProject,
  onManageProjects,
  onContextMenu,
  draggable,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchEnd
}: {
  repo: Repo;
  projects: ProjectTag[];
  onOpenRepo: (repoFullName: string) => void;
  onOpenProject: (projectId: string) => void;
  onManageProjects: (repo: Repo) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onDragEnd?: () => void;
  onTouchStart?: (event: React.TouchEvent) => void;
  onTouchEnd?: () => void;
}) {
  return (
    <div
      data-testid="repo-card"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onContextMenu={onContextMenu}
      className="bg-[#222224] border border-[#3e3e3e]/80 rounded p-4 flex flex-col justify-between gap-4 shadow transition-colors hover:border-gray-500"
    >
      <div className="space-y-2.5">
        <div className="flex items-start gap-2 min-w-0">
          <span className="w-5.5 h-5.5 rounded bg-gray-800 border border-gray-700 shrink-0 flex items-center justify-center">
            <FolderGit2 size={13} className="text-[#007acc]" />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-xs text-white break-all font-mono leading-snug tracking-tight">
              {repo.name}
            </h3>
            <div className="text-[10px] text-gray-500 font-mono break-all">{repo.full_name}</div>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed break-words select-text">
          {repo.description || "No repository description."}
        </p>
      </div>

      <div className="space-y-3 pt-3 border-t border-[#3e3e3e]/60">
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-500">
          <span>
            Issues: <strong className="text-gray-300">{repo.open_issues_count ?? 0}</strong>
          </span>
          <span className="col-span-2">
            Last Updated: <strong className="text-gray-400">{formatRelativeTime(repo.latest_commit_at)}</strong>
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {projects.length === 0 ? (
            <span className="text-[9px] font-mono text-gray-600 italic select-none">No Projects mapped</span>
          ) : (
            projects.map((project) => (
              <ProjectPill key={project.id} project={project} onOpenProject={onOpenProject} />
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid={`repo-card-${repo.full_name}`}
            onClick={() => onOpenRepo(repo.full_name)}
            className="px-2.5 py-1 rounded bg-[#094771] hover:bg-[#0e5f95] text-white text-[10px] font-mono font-semibold"
          >
            Open repository dashboard
          </button>
          <button
            type="button"
            onClick={() => onManageProjects(repo)}
            className="px-2.5 py-1 rounded border border-[#3e3e3e] text-gray-300 hover:text-white hover:border-gray-500 text-[10px] font-mono inline-flex items-center gap-1"
          >
            <Tags size={11} />
            Manage projects
          </button>
          <a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded border border-[#3e3e3e] text-gray-400 hover:text-white hover:border-gray-500 text-[10px] font-mono inline-flex items-center gap-1"
          >
            <ExternalLink size={11} />
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

export function ProjectCard({
  project,
  repoCount,
  issueCount,
  onOpenProject,
  onManageProject
}: {
  project: ProjectTag;
  repoCount: number;
  issueCount: number;
  onOpenProject: (projectId: string) => void;
  onManageProject: (project: ProjectTag) => void;
}) {
  return (
    <div data-testid="project-card" className="bg-[#222224] border border-[#3e3e3e]/80 rounded p-4 flex flex-col gap-3 shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
              style={{ backgroundColor: project.color }}
            />
            <h4 className="font-bold text-xs text-white break-words font-mono leading-snug">{project.name}</h4>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500 font-mono">
            <span>
              Repos: <strong className="text-gray-300">{repoCount}</strong>
            </span>
            <span>
              Issues: <strong className="text-gray-300">{issueCount}</strong>
            </span>
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 pt-2 border-t border-[#3e3e3e]/60">
        <button
          type="button"
          onClick={() => onOpenProject(project.id)}
          className="px-2.5 py-1 rounded bg-[#094771] hover:bg-[#0e5f95] text-white text-[10px] font-mono font-semibold inline-flex items-center gap-1"
        >
          <ArrowRight size={11} />
          Open project dashboard
        </button>
        <button
          type="button"
          onClick={() => onManageProject(project)}
          className="px-2.5 py-1 rounded border border-[#3e3e3e] text-gray-300 hover:text-white hover:border-gray-500 text-[10px] font-mono"
        >
          Manage Project
        </button>
      </div>
    </div>
  );
}

type AssignmentTarget =
  | { type: "repo"; repo: Repo }
  | { type: "project"; project: ProjectTag };

export function ProjectAssignmentDialog({
  target,
  repos,
  projectTags,
  onClose,
  onOpenProject,
  onAddProjectTag,
  onCreateProjectWithRepo,
  onRemoveRepoFromTag,
  onDeleteProjectTag
}: {
  target: AssignmentTarget | null;
  repos: Repo[];
  projectTags: ProjectTag[];
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
  onAddProjectTag: (tagName: string, repoFullName: string) => void;
  onCreateProjectWithRepo: (name: string, repoFullName: string) => void;
  onRemoveRepoFromTag: (tagId: string, repoFullName: string) => void;
  onDeleteProjectTag: (tagId: string) => void;
}) {
  const [projectName, setProjectName] = useState("");

  if (!target) {
    return null;
  }

  const submitCreate = (repo: Repo) => {
    const name = projectName.trim();
    invariant(name.length > 0, "Project name is required.");
    onCreateProjectWithRepo(name, repo.full_name);
    setProjectName("");
    onClose();
  };

  const assignedProjects = target.type === "repo"
    ? projectTags.filter((project) => project.repos.includes(target.repo.full_name))
    : [];
  const unassignedProjects = target.type === "repo"
    ? projectTags.filter((project) => !project.repos.includes(target.repo.full_name))
    : [];
  const projectRepos = target.type === "project"
    ? repos.filter((repo) => target.project.repos.includes(repo.full_name))
    : [];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 px-4" role="dialog" aria-modal="true">
      <div data-testid="project-assignment-dialog" className="w-full max-w-lg rounded border border-[#3e3e3e] bg-[#252526] shadow-2xl text-[#cccccc]">
        <div className="flex items-start justify-between gap-4 border-b border-[#3e3e3e] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
              {target.type === "repo" ? <FolderGit2 size={14} className="text-[#007acc]" /> : <Layers size={14} className="text-[#007acc]" />}
              <span>{target.type === "repo" ? target.repo.full_name : target.project.name}</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500 font-mono">GitHub topic-backed project assignment</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-[#333] hover:text-white">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {target.type === "repo" ? (
            <>
              <section className="space-y-2">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-400">Assign existing project</h3>
                {unassignedProjects.length === 0 ? (
                  <p className="text-xs text-gray-500 font-mono">No unassigned projects.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {unassignedProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => {
                          onAddProjectTag(project.name, target.repo.full_name);
                          onClose();
                        }}
                        className="rounded border border-[#3e3e3e] px-2 py-1 text-[11px] text-gray-300 hover:border-[#007acc] hover:text-white"
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-400">Create and assign</h3>
                <div className="flex gap-2">
                  <input
                    data-testid="project-assignment-create-input"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        submitCreate(target.repo);
                      }
                    }}
                    className="min-w-0 flex-1 rounded border border-[#3e3e3e] bg-[#1e1e1f] px-2 py-1.5 text-xs text-white outline-none focus:border-[#007acc]"
                    placeholder="project topic name"
                  />
                  <button
                    data-testid="project-assignment-create-button"
                    type="button"
                    onClick={() => submitCreate(target.repo)}
                    className="rounded bg-[#094771] px-2.5 py-1.5 text-xs font-mono font-semibold text-white hover:bg-[#0e5f95] inline-flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Create
                  </button>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-400">Assigned projects</h3>
                {assignedProjects.length === 0 ? (
                  <p className="text-xs text-gray-500 font-mono">This repository is not assigned to a project.</p>
                ) : (
                  <div className="space-y-2">
                    {assignedProjects.map((project) => (
                      <div key={project.id} className="flex items-center justify-between gap-2 rounded border border-[#3e3e3e]/70 bg-[#1e1e1f] px-2 py-1.5">
                        <ProjectPill project={project} onOpenProject={onOpenProject} />
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveRepoFromTag(project.id, target.repo.full_name);
                            onClose();
                          }}
                          className="rounded px-2 py-1 text-[10px] font-mono text-gray-400 hover:bg-red-950/40 hover:text-red-200"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-400">Project repositories</h3>
                {projectRepos.length === 0 ? (
                  <p className="text-xs text-gray-500 font-mono">No repositories carry this topic.</p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {projectRepos.map((repo) => (
                      <div key={repo.full_name} className="flex items-center justify-between gap-2 rounded border border-[#3e3e3e]/70 bg-[#1e1e1f] px-2 py-1.5">
                        <span className="min-w-0 break-all text-[11px] font-mono text-gray-300">{repo.full_name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveRepoFromTag(target.project.id, repo.full_name);
                            onClose();
                          }}
                          className="rounded px-2 py-1 text-[10px] font-mono text-gray-400 hover:bg-red-950/40 hover:text-red-200"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <button
                type="button"
                onClick={() => {
                  onDeleteProjectTag(target.project.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1 rounded border border-red-900/70 bg-red-950/30 px-2.5 py-1.5 text-xs font-mono text-red-200 hover:bg-red-900/40"
              >
                <Trash2 size={12} />
                Remove topic from all repos
              </button>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-[#3e3e3e] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#3e3e3e] px-3 py-1.5 text-xs font-mono text-gray-300 hover:text-white"
          >
            Cancel assignment
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(isoString?: string | null) {
  if (!isoString) {
    return "No commits";
  }
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
