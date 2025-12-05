import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ProgressContent } from "@/components/pages/project/progress-content";
import { Role } from "@prisma/client";

interface ProgressPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProgressPage({ params }: ProgressPageProps) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      documents: {
        include: {
          annotations: true,
          systemAnnotations: true,
        },
      },
      massList: true,
      members: {
        where: { userId: session.user.id },
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
  });

  if (!project) {
    redirect("/dashboard");
  }

  const isAdmin = session.user.role === Role.ADMIN;
  const isMember = project.members.length > 0;

  if (!isAdmin && !isMember) {
    redirect("/dashboard");
  }

  const totalAnnotations = project.documents.reduce(
    (acc, doc) => acc + doc.annotations.length,
    0
  );

  const closedAnnotations = project.documents.reduce(
    (acc, doc) => acc + doc.annotations.filter((a) => a.status === "CLOSED").length,
    0
  );

  const totalSystemBoxed = project.documents.reduce(
    (acc, doc) => acc + doc.systemAnnotations.length,
    0
  );

  const stats = {
    totalDocuments: project.documents.length,
    totalMassListItems: project.massList.length,
    totalAnnotations,
    closedAnnotations,
    openAnnotations: totalAnnotations - closedAnnotations,
    totalSystemBoxed,
    completionRate:
      totalAnnotations > 0
        ? Math.round((closedAnnotations / totalAnnotations) * 100)
        : 0,
  };

  return <ProgressContent project={project} stats={stats} />;
}
