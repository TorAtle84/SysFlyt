import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { SchemasContent } from "@/components/pages/project/schemas-content";

interface SchemasPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function SchemasPage({ params }: SchemasPageProps) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      documents: {
        where: { type: "SCHEMA" },
        orderBy: { createdAt: "desc" },
        include: {
          systemAnnotations: {
            include: {
              createdBy: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          tags: {
            include: {
              systemTag: true,
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

  const isAdmin = session.user.role === "ADMIN";
  const isMember = project.members.length > 0;

  if (!isAdmin && !isMember) {
    redirect("/dashboard");
  }

  const canUpload =
    isAdmin || project.members.some((m) => m.role !== "READER");

  return (
    <SchemasContent
      project={project}
      documents={project.documents}
      canUpload={canUpload}
    />
  );
}
