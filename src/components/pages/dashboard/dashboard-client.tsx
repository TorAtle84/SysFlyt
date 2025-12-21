"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeToggle, DashboardMode } from "@/components/ui/mode-toggle";
import { ProjectExplorer } from "@/components/pages/dashboard/project-explorer";
import { ChatProjectList } from "@/components/pages/pratlink/chat-project-list";
import { BackupTrigger } from "@/components/pages/dashboard/backup-trigger";
import { ShieldCheck, Database, MessageSquare, FolderKanban } from "lucide-react";
import { Role } from "@prisma/client";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  members: { user: { firstName: string; lastName: string } }[];
  documents: { id: string }[];
  chatRooms?: {
    id: string;
    name: string;
    type: string;
    _count?: { messages: number };
  }[];
  _count?: { chatRooms: number };
}

interface DashboardClientProps {
  user: {
    id: string;
    role: Role;
    discipline?: string;
  };
  projects: Project[];
  mine: Project[];
  invited: Project[];
}

export function DashboardClient({
  user,
  projects,
  mine,
  invited,
}: DashboardClientProps) {
  const [mode, setMode] = useState<DashboardMode>("syslink");

  const canCreate = user.role === Role.ADMIN || user.role === Role.PROJECT_LEADER;
  const canDelete = user.role === Role.ADMIN;

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900" />
        <CardContent className="relative px-6 pt-12 pb-6 text-foreground dark:text-white">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground dark:text-white/70">
                  Kontrollsenter
                </p>
                <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
                  {mode === "syslink" ? (
                    <>
                      Byggebransjen møter
                      <img
                        src="/SysLinkText.png"
                        alt="SysLink Logo"
                        className="h-[2.4em] rounded-lg shadow-sm"
                      />
                    </>
                  ) : (
                    <>
                      <MessageSquare className="h-8 w-8" />
                      PratLink Korrespondanse
                    </>
                  )}
                </h1>
              </div>
              <div className="flex flex-col items-end gap-3">
                <ModeToggle mode={mode} onModeChange={setMode} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge tone="info">{projects.length} prosjekter</Badge>
                  <Badge
                    tone="success"
                    title="Rollebasert tilgangskontroll"
                  >
                    RBAC aktivert
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === "syslink" ? (
        <>
          <ProjectExplorer
            mine={mine}
            invited={invited}
            canCreate={canCreate}
            canDelete={canDelete}
            userDiscipline={user.discipline}
          />

          <Card>
            <CardHeader>
              <CardTitle>Tilgang og sikkerhet</CardTitle>
              <Badge tone="muted">{user.role}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                <ShieldCheck className="text-success" size={20} />
                <div>
                  <p className="text-sm font-semibold text-foreground">RBAC</p>
                  <p className="text-sm text-muted-foreground">
                    Roller: Admin, Prosjektleder, Bruker, Leser. Pending-brukere
                    får begrenset visning.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                <Database className="text-info" size={20} />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Mock backup
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Trigger en simulert database-dump. Viser progress og svar i
                    UI.
                  </p>
                </div>
              </div>
              {user.role === Role.ADMIN && <BackupTrigger />}
            </CardContent>
          </Card>
        </>
      ) : (
        <ChatProjectList projects={projects} />
      )}
    </div>
  );
}
