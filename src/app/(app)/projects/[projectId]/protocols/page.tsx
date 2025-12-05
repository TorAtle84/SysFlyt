import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ProtocolsContent } from "@/components/pages/project/protocols-content";

interface ProtocolsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProtocolsPage({ params }: ProtocolsPageProps) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      massList: {
        orderBy: { createdAt: "desc" },
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

  const canCreate =
    isAdmin || project.members.some((m) => m.role !== "READER");

  return (
    <ProtocolsContent
      project={project}
      massListItems={project.massList}
      canCreate={canCreate}
    />
  );
}
