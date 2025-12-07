import { AppShell } from "@/components/layout/app-shell";
import { ChatRoomView } from "@/components/pages/pratlink/chat-room-view";
import prisma from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { Role } from "@prisma/client";

export default async function PratLinkProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  if (session.user.status === "PENDING") redirect("/pending");

  const { projectId } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) redirect("/login");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              company: true,
            },
          },
        },
      },
      chatRooms: {
        where: { isActive: true },
        include: {
          _count: { select: { messages: true } },
        },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!project) return notFound();

  const isMember =
    project.members.some((m) => m.userId === user.id) ||
    user.role === Role.ADMIN;

  if (!isMember) return notFound();

  const isOwnerOrAdmin =
    project.createdById === user.id || user.role === Role.ADMIN;

  // Create default "Generelt" room if no rooms exist
  let chatRooms = project.chatRooms;
  if (chatRooms.length === 0) {
    const defaultRoom = await prisma.chatRoom.create({
      data: {
        projectId,
        name: "Generelt",
        type: "PROJECT",
        description: "Hovedkanal for prosjektkorrespondanse",
        createdById: user.id,
      },
      include: {
        _count: { select: { messages: true } },
      },
    });
    chatRooms = [defaultRoom];
  }

  const members = project.members.map((m) => ({
    id: m.user.id,
    name: `${m.user.firstName} ${m.user.lastName}`,
    email: m.user.email,
    company: m.user.company,
    role: m.role,
  }));

  const rooms = chatRooms.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    description: r.description,
    messageCount: r._count.messages,
  }));

  return (
    <AppShell>
      <ChatRoomView
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
        }}
        rooms={rooms}
        members={members}
        currentUserId={user.id}
        canManageRooms={isOwnerOrAdmin}
      />
    </AppShell>
  );
}
