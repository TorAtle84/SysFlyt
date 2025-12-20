"use client";

import { cn } from "@/lib/utils";
import { FolderKanban, MessageSquare } from "lucide-react";

export type DashboardMode = "syslink" | "pratlink";

interface ModeToggleProps {
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white/70 p-1 text-slate-900 backdrop-blur-sm dark:border-white/15 dark:bg-white/10 dark:text-white">
      <button
        type="button"
        onClick={() => onModeChange("syslink")}
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
          mode === "syslink"
            ? "bg-white text-slate-900 shadow-sm dark:bg-white dark:text-slate-900"
            : "text-slate-600 hover:text-slate-900 dark:text-white/70 dark:hover:text-white"
        )}
      >
        <FolderKanban size={16} />
        <span className="hidden sm:inline">Prosjekter</span>
      </button>
      <button
        type="button"
        onClick={() => onModeChange("pratlink")}
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
          mode === "pratlink"
            ? "bg-white text-slate-900 shadow-sm dark:bg-white dark:text-slate-900"
            : "text-slate-600 hover:text-slate-900 dark:text-white/70 dark:hover:text-white"
        )}
      >
        <MessageSquare size={16} />
        <span className="hidden sm:inline">Korrespondanse</span>
      </button>
    </div>
  );
}
