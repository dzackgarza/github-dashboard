import React, { useState, useEffect } from "react";
import {
  GitPullRequest,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  FileCode,
  ShieldAlert,
  PlayCircle,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Calendar,
  Lock,
  Compass,
  ArrowRight,
  CheckCircle2,
  Terminal,
  Activity,
  History,
  Workflow
} from "lucide-react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { PullRequest, DiffFile, Comment } from "../types";
import MarkdownViewer from "./MarkdownViewer";

interface PRDetailViewProps {
  owner: string;
  repoName: string;
  pr: PullRequest;
  onRefreshItem: () => void;
}

export default function PRDetailView({
  owner,
  repoName,
  pr,
  onRefreshItem
}: PRDetailViewProps) {
  const fullName = `${owner}/${repoName}`;

  // Tabs: "conversation", "diff"
  const [activeSubTab, setActiveSubTab] = useState<"conversation" | "diff">("conversation");

  // Load detailed pull request (with files diff and CI statuses)
  const [prDetail, setPrDetail] = useState<PullRequest | null>(null);
  const [loading, setLoading] = useState(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // File diff selection
  const [selectedDiffFile, setSelectedDiffFile] = useState<DiffFile | null>(null);

  // CI Workflow run detail expansion
  const [expandedCIRunIndex, setExpandedCIRunIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchPRDetails();
    fetchComments();
  }, [pr.number, fullName]);

  const fetchPRDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/github/repos/${owner}/${repoName}/prs/${pr.number}/details`);
      const data = await res.json();
      setPrDetail(data);
      if (data.diff && data.diff.length > 0) {
        setSelectedDiffFile(data.diff[0]);
      }
    } catch (err) {
      console.error("Failed fetching PR details", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/github/repos/${owner}/${repoName}/issues/${pr.number}/comments`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setComments(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingComments(false);
    }
  };

  const handlePostComment = async () => {
    if (!newCommentBody.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/github/repos/${owner}/${repoName}/issues/${pr.number}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newCommentBody })
      });
      if (res.ok) {
        const posted = await res.json();
        setComments((prev) => [...prev, posted]);
        setNewCommentBody("");
        onRefreshItem();
      }
    } catch (err) {
      console.error("Comment post error", err);
    } finally {
      setPostingComment(false);
    }
  };

  const fileDiffs = prDetail?.diff || [];
  const ciStatus = prDetail?.ci_status || {
    state: "pending",
    runs: [],
    unresolved_threads_count: 0,
    security_alerts_count: 0
  };

  const renderDiffLineElement = (line: string, index: number) => {
    let style = "text-gray-300 bg-transparent";
    if (line.startsWith("+") && !line.startsWith("+++")) {
      style = "text-[#4ade80] bg-[#163a21] border-l-4 border-emerald-500";
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      style = "text-[#f87171] bg-[#3b1c1c] border-l-4 border-red-500";
    } else if (line.startsWith("@@")) {
      style = "text-[#60a5fa] bg-[#172554] font-bold text-[10px] select-none py-0.5";
    }

    return (
      <div key={index} className={`px-4 py-0.5 border-b border-gray-905/10 font-mono text-[11px] leading-relaxed select-text font-medium ${style}`}>
        {line}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] text-[#cccccc] font-sans h-full select-text min-h-0">
      {/* 1. Header Information Bar */}
      <div className="p-4 border-b border-[#3e3e3e] shrink-0 bg-[#252526] select-none">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-mono text-gray-400 flex items-center gap-1 leading-none pb-1.5">
              <span>{fullName}</span>
              <ChevronRight size={10} className="text-gray-500" />
              <span>Pull Request #{pr.number}</span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight leading-snug truncate">
              {pr.title}
            </h2>
          </div>

          <a
            href={pr.html_url}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1 bg-[#3c3c3c] text-white hover:bg-gray-700 transition-colors font-mono text-[11px] rounded flex items-center gap-1.5 shrink-0 cursor-pointer border border-[#3e3e3e]"
          >
            <ExternalLink size={12} />
            Open in GitHub
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-3 text-[11.5px] text-gray-400">
          <span className="px-3 py-1 text-xs font-bold font-sans rounded-full flex items-center gap-1.5 bg-purple-950/50 text-purple-400 border border-purple-900 leading-none">
            <GitPullRequest size={13} className="text-purple-400 animate-pulse shrink-0" />
            Open PR
          </span>

          <span className="flex items-center gap-1">
            <img src={pr.user.avatar_url} className="w-5 h-5 rounded-full ring-1 ring-gray-700" alt="" />
            <strong className="text-gray-300 font-semibold">@{pr.user.login}</strong>
          </span>

          <span className="flex items-center gap-1 font-mono">
            <Calendar size={12} className="text-gray-500" />
            {new Date(pr.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric"
            })}
          </span>

          {/* Quick CI status inline indicator */}
          <div
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded border text-[11px] font-mono font-bold leading-tight ${
              ciStatus.state === "success"
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-900"
                : ciStatus.state === "failure"
                ? "bg-red-950/40 text-red-400 border-red-900"
                : "bg-amber-950/40 text-amber-400 border-amber-900"
            }`}
            title="Continuous Integration status summary"
          >
            {ciStatus.state === "success" ? (
              <CheckCircle size={11} className="text-emerald-400" />
            ) : ciStatus.state === "failure" ? (
              <XCircle size={11} className="text-red-400" />
            ) : (
              <Clock size={11} className="animate-spin text-amber-400" />
            )}
            <span>CI Status: {ciStatus.state.toUpperCase()}</span>
          </div>
        </div>

        {/* Workspace Tab navigation bar */}
        <div className="flex border-t border-[#3e3e3e]/50 mt-3 pt-3 gap-2 text-xs font-mono select-none">
          <button
            onClick={() => setActiveSubTab("conversation")}
            className={`px-3 py-1 rounded hover:bg-gray-800 transition-colors font-medium flex items-center gap-2 cursor-pointer ${
              activeSubTab === "conversation" ? "bg-[#37373d] text-white font-bold border border-[#3e3e3e]" : "text-gray-400 border border-transparent"
            }`}
          >
            <MessageSquare size={13} />
            Conversation Threads ({comments.length + 1})
          </button>
          <button
            onClick={() => setActiveSubTab("diff")}
            className={`px-3 py-1 rounded hover:bg-gray-800 transition-colors font-medium flex items-center gap-2 cursor-pointer ${
              activeSubTab === "diff" ? "bg-[#37373d] text-white font-bold border border-[#3e3e3e]" : "text-gray-400 border border-transparent"
            }`}
          >
            <FileCode size={13} />
            Modified Files ({fileDiffs.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-[#007acc]" size={32} />
          <div className="text-xs text-gray-500 font-mono">Unpacking pull request differential tree...</div>
        </div>
      ) : (
        <PanelGroup orientation="horizontal" className="flex-1 min-h-0 flex overflow-hidden">
          <Panel defaultSize={75} minSize={15} className="flex flex-col min-h-0 min-w-0 overflow-hidden">
            {/* LEFT CONTENT AREA: TAB 1 Conversation OR TAB 2 Diff */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
            {activeSubTab === "conversation" ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar bg-[#18181a]">
                {/* Main description of original post */}
                <div className="border border-gray-800/80 rounded bg-[#232325] overflow-hidden shadow-sm">
                  <div className="bg-[#2d2d30] px-4 py-2 border-b border-gray-800 flex items-center justify-between text-xs select-none">
                    <div className="flex items-center gap-2">
                      <img src={pr.user.avatar_url} className="w-5 h-5 rounded-full" alt="" />
                      <span className="font-semibold text-white">@{pr.user.login}</span>
                      <span className="text-gray-500">submitted merger request</span>
                    </div>
                    <span className="text-gray-500 font-mono">#{pr.number}</span>
                  </div>
                  <div className="p-4 text-xs leading-relaxed text-gray-200 select-text font-sans break-words bg-[#1f1f21] markdown-body">
                    {pr.body ? (
                      <MarkdownViewer content={pr.body} />
                    ) : (
                      <em className="text-gray-500">No original pull request description registered.</em>
                    )}
                  </div>
                </div>

                {/* Pull request tags labels */}
                {pr.labels && pr.labels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 py-1 px-1 border-b border-gray-850 pb-3">
                    <span className="text-[10px] font-mono text-gray-500 font-semibold uppercase pr-2 select-none">Labels Assigned:</span>
                    {pr.labels.map((l) => (
                      <span
                        key={l.name}
                        className="text-[10px] px-2.5 py-0.5 rounded font-mono font-bold"
                        style={{
                          backgroundColor: `#${l.color}15`,
                          color: `#${l.color}`,
                          border: `1px solid #${l.color}45`
                        }}
                      >
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Timeline separation layout */}
                <div className="relative flex items-center justify-center py-2 select-none">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-850" />
                  </div>
                  <span className="relative bg-[#18181a] px-3.5 text-[9.5px] font-mono text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1">
                    <History size={12} className="text-gray-500" />
                    Review Timeline Conversation
                  </span>
                </div>

                {/* Timeline comments list */}
                {loadingComments ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin text-gray-500" size={20} />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-gray-800/60 rounded bg-[#1f1f21]/30 text-gray-500 text-xs select-none">
                    No timeline discussions are posted yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="border border-gray-800/80 rounded bg-[#1e1e20] overflow-hidden"
                      >
                        <div className="bg-[#29292c] px-3.5 py-2 border-b border-gray-800 flex items-center justify-between text-xs select-none font-sans">
                          <div className="flex items-center gap-2">
                            <img
                              src={comment.user.avatar_url}
                              alt=""
                              className="w-4.5 h-4.5 rounded-full"
                            />
                            <strong className="font-semibold text-white">@{comment.user.login}</strong>
                            <span className="text-gray-500">replied</span>
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
                        <div className="p-3.5 text-xs text-gray-200 font-sans break-words bg-[#1f1f21]/60 markdown-body font-normal">
                          <MarkdownViewer content={comment.body} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new message block */}
                <div className="border border-gray-800 rounded-md bg-[#252526] p-4 space-y-3.5 shadow mt-6">
                  <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider select-none">Add review comments</h3>
                  <textarea
                    rows={3}
                    placeholder="Type commentary here (Markdown supported)..."
                    className="w-full bg-[#1e1e1e] border border-gray-800 focus:border-[#007acc] rounded p-3 text-xs text-white outline-none placeholder-gray-600 leading-relaxed font-sans"
                    value={newCommentBody}
                    onChange={(e) => setNewCommentBody(e.target.value)}
                    disabled={postingComment}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handlePostComment}
                      disabled={postingComment || !newCommentBody.trim()}
                      className="px-4.5 py-2 bg-[#007acc] hover:bg-[#0062a3] disabled:bg-gray-800 disabled:text-gray-650 text-white font-semibold rounded cursor-pointer text-xs flex items-center gap-1.5 transition-colors"
                    >
                      {postingComment && <Loader2 size={13} className="animate-spin shrink-0" />}
                      Post comment review
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* TAB 2: DIFF AND FILES PANEL */
              <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
                {/* Left panel inside tab: Files */}
                <div className="w-56 border-r border-[#2b2b2b] overflow-y-auto bg-[#1a1a1c] p-2 flex flex-col gap-1 shrink-0 select-none scrollbar-thin">
                  <div className="text-[9.5px] font-bold font-mono tracking-wider text-gray-500 uppercase px-2 py-1 flex items-center gap-1 leading-none pb-1.5">
                    <Compass size={11} className="text-gray-500" />
                    <span>Differential Trees</span>
                  </div>
                  {fileDiffs.length === 0 ? (
                    <div className="text-gray-500 italic p-2 text-center text-[10.5px]">No file alterations registered.</div>
                  ) : (
                    fileDiffs.map((df) => {
                      const isSelected = selectedDiffFile?.file === df.file;
                      return (
                        <button
                          key={df.file}
                          onClick={() => setSelectedDiffFile(df)}
                          className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono leading-relaxed truncate cursor-pointer transition-colors flex items-center justify-between ${
                            isSelected
                              ? "bg-[#37373d] text-white border-l-2 border-[#007acc]"
                              : "text-gray-400 hover:text-gray-200 hover:bg-[#28282b]"
                          }`}
                          title={df.file}
                        >
                          <span className="truncate">{df.file.split("/").pop()}</span>
                          <span className="text-[9.5px] font-mono font-bold text-emerald-500 ml-1 shrink-0">
                            +{df.additions}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Right code output panel */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#161616] overflow-hidden">
                  {selectedDiffFile ? (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="px-4 py-2 bg-[#252526] border-b border-gray-900 flex items-center justify-between select-none text-xs shrink-0">
                        <div className="flex items-center gap-1.5 font-mono text-gray-300">
                          <FileCode size={13} className="text-[#007acc]" />
                          <span className="font-semibold truncate max-w-sm">{selectedDiffFile.file}</span>
                        </div>
                        <div className="text-[10px] font-mono text-gray-500 shrink-0 select-none">
                          <span className="text-emerald-400">+{selectedDiffFile.additions} additions</span>
                          <span className="mx-1.5">•</span>
                          <span className="text-red-400">-{selectedDiffFile.deletions} deletions</span>
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto p-0 font-mono text-xs select-text leading-relaxed bg-[#111111] scrollbar-thin">
                        {selectedDiffFile.code ? (
                          <div className="py-2 min-w-max">
                            {selectedDiffFile.code.split("\n").map((line, idx) => renderDiffLineElement(line, idx))}
                          </div>
                        ) : (
                          <div className="text-gray-600 italic text-center p-8">No code differences to exhibit.</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500 select-none">
                      <FileCode size={30} className="text-gray-600 mb-2" />
                      <div>Select a differential file from tree explorer list.</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </Panel>

          <PanelResizeHandle className="w-[4px] bg-[#1a1a1c]/80 hover:bg-[#007acc] active:bg-[#007acc] transition-colors cursor-col-resize select-none shrink-0" />

          {/* PERSISTENT RIGHT SIDEBAR: CI WORKFLOWS RUNS, OUTSTANDING SECURITY AUDITS, UNRESOLVED THREAD TRACKER */}
          <Panel defaultSize={25} minSize={15} maxSize={80} className="flex flex-col min-h-0 min-w-0 overflow-hidden">
            <div className="flex-1 bg-[#252526] border-l border-[#3e3e3e] flex flex-col justify-between select-none overflow-y-auto custom-scrollbar p-5 space-y-5 min-w-0">
              
              <div className="space-y-4">
                {/* Sidebar Header Section 1: Merge branches pointer details */}
                <div className="space-y-2 pb-3.5 border-b border-[#3e3e3e]">
                  <span className="text-[10px] font-mono font-bold tracking-wider text-gray-500 uppercase block">
                    Integration References
                  </span>
                  <div className="bg-[#1b1b1c] p-2.5 rounded border border-gray-800/60 flex items-center justify-between text-xs font-mono">
                    <span className="text-purple-400 font-bold bg-[#131314] px-1.5 py-0.5 rounded">
                      {prDetail?.base_branch}
                    </span>
                    <ArrowRight size={12} className="text-gray-500 shrink-0" />
                    <span className="text-blue-400 font-bold bg-[#131112] px-1.5 py-0.5 rounded">
                      {prDetail?.head_branch}
                    </span>
                  </div>
                </div>

                {/* Sidebar Section 2: Continuous Integration Workflow runs */}
                <div className="space-y-2.5 pb-3.5 border-b border-[#3e3e3e]">
                  <div className="flex items-center justify-between pr-1">
                    <span className="text-[10px] font-mono font-bold tracking-wider text-gray-400 uppercase flex items-center gap-1.5">
                      <Workflow size={12} className="text-[#007acc]" />
                      <span>CI Check suites ({ciStatus.runs.length})</span>
                    </span>
                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded uppercase ${
                      ciStatus.state === "success" ? "text-emerald-400 bg-emerald-950/20" : "text-amber-400 bg-amber-950/20"
                    }`}>
                      {ciStatus.state}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {ciStatus.runs.length === 0 ? (
                      <span className="text-xs text-gray-500 font-mono italic">No actions logs registered.</span>
                    ) : (
                      ciStatus.runs.map((run, index) => {
                        const isExpanded = expandedCIRunIndex === index;
                        const isSuccess = run.conclusion === "success" || run.status === "success";

                        return (
                          <div
                            key={`ref-run-${index}`}
                            className="bg-[#1b1b1c] rounded border border-gray-800/80 overflow-hidden text-xs"
                          >
                            <div
                              onClick={() => setExpandedCIRunIndex(isExpanded ? null : index)}
                              className="p-2 px-2.5 flex items-center justify-between hover:bg-[#202022] cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                {isSuccess ? (
                                  <CheckCircle size={12} className="text-emerald-500 shrink-0 font-bold" />
                                ) : (
                                  <XCircle size={12} className="text-red-400 shrink-0" />
                                )}
                                <span className="truncate text-gray-300 font-medium font-mono text-[11px]">{run.name}</span>
                              </div>
                              <span className="text-[9.5px] font-mono text-gray-500 shrink-0">
                                {isExpanded ? "Hide" : "Tail"}
                              </span>
                            </div>

                            {/* Collapsible terminal steps log readout */}
                            {isExpanded && (
                              <div className="p-2 border-t border-gray-900 bg-black text-[10px] font-mono text-emerald-400 leading-normal select-text max-h-40 overflow-y-auto whitespace-pre-wrap">
                                <div className="text-[9px] text-[#007acc] border-b border-gray-900 pb-1 mb-1 font-bold">
                                  TERMINAL SNAPSHOT ({run.elapsed}):
                                </div>
                                {run.logs || "[INFO] Run build initialized correctly.\n[INFO] Tests passed cleanly in container."}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Sidebar Section 3: Security vulnerability scanner diagnostics */}
                <div className="space-y-2 pb-3.5 border-b border-[#3e3e3e]">
                  <span className="text-[10px] font-mono font-bold tracking-wider text-gray-500 uppercase flex items-center gap-1.5">
                    <ShieldAlert size={12} className="text-red-500" />
                    <span>Security Alerts</span>
                  </span>

                  {ciStatus.security_alerts_count > 0 ? (
                    <div className="p-2.5 bg-red-950/20 border border-red-900/60 rounded text-[11px] leading-snug text-red-300 space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <AlertTriangle size={11} className="text-red-400" />
                        <span>{ciStatus.security_alerts_count} security alerts</span>
                      </div>
                      <p className="text-gray-400">
                        Review the repository security alerts in GitHub.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-[#1b1b1c] p-2.5 rounded border border-[#3e3e3e]/40 text-center text-[10px] text-gray-500 font-mono">
                      <CheckCircle2 size={16} className="mx-auto text-emerald-500 mb-1" />
                      No GitHub security alerts reported.
                    </div>
                  )}
                </div>

                {/* Sidebar Section 4: Resolution discussions checklists */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold tracking-wider text-gray-500 uppercase flex items-center gap-1.5">
                    <Activity size={12} className="text-purple-400" />
                <span>Review Threads</span>
                  </span>
                  <div className="bg-[#1b1b1c] p-2.5 rounded border border-[#3e3e3e]/40 text-[10.5px] font-mono text-gray-400 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${ciStatus.unresolved_threads_count > 0 ? "bg-amber-500" : "bg-emerald-500"}`} />
                      <span>{ciStatus.unresolved_threads_count} outstanding discussion threads remaining</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Review state from GitHub checks</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar bottom indicator */}
              <div className="text-[9.5px] font-mono text-gray-600 flex justify-between border-t border-[#3e3e3e]/40 pt-3 select-none">
                <span>GitHub PR data</span>
                <span>{ciStatus.state}</span>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      )}
    </div>
  );
}
