"use client";

import { useState, useEffect, cloneElement, isValidElement, type ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  User,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TotpWarningBanner } from "@/components/totp/totp-warning-banner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationDropdown } from "@/components/layout/notification-dropdown";

interface TotpWarning {
  daysRemaining: number;
  deadline: string;
  expired: boolean;
  message: string;
}

interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profil", icon: User },
];

const adminItems = [
  { href: "/admin/approvals", label: "Godkjenninger", icon: Shield },
];

export function AppShell({ children, sidebar }: AppShellProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileProjectMenuOpen, setMobileProjectMenuOpen] = useState(false);
  const [totpWarning, setTotpWarning] = useState<TotpWarning | null>(null);

  // Collapsible sidebar states with localStorage persistence
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [secondarySidebarCollapsed, setSecondarySidebarCollapsed] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";

  // Load sidebar states from localStorage on mount
  useEffect(() => {
    const savedLeft = localStorage.getItem("leftSidebarCollapsed");
    const savedSecondary = localStorage.getItem("secondarySidebarCollapsed");
    if (savedLeft !== null) setLeftSidebarCollapsed(savedLeft === "true");
    if (savedSecondary !== null) setSecondarySidebarCollapsed(savedSecondary === "true");
  }, []);

  // Save sidebar states to localStorage when changed
  const toggleLeftSidebar = () => {
    const newState = !leftSidebarCollapsed;
    setLeftSidebarCollapsed(newState);
    localStorage.setItem("leftSidebarCollapsed", String(newState));
  };

  const toggleSecondarySidebar = () => {
    const newState = !secondarySidebarCollapsed;
    setSecondarySidebarCollapsed(newState);
    localStorage.setItem("secondarySidebarCollapsed", String(newState));
  };

  useEffect(() => {
    async function checkTotpStatus() {
      try {
        const res = await fetch("/api/totp/status");
        if (res.ok) {
          const data = await res.json();
          if (data.warning && !data.totpEnabled) {
            setTotpWarning(data.warning);
          }
        }
      } catch (error) {
        console.error("Failed to check TOTP status:", error);
      }
    }

    if (session?.user) {
      checkTotpStatus();
    }
  }, [session?.user]);

  useEffect(() => {
    const shouldLockScroll = mobileMenuOpen || mobileProjectMenuOpen;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen, mobileProjectMenuOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
        setMobileProjectMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const sidebarWithMobileClose = sidebar && isValidElement(sidebar) && typeof sidebar.type !== "string"
    ? cloneElement(sidebar as ReactElement<any>, {
      onNavigate: () => setMobileProjectMenuOpen(false),
    })
    : sidebar;

  return (
    <div className="flex min-h-screen bg-background">
      <button
        type="button"
        className="fixed left-[calc(env(safe-area-inset-left)+1rem)] top-[calc(env(safe-area-inset-top)+1rem)] z-50 flex h-11 w-11 items-center justify-center rounded-lg bg-card shadow-lg lg:hidden touch-manipulation"
        onClick={() => {
          setMobileProjectMenuOpen(false);
          setMobileMenuOpen((v) => !v);
        }}
        aria-label={mobileMenuOpen ? "Lukk meny" : "Åpne meny"}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {sidebar && (
        <button
          type="button"
          className="fixed right-[calc(env(safe-area-inset-right)+1rem)] top-[calc(env(safe-area-inset-top)+1rem)] z-50 flex h-11 w-11 items-center justify-center rounded-lg bg-card shadow-lg lg:hidden touch-manipulation"
          onClick={() => {
            setMobileMenuOpen(false);
            setMobileProjectMenuOpen((v) => !v);
          }}
          aria-label={mobileProjectMenuOpen ? "Lukk prosjektmeny" : "Åpne prosjektmeny"}
          aria-expanded={mobileProjectMenuOpen}
        >
          {mobileProjectMenuOpen ? <PanelRightClose size={22} /> : <PanelRightOpen size={22} />}
        </button>
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out",
          "pb-[env(safe-area-inset-bottom)]",
          // Desktop: show based on collapse state
          leftSidebarCollapsed ? "lg:w-16 overflow-hidden" : "lg:w-64",
          // Mobile: full width or hidden
          "w-[280px] sm:w-64",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className={cn(
          "flex h-16 items-center border-b border-border transition-all justify-between px-6",
          leftSidebarCollapsed ? "lg:justify-center lg:px-2" : ""
        )}>
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className={cn("text-xl font-bold text-foreground", leftSidebarCollapsed ? "lg:hidden" : "")}>
              SysLink
            </span>
            <LayoutDashboard
              size={24}
              className={cn("text-foreground hidden", leftSidebarCollapsed ? "lg:block" : "")}
            />
          </Link>
          <div className={cn("flex items-center gap-2", leftSidebarCollapsed ? "lg:hidden" : "")}>
            <div className="flex items-center gap-2">
              <NotificationDropdown />
              <ThemeToggle />
            </div>
          </div>
        </div>

        <nav className={cn(
          "flex-1 space-y-1 overflow-y-auto transition-all p-4",
          leftSidebarCollapsed ? "lg:p-2" : ""
        )}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-[44px] items-center rounded-lg text-sm font-medium transition-colors touch-manipulation",
                  "gap-3 px-3 py-2",
                  leftSidebarCollapsed ? "lg:justify-center lg:px-2" : "",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                )}
                onClick={() => setMobileMenuOpen(false)}
                title={leftSidebarCollapsed ? item.label : undefined}
              >
                <item.icon size={20} />
                <span className={cn(leftSidebarCollapsed ? "lg:hidden" : "")}>{item.label}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <a
              href="/SysLink-Systematisk-Flyt-for-Byggprosjekter.pdf"
              download
              className={cn(
                "flex min-h-[44px] items-center rounded-lg text-sm font-medium transition-colors touch-manipulation",
                "gap-3 px-3 py-2",
                leftSidebarCollapsed ? "lg:justify-center lg:px-2" : "",
                "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
              )}
              onClick={() => setMobileMenuOpen(false)}
              title={leftSidebarCollapsed ? "Presentasjon" : undefined}
            >
              <FileText size={20} />
              <span className={cn(leftSidebarCollapsed ? "lg:hidden" : "")}>Presentasjon</span>
            </a>
          )}

          {isAdmin && (
            <>
              <div className="my-4 border-t border-border" />
              <p
                className={cn(
                  "mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  leftSidebarCollapsed ? "lg:hidden" : ""
                )}
              >
                Admin
              </p>
              {adminItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex min-h-[44px] items-center rounded-lg text-sm font-medium transition-colors touch-manipulation",
                      "gap-3 px-3 py-2",
                      leftSidebarCollapsed ? "lg:justify-center lg:px-2" : "",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                    title={leftSidebarCollapsed ? item.label : undefined}
                  >
                    <item.icon size={20} />
                    <span className={cn(leftSidebarCollapsed ? "lg:hidden" : "")}>{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className={cn(
          "border-t border-border transition-all p-4",
          leftSidebarCollapsed ? "lg:p-2" : ""
        )}>
          <div
            className={cn(
              "mb-3 rounded-lg bg-muted/50 px-3 py-2",
              leftSidebarCollapsed ? "lg:hidden" : ""
            )}
          >
            <p className="text-sm font-medium text-foreground truncate">
              {session?.user?.email}
            </p>
            <p className="text-xs text-muted-foreground">
              {session?.user?.role}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "min-h-[44px] text-muted-foreground hover:text-foreground touch-manipulation",
              "w-full justify-start gap-2",
              leftSidebarCollapsed ? "lg:justify-center lg:p-2" : ""
            )}
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={leftSidebarCollapsed ? "Logg ut" : undefined}
          >
            <LogOut size={20} />
            <span className={cn(leftSidebarCollapsed ? "lg:hidden" : "")}>Logg ut</span>
          </Button>
        </div>
      </aside>

      {sidebar && (
        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-40 flex flex-col border-l border-border bg-card transition-all duration-300 ease-in-out lg:hidden",
            "pb-[env(safe-area-inset-bottom)]",
            "w-[300px] sm:w-72",
            mobileProjectMenuOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex-1 overflow-y-auto">{sidebarWithMobileClose}</div>
        </aside>
      )}

      {/* Left sidebar toggle - ALWAYS visible, positioned at right edge of sidebar */}
      <button
        type="button"
        onClick={toggleLeftSidebar}
        className={cn(
          "fixed top-0 bottom-0 z-50 hidden lg:flex w-4 items-center justify-center",
          "hover:bg-muted/30 transition-all duration-300 group",
          leftSidebarCollapsed ? "left-16" : "left-64"
        )}
        aria-label={leftSidebarCollapsed ? "Utvid meny" : "Skjul meny"}
      >
        <div className="flex flex-col items-center opacity-60 group-hover:opacity-100 transition-opacity">
          <ChevronRight size={14} strokeWidth={3} className={cn(
            "text-orange-500 transition-transform duration-200",
            leftSidebarCollapsed ? "" : "rotate-180"
          )} />
          <ChevronRight size={14} strokeWidth={3} className={cn(
            "text-orange-500 transition-transform duration-200 -mt-2",
            leftSidebarCollapsed ? "" : "rotate-180"
          )} />
        </div>
      </button>

      <div className={cn(
        "flex flex-1 transition-all duration-300",
        leftSidebarCollapsed ? "lg:pl-16" : "lg:pl-64"
      )}>
        {sidebar && (
          <aside className={cn(
            "fixed inset-y-0 hidden shrink-0 border-r border-border bg-card/50 lg:block transition-all duration-300",
            leftSidebarCollapsed ? "left-16" : "left-64",
            secondarySidebarCollapsed ? "w-16 overflow-hidden" : "w-72 overflow-y-auto"
          )}>
            <div>
              {sidebarWithMobileClose}
            </div>
          </aside>
        )}

        {/* Secondary sidebar toggle - ALWAYS visible, positioned correctly */}
        {sidebar && (
          <button
            type="button"
            onClick={toggleSecondarySidebar}
            className={cn(
              "fixed top-0 bottom-0 z-40 hidden lg:flex w-4 items-center justify-center",
              "hover:bg-muted/30 transition-all duration-300 group",
              // Position based on both sidebars' collapsed states
              // Left sidebar: 16 or 64. Secondary sidebar: 16 (collapsed) or 288 (expanded)
              leftSidebarCollapsed
                ? (secondarySidebarCollapsed ? "left-[128px]" : "left-[352px]")  // 16 + 16 + toggle or 16 + 288 + toggle
                : (secondarySidebarCollapsed ? "left-[320px]" : "left-[544px]")  // 64 + 16 + toggle or 64 + 288 + toggle
            )}
            aria-label={secondarySidebarCollapsed ? "Utvid meny" : "Skjul meny"}
          >
            <div className="flex flex-col items-center opacity-60 group-hover:opacity-100 transition-opacity">
              <ChevronRight size={14} strokeWidth={3} className={cn(
                "text-orange-500 transition-transform duration-200",
                secondarySidebarCollapsed ? "" : "rotate-180"
              )} />
              <ChevronRight size={14} strokeWidth={3} className={cn(
                "text-orange-500 transition-transform duration-200 -mt-2",
                secondarySidebarCollapsed ? "" : "rotate-180"
              )} />
            </div>
          </button>
        )}

        <main className={cn(
          "flex-1 p-4 pt-16 sm:p-6 sm:pt-16 lg:pt-6 transition-all duration-300",
          sidebar ? (secondarySidebarCollapsed ? "lg:pl-16" : "lg:pl-72") : "",
          totpWarning && totpWarning.daysRemaining >= 0 ? "pb-32" : ""
        )}>
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>

      {totpWarning && totpWarning.daysRemaining >= 0 && (
        <TotpWarningBanner
          daysRemaining={totpWarning.daysRemaining}
          onDismiss={() => setTotpWarning(null)}
        />
      )}

      {(mobileMenuOpen || mobileProjectMenuOpen) && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden touch-manipulation"
          onClick={() => {
            setMobileMenuOpen(false);
            setMobileProjectMenuOpen(false);
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
