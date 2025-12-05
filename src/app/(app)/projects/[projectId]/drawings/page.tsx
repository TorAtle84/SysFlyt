import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { DrawingsContent } from "@/components/pages/project/drawings-content";
import { Role } from "@prisma/client";

interface DrawingsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function DrawingsPage({ params }: DrawingsPageProps) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      documents: {
        where: { type: "DRAWING" },
        orderBy: { createdAt: "desc" },
        include: {
          annotations: {
            include: {
              author: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      },
      members: {
        where: { userId: session.user.id },
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

  const canUpload =
    isAdmin || project.members.some((m) => m.role !== "READER");

  return (
    <DrawingsContent
      project={project}
      documents={project.documents}
      canUpload={canUpload}
    />
  );
}
