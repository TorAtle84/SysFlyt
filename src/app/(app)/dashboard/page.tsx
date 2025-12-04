import { AppShell } from "@/components/layout/app-shell";
import { ProjectExplorer } from "@/components/pages/dashboard/project-explorer";
import { BackupTrigger } from "@/components/pages/dashboard/backup-trigger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { Sparkles, ShieldCheck, Database } from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  if (session.user.status === "PENDING") redirect("/pending");

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { OR: [{ createdById: user.id }, { members: { some: { userId: user.id } } }] },
    include: {
      members: { include: { user: true } },
      documents: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const invited = projects.filter((p) => p.createdById !== user.id);
  const mine = projects.filter((p) => p.createdById === user.id || p.members.some((m) => m.userId === user.id));

  const canCreate = user.role === Role.ADMIN || user.role === Role.PROJECT_LEADER;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Compact Control Center */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 opacity-90" />
          <div className="absolute right-6 top-5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
            SysLink
          </div>
          <CardContent className="relative px-6 py-6 text-white">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-white/70">Kontrollsenter</p>
                <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-semibold leading-tight lg:text-4xl">
                  Byggebransjen møter SysLink
                  <img src="/syslink-logo.png" alt="SysLink Logo" className="h-[2.25em] rounded-lg shadow-sm" />
                </h1>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Badge tone="info">{projects.length} prosjekter</Badge>
                <Badge tone="success" title="Rollebasert tilgangskontroll - sikrer at brukere kun har tilgang til det de trenger">
                  RBAC aktivert
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects */}
        <ProjectExplorer mine={mine} invited={invited} canCreate={canCreate} userDiscipline={(user as any).discipline} />

        {/* Security */}
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
                  Roller: Admin, Prosjektleder, Bruker, Leser. Pending-brukere får begrenset visning.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
              <Database className="text-info" size={20} />
              <div>
                <p className="text-sm font-semibold text-foreground">Mock backup</p>
                <p className="text-sm text-muted-foreground">
                  Trigger en simulert database-dump. Viser progress og svar i UI.
                </p>
              </div>
            </div>
            {user.role === Role.ADMIN && <BackupTrigger />}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function PulseRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
      <span className="text-sm text-white/80">{label}</span>
      <span className="text-xl font-semibold text-white">{value}</span>
    </div>
  );
}
