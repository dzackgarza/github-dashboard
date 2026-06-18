import React from "react";
import { FolderGit2, ShieldCheck, Settings, Database, CodeXml, Command } from "lucide-react";

interface VSCodeActivityBarProps {
  activeView: "explorer" | "sync" | "settings";
  setActiveView: (view: "explorer" | "sync" | "settings") => void;
  isTokenConfigured: boolean;
  rateRemaining: number;
  sidebarOpen?: boolean;
  onOpenCommandPalette?: () => void;
}

export default function VSCodeActivityBar({
  activeView,
  setActiveView,
  isTokenConfigured,
  rateRemaining,
  sidebarOpen = true,
  onOpenCommandPalette
}: VSCodeActivityBarProps) {
  return (
    <div className="w-[48px] h-full bg-[#333333] flex flex-col items-center justify-between py-4 select-none border-r border-[#3e3e3e]">
      {/* Top Icons */}
      <div className="flex flex-col gap-5 w-full items-center">
        {/* Logo Icon */}
        <div className="text-[#007acc] mb-2 p-1" title="GitHub CodeWorkspace">
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
            Explorer (Ctrl+Shift+E)
          </span>
        </button>

        {/* View Toggle - Sync Tracker */}
        <button
          onClick={() => setActiveView("sync")}
          className={`relative p-2.5 w-full flex justify-center transition-colors group cursor-pointer ${
            activeView === "sync" && sidebarOpen
              ? "text-white border-l-2 border-[#007acc]"
              : "text-gray-400 hover:text-gray-200"
          }`}
          title="Sync Status & Telemetry"
        >
          <div className="relative">
            <Database size={22} />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span className="absolute left-14 bg-gray-800 text-xs px-2 py-1 rounded text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap shadow-md">
            Sync Telemetry & Rate Limits
          </span>
        </button>

        {/* Command Palette Button */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="relative p-2.5 w-full flex justify-center transition-colors group text-gray-400 hover:text-[#007acc] cursor-pointer"
            title="Open Command Palette (Ctrl+P)"
          >
            <Command size={22} />
            <span className="absolute left-14 bg-gray-800 text-xs px-2 py-1 rounded text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap shadow-md">
              Command Palette (Ctrl+P)
            </span>
          </button>
        )}
      </div>

      {/* Bottom Icons */}
      <div className="flex flex-col gap-4 w-full items-center">
        {/* Token Verified Status Indicator */}
        <div
          className={`p-1 rounded-full cursor-help ${
            isTokenConfigured ? "text-emerald-500" : "text-amber-500"
          }`}
          title={isTokenConfigured ? "Token Verified & Authorized" : "GitHub Token Missing"}
        >
          <ShieldCheck size={18} />
        </div>

        {/* View Toggle - Settings */}
        <button
          onClick={() => setActiveView("settings")}
          className={`relative p-2.5 w-full flex justify-center transition-colors group cursor-pointer ${
            activeView === "settings" && sidebarOpen
              ? "text-white border-l-2 border-[#007acc]"
              : "text-gray-400 hover:text-gray-200"
          }`}
          title="Settings Configuration"
        >
          <Settings size={22} className={activeView === "settings" ? "animate-spin-slow" : ""} />
          <span className="absolute left-14 bg-gray-800 text-xs px-2 py-1 rounded text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap shadow-md">
            Configuration
          </span>
        </button>
      </div>
    </div>
  );
}
