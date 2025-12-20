import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { FunctionTestsContent } from "@/components/pages/project/function-tests/function-tests-content";
import { Role } from "@prisma/client";

interface FunctionTestsPageProps {
  params: Promise<{ projectId: string }>;
}

function computeProgressStats(rows: { status: string }[]) {
  const totalRows = rows.length;
  const completedRows = rows.filter((r) =>
    ["COMPLETED", "NOT_APPLICABLE", "DEVIATION"].includes(r.status)
  ).length;
  const deviationRows = rows.filter((r) => r.status === "DEVIATION").length;
  const progress = totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0;
  return { totalRows, completedRows, deviationRows, progress };
}

export default async function FunctionTestsPage({ params }: FunctionTestsPageProps) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) redirect("/login");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: true },
  });

  if (!project) redirect("/dashboard");

  const membership = project.members.find((m) => m.userId === session.user.id);
  const isMember = !!membership || session.user.role === Role.ADMIN;
  if (!isMember) redirect("/dashboard");

  const canCreate =
    session.user.role === Role.ADMIN ||
    session.user.role === Role.PROJECT_LEADER ||
    membership?.role === Role.PROJECT_LEADER;

  const tests = await prisma.functionTest.findMany({
    where: { projectId },
    orderBy: { systemCode: "asc" },
    include: { rows: { select: { status: true } } },
  });

  const functionTestsWithStats = tests.map((t) => {
    const { rows, ...rest } = t;
    return { ...rest, stats: computeProgressStats(rows) };
  });

  return (
    <FunctionTestsContent
      project={{ id: project.id, name: project.name }}
      functionTests={functionTestsWithStats}
      canCreate={canCreate}
    />
  );
}

