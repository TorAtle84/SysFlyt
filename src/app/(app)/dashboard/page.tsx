import { AppShell } from "@/components/layout/app-shell";
import { DashboardClient } from "@/components/pages/dashboard/dashboard-client";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  if (session.user.status === "PENDING") redirect("/pending");

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { OR: [{ createdById: user.id }, { members: { some: { userId: user.id } } }] },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      // Only fetch member IDs for access check, not full user objects
      members: { select: { userId: true, role: true } },
      // Use counts instead of full arrays for performance
      _count: {
        select: {
          documents: true,
          members: true,
          massList: true,
          mcProtocols: true,
          functionTests: true,
        }
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const invited = projects.filter((p) => p.createdById !== user.id);
  const mine = projects.filter((p) => p.createdById === user.id || p.members.some((m) => m.userId === user.id));

  return (
    <AppShell>
      <DashboardClient
        user={{
          id: user.id,
          role: user.role,
          discipline: user.discipline || undefined,
        }}
        projects={projects}
        mine={mine}
        invited={invited}
      />
    </AppShell>
  );
}
