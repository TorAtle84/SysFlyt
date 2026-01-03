import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { ProjectHeader } from "@/components/pages/project/project-header";
import { ProjectSidebar } from "@/components/pages/project/project-sidebar";
import { ProjectDashboard } from "@/components/pages/project/project-dashboard";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return notFound();
  }
  const { user } = authResult;

  const project = await db.project.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: {
          user: true,
        },
      },
      documents: true,
      _count: {
        select: {
          massList: true,
          mcProtocols: true,
          functionTests: true,
          bimModels: true,
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  // Also check if user is a member of the project
  const isMember = project.members.some((m) => m.userId === user.id);
  if (!isMember && user.role !== "ADMIN") {
      notFound();
  }

  const canEdit =
    project.members.some(
      (m) =>
        m.userId === user.id &&
        (m.role === "ADMIN" || m.role === "PROJECT_LEADER")
    ) || user.role === "ADMIN";

  return (
    <div className="flex h-full">
      <div className="hidden w-72 flex-shrink-0 border-r lg:block">
        <ProjectSidebar project={project} />
      </div>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          <ProjectHeader
            project={project}
            canEdit={canEdit}
            currentUserId={user.id}
          />
          <ProjectDashboard projectId={project.id} />
        </div>
      </main>
    </div>
  );
}
