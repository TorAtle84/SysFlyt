"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import {
  FileText,
  List,
  Users,
  ChevronLeft,
  FolderKanban,
  Box,
  PenTool,
  Network,
  ClipboardCheck,
  ListChecks,
  TrendingUp,
  ShieldCheck,
  GitCompare,
  Plus,
  Minus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSidebarProps {
  project?: {
    id: string;
    name: string;
    description?: string | null;
    members?: { user: { firstName: string; lastName: string } }[];
    documents?: { id: string; type: string }[];
    massList?: { id: string }[];
    mcProtocols?: { id: string }[];
    functionTests?: { id: string }[];
    bimModels?: { id: string }[];
  };
  projectId?: string;
  onNavigate?: () => void;
}

type NavLinkItem = {
  type: "link";
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  count?: number;
  indent?: boolean;
};

type NavGroupItem = {
  type: "group";
  label: string;
  icon: LucideIcon;
  children: NavLinkItem[];
};

type NavItem = NavLinkItem | NavGroupItem;

export function ProjectSidebar({ project, projectId, onNavigate }: ProjectSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const id = project?.id || projectId;

  // Expandable groups state - persisted to localStorage
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    Underlag: true,
    Kvalitetssikring: true,
    Protokoller: true,
    Fremdrift: true,
  });

  // Load expanded state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("sidebarExpandedGroups");
    if (saved) {
      try {
        setExpandedGroups(JSON.parse(saved));
      } catch (e) {
        // Ignore invalid JSON
      }
    }
  }, []);

  // Toggle group expansion
  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const newState = { ...prev, [label]: !prev[label] };
      localStorage.setItem("sidebarExpandedGroups", JSON.stringify(newState));
      return newState;
    });
  };

  if (!id) return null;

  const isAdmin = session?.user?.role === Role.ADMIN;

  const drawingCount = project?.documents?.filter((d) => d.type === "DRAWING").length || 0;
  const schemaCount = project?.documents?.filter((d) => d.type === "SCHEMA").length || 0;
  const functionDescriptionCount = project?.documents?.filter((d) => d.type === "FUNCTION_DESCRIPTION").length || 0;
  const massListCount = project?.massList?.length || 0;
  const modelCount = project?.bimModels?.length || 0;
  const functionTestCount = project?.functionTests?.length || 0;

  const navItems: NavItem[] = [
    {
      type: "link",
      href: `/projects/${id}`,
      label: "Dashboard",
      icon: FolderKanban,
      exact: true,
    },

    {
      type: "group",
      label: "Underlag",
      icon: FileText,
      children: [
        {
          type: "link",
          href: `/projects/${id}/mass-list`,
          label: "Masseliste",
          icon: List,
          count: massListCount,
          indent: true,
        },
        {
          type: "link",
          href: `/projects/${id}/drawings`,
          label: "Arbeidstegninger",
          icon: PenTool,
          count: drawingCount,
          indent: true,
        },
        {
          type: "link",
          href: `/projects/${id}/schemas`,
          label: "Systemskjema",
          icon: Network,
          count: schemaCount,
          indent: true,
        },
        {
          type: "link",
          href: `/projects/${id}/function-descriptions`,
          label: "Funksjonsbeskrivelse",
          icon: FileText,
          count: functionDescriptionCount,
          indent: true,
        },
        ...(isAdmin
          ? [
            {
              type: "link" as const,
              href: `/projects/${id}/models`,
              label: "Modell",
              icon: Box,
              count: modelCount,
              indent: true,
            },
          ]
          : []),
      ],
    },
    {
      type: "group",
      label: "Kvalitetssikring",
      icon: ShieldCheck,
      children: [
        {
          type: "link",
          href: `/projects/${id}/quality-assurance/comparison`,
          label: "Sammenligning",
          icon: GitCompare,
          indent: true,
        },
      ],
    },
    {
      type: "group",
      label: "Protokoller",
      icon: ClipboardCheck,
      children: [
        {
          type: "link",
          href: `/projects/${id}/protocols`,
          label: "Protokoll MC",
          icon: ClipboardCheck,
          count: project?.mcProtocols?.length || 0,
          indent: true,
        },
        {
          type: "link",
          href: `/projects/${id}/protocols/function-tests`,
          label: "Funksjonstest",
          icon: ListChecks,
          count: functionTestCount,
          indent: true,
        },
      ],
    },
    {
      type: "group",
      label: "Fremdrift",
      icon: TrendingUp,
      children: [
        {
          type: "link",
          href: `/projects/${id}/progress`,
          label: "Produksjonsstatus",
          icon: TrendingUp,
          indent: true,
        },
        {
          type: "link",
          href: `/projects/${id}/progress/plan`,
          label: "Fremdriftsplan",
          icon: ListChecks,
          indent: true,
        },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col p-4">
      <Link
        href="/dashboard"
        className="mb-4 flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground active:bg-muted/60 touch-manipulation"
        onClick={() => onNavigate?.()}
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
          if (item.type === "group") {
            const isExpanded = expandedGroups[item.label] ?? true;
            return (
              <div key={item.label} className="pt-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(item.label)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <item.icon size={14} />
                    {item.label}
                  </div>
                  <div className="flex items-center justify-center w-5 h-5 rounded bg-muted/50 group-hover:bg-muted text-muted-foreground group-hover:text-foreground transition-colors">
                    {isExpanded ? <Minus size={12} /> : <Plus size={12} />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="space-y-1">
                    {item.children.map((child) => {
                      const isActive = child.exact
                        ? pathname === child.href
                        : pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex min-h-[44px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors touch-manipulation",
                            child.indent ? "pl-9" : "",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                          )}
                          onClick={() => onNavigate?.()}
                        >
                          <div className="flex items-center gap-3">
                            <child.icon size={18} />
                            {child.label}
                          </div>
                          {child.count !== undefined && child.count > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-foreground">
                              {child.count}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[44px] items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors touch-manipulation",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
              )}
              onClick={() => onNavigate?.()}
            >
              <div className="flex items-center gap-3">
                <item.icon size={18} />
                {item.label}
              </div>
              {item.count !== undefined && item.count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-foreground">
                  {item.count}
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
