import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  Sparkles,
  Calendar,
  ExternalLink,
  User as UserIcon,
  Send,
  Tag,
  Loader2
} from "lucide-react";
import { Issue, Comment } from "../types";
import MarkdownViewer from "./MarkdownViewer";
import { useWorkspace } from "../context/WorkspaceContext";
import { WorkspaceBreadcrumbs } from "./WorkspacePrimitives";

interface IssueDetailViewProps {
  owner: string;
  repoName: string;
  issue: Issue;
  onRefreshItem: () => void;
}

export default function IssueDetailView({
  owner,
  repoName,
  issue,
  onRefreshItem
}: IssueDetailViewProps) {
  const fullName = `${owner}/${repoName}`;
  const { openRepo, openProject, openRepositoryExplorer, projectTags } = useWorkspace();
  const repoProjects = projectTags.filter((project) => project.repos.includes(fullName));

  // Local comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Sync state if issue receives updates
  useEffect(() => {
    fetchComments();
  }, [issue.number, fullName]);

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/github/repos/${owner}/${repoName}/issues/${issue.number}/comments`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setComments(data);
      }
    } catch (err) {
      console.error("Failed loading comments list", err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handlePostComment = async () => {
    if (!newCommentBody.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/github/repos/${owner}/${repoName}/issues/${issue.number}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newCommentBody })
      });
      if (res.ok) {
        const posted = await res.json();
        setComments((prev) => [...prev, posted]);
        setNewCommentBody("");
        // Notify sidebar/upper layers of actions
        onRefreshItem();
      }
    } catch (err) {
      console.error("Failed writing comment", err);
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#1e1e1e] text-[#cccccc] font-sans h-full select-text">
      {/* Left panel: Conversation */}
      <div className="flex-1 flex flex-col min-w-0 h-full border-r border-[#3e3e3e]">
        {/* Header summary banner */}
        <div className="p-4 border-b border-[#3e3e3e] shrink-0 bg-[#252526]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="pb-1.5 select-none">
                <WorkspaceBreadcrumbs
                  items={[
                    { label: "Repositories", onClick: openRepositoryExplorer },
                    { label: fullName, onClick: () => openRepo(fullName) },
                    { label: `Issue #${issue.number}` }
                  ]}
                />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight leading-snug break-words">
                {issue.title}
              </h2>
            </div>

            {/* External GitHub link */}
            <a
              href={issue.html_url}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 bg-[#3c3c3c] text-white hover:bg-gray-700 transition-colors font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 select-none cursor-pointer border border-[#3e3e3e]"
            >
              <ExternalLink size={12} />
              Open in GitHub
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 mt-3 text-[11.5px] text-gray-400 select-none border-t border-[#3e3e3e]/50 pt-2.5">
            <span className="flex items-center gap-1">
              <UserIcon size={12} className="text-gray-500" />
              <strong className="text-gray-300 font-semibold">{issue.user.login}</strong>
            </span>

            <span className="flex items-center gap-1 font-mono">
              <Calendar size={12} className="text-gray-500" />
              {new Date(issue.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric"
              })}
            </span>

            <span className="flex items-center gap-1 font-mono">
              <MessageSquare size={12} className="text-gray-500" />
              {comments.length} Comments
            </span>
            {repoProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => openProject(project.id)}
                className="px-2 py-0.5 rounded border text-[10px] font-mono font-semibold hover:bg-black/10"
                style={{
                  backgroundColor: `${project.color}15`,
                  borderColor: `${project.color}45`,
                  color: project.color,
                }}
              >
                {project.name}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic scroll area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-0 bg-[#1b1b1b]">
          {/* Issue Original Post Description */}
          <div className="border border-[#3e3e3e] rounded bg-[#232325] overflow-hidden shadow-sm">
            <div className="bg-[#2d2d30] px-4 py-2 border-b border-[#3e3e3e] flex items-center justify-between text-xs select-none">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{issue.user.login}</span>
                <span className="text-gray-500">original poster commented</span>
              </div>
              <span className="text-gray-500 font-mono">#{issue.number}</span>
            </div>
            <div className="p-4 text-xs leading-relaxed text-gray-200 select-text font-sans break-words bg-[#1f1f21] markdown-body font-normal">
              {issue.body ? (
                <MarkdownViewer content={issue.body} />
              ) : (
                <em className="text-gray-500">No description supplied.</em>
              )}
            </div>
          </div>

          {/* Labels array indicators */}
          {issue.labels && issue.labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 py-1 px-1 border-b border-gray-800/30 pb-3">
              <span className="text-[10px] font-mono text-gray-500 font-semibold uppercase pr-1.5 select-none">Repo Labels:</span>
              {issue.labels.map((l) => (
                <span
                  key={l.name}
                  className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold break-words"
                  style={{
                    backgroundColor: `#${l.color}1e`,
                    color: `#${l.color}`,
                    border: `1px solid #${l.color}55`
                  }}
                  title={l.name}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}

          {/* Timeline Comment Separator */}
          <div className="relative flex items-center justify-center py-2 select-none">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800/80" />
            </div>
            <span className="relative bg-[#1b1b1b] px-3.5 text-[10px] font-mono text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1">
              <MessageSquare size={12} /> Discussion History Segment
            </span>
          </div>

          {/* Timeline Comments Stream */}
          {loadingComments ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2.5">
              <Loader2 className="animate-spin text-[#007acc]" size={24} />
              <div className="text-xs text-gray-500 font-mono">Synchronizing telemetry discussion threads...</div>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-gray-800/60 rounded-md text-gray-500 select-none">
              <MessageSquare size={26} className="mx-auto text-gray-600 mb-2" />
              <div className="text-xs">No comments recorded on this issue yet.</div>
              <div className="text-[11px] text-gray-600 mt-1">Be the first to leave a feedback below!</div>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="border border-gray-800/80 rounded bg-[#1e1e20] overflow-hidden hover:border-gray-700/60 transition-colors"
                >
                  <div className="bg-[#29292c] px-3.5 py-2 border-b border-gray-800 flex items-center justify-between text-xs select-none">
                    <div className="flex items-center gap-2">
                      <strong className="font-semibold text-white">{comment.user.login}</strong>
                      <span className="text-gray-500">commented</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {new Date(comment.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </div>
                  <div className="p-3.5 text-xs text-gray-200 leading-relaxed font-sans break-words bg-[#1f1f21]/60 markdown-body font-normal">
                    <MarkdownViewer content={comment.body} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New comment textbox */}
          <div className="border border-[#3e3e3e] rounded bg-[#252526] p-4 space-y-3 shadow-md mt-6">
            <h3 className="text-xs font-mono font-semibold text-white uppercase tracking-wider select-none">Add Feedback Conversation</h3>
            <textarea
              rows={4}
              placeholder="Write a markdown comment... (Press Comment to post real-time sync)"
              className="w-full bg-[#1e1e1e] border border-[#3e3e3e] focus:border-[#007acc] rounded p-3 text-xs text-white outline-none placeholder-gray-600 leading-relaxed font-sans"
              value={newCommentBody}
              onChange={(e) => setNewCommentBody(e.target.value)}
              disabled={postingComment}
            />
            <div className="flex justify-between items-center text-xs select-none">
              <span className="text-[11px] text-gray-500 flex items-center gap-1 font-mono">
                <Sparkles size={11} className="text-[#007acc]" />
                Standard API comment posting
              </span>
              <button
                onClick={handlePostComment}
                disabled={postingComment || !newCommentBody.trim()}
                className="px-4 py-2 bg-[#007acc] hover:bg-[#0062a3] disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer text-xs font-sans shadow"
              >
                {postingComment ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                Comment
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right side Inspector panel */}
      <div className="w-[280px] h-full bg-[#252526] p-4 flex flex-col justify-between shrink-0 select-none border-l border-[#3e3e3e]">
        <div className="space-y-5">
          {/* Section: GitHub Labels */}
          <div className="space-y-2.5 pb-4 border-b border-[#3e3e3e]">
            <div className="text-[10px] font-semibold font-mono tracking-wider text-gray-500 uppercase flex items-center gap-1.5">
              <Tag size={12} />
              <span>GitHub Labels</span>
            </div>

            <div className="flex flex-wrap gap-1 px-1">
              {issue.labels.length === 0 ? (
                <div className="text-[11px] text-gray-500 italic p-1">No GitHub labels on this issue.</div>
              ) : (
                issue.labels.map((label) => (
                  <span
                    key={label.name}
                    className="text-[10px] font-mono rounded px-2 py-0.5 font-bold shrink-0 select-none"
                    style={{
                      backgroundColor: `#${label.color}1e`,
                      border: `1px solid #${label.color}55`,
                      color: `#${label.color}`
                    }}
                  >
                    {label.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Section: Repository details */}
          <div className="space-y-3.5 pb-4 text-[11px] leading-relaxed select-text">
            <div className="text-[10px] font-semibold font-mono tracking-wider text-gray-500 uppercase leading-none pb-0.5">
              Repository
            </div>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between border-b border-[#3e3e3e]/50 pb-1">
                <span className="text-gray-500 font-medium">Owner:</span>
                <span className="text-gray-300 font-bold">{owner}</span>
              </div>
              <div className="flex justify-between border-b border-[#3e3e3e]/50 pb-1">
                <span className="text-gray-500 font-medium">Repository:</span>
                <span className="text-gray-300 font-bold">{repoName}</span>
              </div>
              <div className="flex justify-between border-b border-[#3e3e3e]/50 pb-1">
                <span className="text-gray-500 font-medium">Issue:</span>
                <span className="text-[#007acc] font-bold">#{issue.number}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-[10px] font-mono text-gray-500 border-t border-[#3e3e3e] pt-3 flex items-center justify-between select-none">
          <span>GitHub issue data</span>
        </div>
      </div>
    </div>
  );
}
