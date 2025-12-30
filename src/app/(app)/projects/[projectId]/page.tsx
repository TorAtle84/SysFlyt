import { ProjectHeader } from "@/components/pages/project/project-header";
import { ProjectDashboard } from "@/components/pages/project/project-dashboard";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { projectId } = await params;

  // Lightweight query - only fetch what's needed for header and access check
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      createdAt: true,
      createdById: true,
      members: {
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!project) redirect("/dashboard");

  const isMember = project.members.some((m) => m.userId === session.user.id) || session.user.role === Role.ADMIN;
  if (!isMember) redirect("/dashboard");

  const canEdit = session.user.role === Role.ADMIN || session.user.role === Role.PROJECT_LEADER;

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} canEdit={canEdit} currentUserId={session.user.id} />
      <ProjectDashboard projectId={projectId} />
    </div>
  );
}

