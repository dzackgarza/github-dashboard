import React from "react";
import { FolderGit2, ShieldCheck, CodeXml } from "lucide-react";

interface VSCodeActivityBarProps {
  activeView: "explorer" | "sync" | "settings";
  setActiveView: (view: "explorer" | "sync" | "settings") => void;
  isTokenConfigured: boolean;
  sidebarOpen?: boolean;
}

export default function VSCodeActivityBar({
  activeView,
  setActiveView,
  isTokenConfigured,
  sidebarOpen = true
}: VSCodeActivityBarProps) {
  return (
    <div className="w-[48px] h-full bg-[#333333] flex flex-col items-center justify-between py-4 select-none border-r border-[#3e3e3e]">
      {/* Top Icons */}
      <div className="flex flex-col gap-5 w-full items-center">
        <div className="text-[#007acc] mb-2 p-1" title="GitHub Dashboard">
          <CodeXml size={26} strokeWidth={2.2} />
        </div>

        {/* View Toggle - Explorer */}
        <button
          onClick={() => setActiveView("explorer")}
          className={`relative p-2.5 w-full flex justify-center transition-colors group cursor-pointer ${
            activeView === "explorer" && sidebarOpen
              ? "text-white border-l-2 border-[#007acc]"
              : "text-gray-400 hover:text-gray-200"
          }`}
          title="Explorer (Repos & Projects)"
        >
          <FolderGit2 size={22} />
          <span className="absolute left-14 bg-gray-800 text-xs px-2 py-1 rounded text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap shadow-md">
            Repositories
          </span>
        </button>

      </div>

      <div className="flex flex-col gap-4 w-full items-center">
        <div
          className={`p-1 rounded-full cursor-help ${
            isTokenConfigured ? "text-emerald-500" : "text-amber-500"
          }`}
          title={isTokenConfigured ? "GitHub token configured" : "GitHub token missing"}
        >
          <ShieldCheck size={18} />
        </div>
      </div>
    </div>
  );
}
