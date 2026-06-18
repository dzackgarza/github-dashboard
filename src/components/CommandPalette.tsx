import React, { useState, useEffect, useRef } from "react";
import { Terminal, Command, Filter, Folder, Search, Sparkles, Trash2, X, RefreshCw, Layers } from "lucide-react";
import { ProjectTag, Repo } from "../types";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  projectTags: ProjectTag[];
  repos: Repo[];
  onToggleSidebar: () => void;
  onToggleExplorer: () => void;
  onSelectProjectFilter: (tagId: string) => void;
  onCreateProjectTag: (name: string, color: string) => void;
  onDeleteProjectTag: (tagId: string) => void;
  onGlobalRefresh: () => void;
  onSwitchSidebarView: (view: "explorer" | "sync" | "settings") => void;
  openTabs: (id: string, type: any, title: string, owner?: string, repo?: string, number?: number) => void;
}

interface PaletteCommand {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  action: () => void;
  shortcut?: string;
}

export default function CommandPalette({
  isOpen,
  onClose,
  projectTags,
  repos,
  onToggleSidebar,
  onToggleExplorer,
  onSelectProjectFilter,
  onCreateProjectTag,
  onDeleteProjectTag,
  onGlobalRefresh,
  onSwitchSidebarView,
  openTabs
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [subMode, setSubMode] = useState<"none" | "delete-tag" | "select-filter" | "create-tag">("none");
  const [newTagName, setNewTagName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset states when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      setSubMode("none");
      setNewTagName("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle global shortcuts and Escape.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes current submode or whole palette
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        if (subMode !== "none") {
          setSubMode("none");
          setQuery("");
          setActiveIndex(0);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, subMode, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector("[data-active='true']");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  // Colors list for tag group creation
  const colors = ["#3b82f6", "#10b981", "#ef4444", "#a855f7", "#f59e0b", "#14b8a6", "#f43f5e", "#64748b"];

  // Core level-0 commands list
  const baseCommands: PaletteCommand[] = [
    {
      id: "refresh",
      title: "Sync with GitHub",
      subtitle: "Refresh repositories, open issues, and open pull requests",
      category: "System",
      shortcut: "R",
      action: () => {
        onGlobalRefresh();
        onClose();
      }
    },
    {
      id: "toggle-sidebar",
      title: "Toggle Explorer Sidebar",
      subtitle: "Show or hide repository navigation",
      category: "View",
      shortcut: "Ctrl+B",
      action: () => {
        onToggleSidebar();
        onClose();
      }
    },
    {
      id: "welcome-dashboard",
      title: "View Dashboard",
      subtitle: "Open the GitHub work dashboard",
      category: "View",
      action: () => {
        openTabs("welcome", "welcome", "Welcome Dashboard");
        onClose();
      }
    },
    {
      id: "full-explorer",
      title: "Open Repositories",
      subtitle: "Open the repository browser",
      category: "View",
      action: () => {
        onToggleExplorer();
        onClose();
      }
    },
    {
      id: "create-tag-trigger",
      title: "Create Project...",
      subtitle: "Create a repository group",
      category: "Tags",
      action: () => {
        setSubMode("create-tag");
        setQuery("");
        setActiveIndex(0);
      }
    },
    {
      id: "select-filter-trigger",
      title: "Filter by Project...",
      subtitle: "Limit views to a project",
      category: "Tags",
      action: () => {
        setSubMode("select-filter");
        setQuery("");
        setActiveIndex(0);
      }
    },
    {
      id: "delete-tag-trigger",
      title: "Delete Project...",
      subtitle: "Remove a repository group",
      category: "Tags",
      action: () => {
        setSubMode("delete-tag");
        setQuery("");
        setActiveIndex(0);
      }
    },
    {
      id: "switch-sidebar-explorer",
      title: "Sidebar: Show Repositories",
      subtitle: "Show repository navigation",
      category: "Sidebar",
      action: () => {
        onSwitchSidebarView("explorer");
        onClose();
      }
    },
    {
      id: "switch-sidebar-sync",
      title: "Developer: Show Sync Log",
      subtitle: "View cache headers, sync log entries, and rate limits",
      category: "Sidebar",
      action: () => {
        onSwitchSidebarView("sync");
        onClose();
      }
    },
    {
      id: "switch-sidebar-settings",
      title: "Sidebar: Show Settings",
      subtitle: "View GitHub token configuration",
      category: "Sidebar",
      action: () => {
        onSwitchSidebarView("settings");
        onClose();
      }
    }
  ];

  // Render specific selections based on active submenu mode
  let filteredOptions: { id: string; title: string; subtitle?: string; action: () => void }[] = [];

  if (subMode === "none") {
    filteredOptions = baseCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        (c.subtitle || "").toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
    );
  } else if (subMode === "delete-tag") {
    filteredOptions = projectTags
      .filter((tag) => tag.name.toLowerCase().includes(query.toLowerCase()))
      .map((tag) => ({
        id: tag.id,
        title: `Delete Tag: ${tag.name}`,
        subtitle: `Contains ${tag.repos.length} mapped repositories`,
        action: () => {
          onDeleteProjectTag(tag.id);
          setSubMode("none");
          setQuery("");
        }
      }));
    if (filteredOptions.length === 0) {
      filteredOptions = [{ id: "no-tags", title: "No project tags found", subtitle: "Press Escape to go back", action: () => {} }];
    }
  } else if (subMode === "select-filter") {
    filteredOptions = [
      {
        id: "all",
        title: "Clear Filter (Show All Repositories)",
        subtitle: "Removes any active tag limiters in the explorer",
        action: () => {
          onSelectProjectFilter("all");
          setSubMode("none");
          setQuery("");
        }
      },
      ...projectTags
        .filter((tag) => tag.name.toLowerCase().includes(query.toLowerCase()))
        .map((tag) => ({
          id: tag.id,
          title: `Filter: ${tag.name}`,
          subtitle: `Limit view to ${tag.repos.length} repos`,
          action: () => {
            onSelectProjectFilter(tag.id);
            setSubMode("none");
            setQuery("");
          }
        }))
    ];
  }

  // Handle standard navigation keys (ArrowUp, ArrowDown, Enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (subMode === "create-tag") {
      if (e.key === "Enter" && newTagName.trim()) {
        e.preventDefault();
        // Choose random tag color
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        onCreateProjectTag(newTagName.trim(), randomColor);
        setSubMode("none");
        setQuery("");
        setNewTagName("");
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(1, filteredOptions.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + filteredOptions.length) % Math.max(1, filteredOptions.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredOptions[activeIndex]) {
        filteredOptions[activeIndex].action();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[1px] flex items-start justify-center pt-[10vh] z-50 animate-fade-in font-sans">
      <div 
        className="w-full max-w-xl bg-[#252526] border border-[#3e3e3e] rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[480px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Indicator */}
        <div className="bg-[#1e1e1e] px-4 py-2 flex items-center justify-between border-b border-[#2d2d2d] select-none">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#007acc]">
            <Command size={14} className="animate-pulse" />
            <span>
              {subMode === "none" && "WORKSPACE COMMAND PALETTE"}
              {subMode === "delete-tag" && "PALETTE: DELETE PROJECT TAG"}
              {subMode === "select-filter" && "PALETTE: COGNITIVE FILTER"}
              {subMode === "create-tag" && "PALETTE: ESTABLISH TAG CATEGORY"}
            </span>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white rounded p-0.5 hover:bg-[#2d2d2d] cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-[#252526] border-b border-[#2d2d2d] flex items-center gap-2">
          <Search size={16} className="text-gray-400 shrink-0" />
          {subMode === "create-tag" ? (
            <input
              ref={inputRef}
              type="text"
              placeholder="Type new category tag name (e.g. AI project) then press Enter..."
              className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-gray-500 font-sans focus:ring-0"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              placeholder={
                subMode === "none" 
                  ? "Type a command..."
                  : "Filter list items..."
              }
              className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-gray-500 font-sans focus:ring-0"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>

        {/* Items list */}
        {subMode !== "create-tag" && (
          <div ref={listRef} className="flex-1 overflow-y-auto max-h-72 p-1.5 space-y-0.5 custom-scrollbar bg-[#1e1e1f]">
            {filteredOptions.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500 font-mono">
                No matching workspace commands found.
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={opt.id}
                    data-active={isActive ? "true" : "false"}
                    onClick={() => opt.action()}
                    className={`p-2.5 rounded flex items-center justify-between text-xs cursor-pointer select-none transition-all ${
                      isActive 
                        ? "bg-[#094771] text-white" 
                        : "text-[#cccccc] hover:bg-[#2d2d2f]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {subMode === "none" && (
                        <div className={`p-1.5 rounded ${isActive ? "bg-blue-800" : "bg-[#2c2c2d]"}`}>
                          {opt.id.includes("tag") ? (
                            <Filter size={13} className="text-amber-400" />
                          ) : opt.id.includes("sidebar") ? (
                            <Terminal size={13} className="text-emerald-400" />
                          ) : (
                            <Folder size={13} className="text-blue-400" />
                          )}
                        </div>
                      )}
                      
                      <div className="min-w-0">
                        <div className="font-medium font-sans break-words">{opt.title}</div>
                        {opt.subtitle && (
                          <div className={`text-[10px] mt-0.5 break-words ${isActive ? "text-blue-100" : "text-gray-400"}`}>
                            {opt.subtitle}
                          </div>
                        )}
                      </div>
                    </div>

                    {subMode === "none" && (baseCommands.find(bc => bc.id === opt.id) as any)?.shortcut && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono select-none shrink-0 ${
                        isActive ? "bg-blue-900/60 text-white" : "bg-gray-800 text-gray-400 border border-gray-700/55"
                      }`}>
                        {(baseCommands.find(bc => bc.id === opt.id) as any).shortcut}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {subMode === "create-tag" && (
          <div className="p-4 bg-[#1e1e1f] text-xs text-gray-400 font-sans space-y-3 border-t border-[#2d2d2d]">
            <p>Establish metadata groupings easily. Type the category tag above (e.g. <code className="bg-[#2d2d2d] px-1 py-0.5 rounded text-white text-[11px]">frontend</code>) then press <span className="text-white font-semibold">Enter</span> to save.</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="shrink-0 text-[11px] uppercase tracking-wider text-gray-500 font-semibold font-mono">Palette Color Swatch:</span>
              <div className="flex gap-1.5">
                {colors.map((c, i) => (
                  <span key={i} className="w-3.5 h-3.5 rounded-full border border-black/30" style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer Guidance */}
        <div className="px-4 py-2 bg-[#252526] border-t border-[#2d2d2d] text-[10px] text-gray-500 font-sans flex justify-between select-none">
          <div>
            Use <span className="text-gray-300">↑↓ Arrows</span> to navigate, <span className="text-gray-300">Enter</span> to choose
          </div>
          <div>
            Press <span className="text-gray-300">ESC</span> to exit
          </div>
        </div>
      </div>
    </div>
  );
}
