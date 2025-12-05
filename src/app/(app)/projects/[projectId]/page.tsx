import { ProjectHeader } from "@/components/pages/project/project-header";
import { ProjectContentSwitcher } from "@/components/pages/project/project-content-switcher";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

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

  const isMember = project.members.some((m) => m.userId === session.user.id) || session.user.role === Role.ADMIN;
  if (!isMember) redirect("/dashboard");

  const canEdit = session.user.role === Role.ADMIN || session.user.role === Role.PROJECT_LEADER;

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} canEdit={canEdit} currentUserId={session.user.id} />
      <ProjectContentSwitcher project={project} canEdit={canEdit} />
    </div>
  );
}
