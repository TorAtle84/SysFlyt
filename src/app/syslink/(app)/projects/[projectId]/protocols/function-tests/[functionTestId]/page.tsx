import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { Role } from "@prisma/client";
import { FunctionTestDetail } from "@/components/pages/project/function-tests/function-test-detail";

interface FunctionTestDetailPageProps {
  params: Promise<{ projectId: string; functionTestId: string }>;
}

export default async function FunctionTestDetailPage({
  params,
}: FunctionTestDetailPageProps) {
  const { projectId, functionTestId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) redirect("/login");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        where: { userId: session.user.id },
      },
    },
  });

  if (!project) redirect("/dashboard");

  const isAdmin = session.user.role === Role.ADMIN;
  const isMember = project.members.length > 0;
  if (!isAdmin && !isMember) redirect("/dashboard");

  const functionTest = await prisma.functionTest.findFirst({
    where: { id: functionTestId, projectId },
    include: {
      systemOwner: { select: { id: true, firstName: true, lastName: true } },
      responsibles: {
        orderBy: [{ discipline: "asc" }, { systemCode: "asc" }, { createdAt: "asc" }],
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
      rows: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          responsible: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          performedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!functionTest) {
    redirect(`/projects/${projectId}/protocols/function-tests`);
  }

  const projectMembers = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });

  return (
    <FunctionTestDetail
      project={{ id: project.id, name: project.name }}
      functionTest={functionTest}
      members={projectMembers.map((pm) => pm.user)}
      userId={session.user.id}
      isAdmin={isAdmin}
    />
  );
}

