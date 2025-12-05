"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  List,
  Users,
  ChevronLeft,
  FolderKanban,
  PenTool,
  Network,
  ClipboardCheck,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSidebarProps {
  project?: {
    id: string;
    name: string;
    description?: string | null;
    members?: { user: { firstName: string; lastName: string } }[];
    documents?: { id: string }[];
    massList?: { id: string }[];
  };
  projectId?: string;
}

export function ProjectSidebar({ project, projectId }: ProjectSidebarProps) {
  const pathname = usePathname();
  const id = project?.id || projectId;

  if (!id) return null;

  const navItems = [
    {
      href: `/projects/${id}`,
      label: "Dashboard",
      icon: FolderKanban,
      exact: true,
    },
    {
      href: `/projects/${id}/drawings`,
      label: "Arbeidstegninger",
      icon: PenTool,
      disabled: true,
    },
    {
      href: `/projects/${id}/schemas`,
      label: "Systemskjema",
      icon: Network,
      disabled: true,
    },
    {
      href: `/projects/${id}/mass-list`,
      label: "Masseliste",
      icon: List,
    },
    {
      href: `/projects/${id}/protocols`,
      label: "Protokoller MC",
      icon: ClipboardCheck,
      disabled: true,
    },
    {
      href: `/projects/${id}/progress`,
      label: "Fremdrift",
      icon: TrendingUp,
      disabled: true,
    },
  ];

  return (
    <div className="flex h-full flex-col p-4">
      <Link
        href="/dashboard"
        className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={16} />
        Tilbake til dashboard
      </Link>

      {project && (
        <div className="mb-6">
          <h2 className="font-semibold text-foreground">{project.name}</h2>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {project.description}
            </p>
          )}
        </div>
      )}

      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                item.disabled && "cursor-not-allowed opacity-50",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <item.icon size={18} />
              {item.label}
              {item.disabled && (
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Kommer
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {project && (
        <div className="mt-auto space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText size={14} />
            <span>{project.documents?.length || 0} dokumenter</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users size={14} />
            <span>{project.members?.length || 0} medlemmer</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <List size={14} />
            <span>{project.massList?.length || 0} i masseliste</span>
          </div>
        </div>
      )}
    </div>
  );
}
