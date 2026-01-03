import { AppShell } from "@/components/layout/app-shell";
import { ApprovalPanel } from "@/components/pages/admin/approval-panel";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role, UserStatus } from "@prisma/client";

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/syslink/login");
  if (session.user.status === UserStatus.PENDING) redirect("/syslink/pending");

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== Role.ADMIN) redirect("/syslink/dashboard");

  const pending = await prisma.user.findMany({
    where: { status: UserStatus.PENDING },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      company: true,
      title: true,
      createdAt: true,
      role: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <AppShell>
      <ApprovalPanel initialUsers={pending} />
    </AppShell>
  );
}

