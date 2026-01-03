import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ProtocolsContent } from "@/components/pages/project/protocols-content";
import { Role } from "@prisma/client";

interface ProtocolsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProtocolsPage({ params }: ProtocolsPageProps) {
  const { projectId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/syslink/login");
  }

  /* Fetch project for context and permissions */
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: true },
  });

  if (!project) redirect("/syslink/dashboard");

  const membership = project.members.find((m) => m.userId === session.user.id);
  const isMember = !!membership || session.user.role === Role.ADMIN;
  if (!isMember) redirect("/syslink/dashboard");

  // Allow ADMIN, PROJECT_LEADER (global or project) to create protocols
  const canCreate =
    session.user.role === Role.ADMIN ||
    session.user.role === Role.PROJECT_LEADER ||
    membership?.role === Role.PROJECT_LEADER;

  /* Fetch protocols with item stats */
  const protocols = await prisma.mCProtocol.findMany({
    where: { projectId },
    orderBy: { systemCode: "asc" },
    include: {
      items: {
        select: {
          columnA: true,
          columnB: true,
          columnC: true,
        },
      },
    },
  });

  const protocolsWithStats = protocols.map((p) => {
    const totalItems = p.items.length;
    const completedItems = p.items.filter(
      (i) =>
        (i.columnA === "COMPLETED" || i.columnA === "NA") &&
        (i.columnB === "COMPLETED" || i.columnB === "NA") &&
        (i.columnC === "COMPLETED" || i.columnC === "NA")
    ).length;
    const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { items, ...protocolData } = p;

    // Override status: if progress is 0, show as NOT_STARTED
    const derivedStatus = (progress === 0 ? "NOT_STARTED" : protocolData.status) as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "APPROVED";

    return {
      ...protocolData,
      status: derivedStatus,
      stats: {
        totalItems,
        completedItems,
        progress,
      },
    };
  });

  return (
    <ProtocolsContent
      project={project}
      protocols={protocolsWithStats}
      canCreate={canCreate}
    />
  );
}
