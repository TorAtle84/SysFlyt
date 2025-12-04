"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  User,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <button
        type="button"
        className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-lg bg-card shadow-lg lg:hidden touch-manipulation"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label={mobileMenuOpen ? "Lukk meny" : "Åpne meny"}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[280px] sm:w-64 flex-col border-r border-border bg-card transition-transform duration-200 lg:translate-x-0",
          "pb-[env(safe-area-inset-bottom)]",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-xl font-bold text-foreground">Sluttfase</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors touch-manipulation",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="my-4 border-t border-border" />
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </p>
              {adminItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors touch-manipulation",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80"
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon size={20} />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-3 rounded-lg bg-muted/50 px-3 py-2">
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
            className="w-full min-h-[44px] justify-start gap-2 text-muted-foreground hover:text-foreground touch-manipulation"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut size={20} />
            Logg ut
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 lg:pl-64">
        {sidebar && (
          <aside className="fixed inset-y-0 left-64 hidden w-72 shrink-0 border-r border-border bg-card/50 lg:block overflow-y-auto">
            {sidebar}
          </aside>
        )}

        <main className={cn(
          "flex-1 p-4 pt-16 sm:p-6 sm:pt-6 lg:pt-6",
          sidebar ? "lg:pl-72" : ""
        )}>
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden touch-manipulation"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
