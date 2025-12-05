import { AppShell } from "@/components/layout/app-shell";
import { ProjectSidebar } from "@/components/pages/project/project-sidebar";
import { ProjectHeader } from "@/components/pages/project/project-header";
import { ProjectContentSwitcher } from "@/components/pages/project/project-content-switcher";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role, UserStatus } from "@prisma/client";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  if (session.user.status === UserStatus.PENDING) redirect("/pending");

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect("/login");

  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { include: { user: true } },
      documents: { 
        include: { 
          tags: { include: { systemTag: true } },
          annotations: { select: { id: true, status: true } },
        } 
      },
      massList: true,
      comments: { include: { author: true }, orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!project) redirect("/dashboard");

  const isMember = project.members.some((m) => m.userId === user.id) || user.role === Role.ADMIN;
  if (!isMember) redirect("/dashboard");

  const canEdit = user.role === Role.ADMIN || user.role === Role.PROJECT_LEADER;

  return (
    <AppShell sidebar={<ProjectSidebar project={project} />}>
      <div className="space-y-6">
        <ProjectHeader project={project} canEdit={canEdit} currentUserId={user.id} />
        <ProjectContentSwitcher project={project} canEdit={canEdit} />
      </div>
    </AppShell>
  );
}
