import { AppShell } from "@/components/layout/app-shell";
import { ProjectSidebar } from "@/components/pages/project/project-sidebar";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role, UserStatus } from "@prisma/client";

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  if (session.user.status === UserStatus.PENDING) redirect("/pending");

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect("/login");

  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { select: { userId: true, role: true, user: { select: { firstName: true, lastName: true } } } },
      documents: { select: { id: true } },
      massList: { select: { id: true } },
    },
  });

  if (!project) redirect("/dashboard");

  const isMember = project.members.some((m) => m.userId === user.id) || user.role === Role.ADMIN;
  if (!isMember) redirect("/dashboard");

  return (
    <AppShell sidebar={<ProjectSidebar project={project} />}>
      {children}
    </AppShell>
  );
}
