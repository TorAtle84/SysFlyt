import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import prisma from "@/lib/db";

async function verifyMessageAccess(messageId: string, userId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: {
      room: {
        include: {
          project: {
            include: {
              members: true,
            },
          },
        },
      },
    },
  });

  if (!message || message.deletedAt) {
    return { success: false as const, error: "Melding ikke funnet" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { success: false as const, error: "Bruker ikke funnet" };
  }

  const isMember =
    message.room.project.members.some((m) => m.userId === userId) ||
    user.role === "ADMIN";

  if (!isMember) {
    return { success: false as const, error: "Ingen tilgang" };
  }

  return { success: true as const, message, user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { messageId } = await params;

    const accessCheck = await verifyMessageAccess(messageId, authResult.user.id);
    if (!accessCheck.success) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: 403 }
      );
    }

    const links = await prisma.chatMessageLink.findMany({
      where: { messageId },
      orderBy: { createdAt: "asc" },
    });

    const enrichedLinks = await Promise.all(
      links.map(async (link) => {
        let target = null;

        if (link.targetType === "document") {
          target = await prisma.document.findUnique({
            where: { id: link.targetId },
            select: { id: true, title: true, projectId: true },
          });
        } else if (link.targetType === "annotation") {
          target = await prisma.annotation.findUnique({
            where: { id: link.targetId },
            select: {
              id: true,
              status: true,
              document: {
                select: { id: true, title: true, projectId: true },
              },
            },
          });
        } else if (link.targetType === "task") {
          target = await prisma.chatTask.findUnique({
            where: { id: link.targetId },
            select: { id: true, title: true, projectId: true },
          });
        }

        return { ...link, target };
      })
    );

    return NextResponse.json({ links: enrichedLinks });
  } catch (error) {
    console.error("Failed to fetch message links:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente lenker" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { messageId } = await params;

    const accessCheck = await verifyMessageAccess(messageId, authResult.user.id);
    if (!accessCheck.success) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: 403 }
      );
    }

    if (accessCheck.message.authorId !== authResult.user.id) {
      return NextResponse.json(
        { error: "Du kan bare legge til lenker til egne meldinger" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { targetType, targetId } = body;

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: "targetType og targetId er påkrevd" },
        { status: 400 }
      );
    }

    if (!["document", "annotation", "task"].includes(targetType)) {
      return NextResponse.json(
        { error: "Ugyldig targetType" },
        { status: 400 }
      );
    }

    const projectId = accessCheck.message.room.projectId;
    let valid = false;

    if (targetType === "document") {
      const doc = await prisma.document.findFirst({
        where: { id: targetId, projectId },
      });
      valid = !!doc;
    } else if (targetType === "annotation") {
      const ann = await prisma.annotation.findFirst({
        where: {
          id: targetId,
          document: { projectId },
        },
      });
      valid = !!ann;
    } else if (targetType === "task") {
      const task = await prisma.chatTask.findFirst({
        where: { id: targetId, projectId },
      });
      valid = !!task;
    }

    if (!valid) {
      return NextResponse.json(
        { error: "Ugyldig mål-ID eller ingen tilgang" },
        { status: 400 }
      );
    }

    const existingLink = await prisma.chatMessageLink.findFirst({
      where: { messageId, targetType, targetId },
    });

    if (existingLink) {
      return NextResponse.json(
        { error: "Lenke finnes allerede" },
        { status: 400 }
      );
    }

    const link = await prisma.chatMessageLink.create({
      data: {
        messageId,
        targetType,
        targetId,
      },
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("Failed to create message link:", error);
    return NextResponse.json(
      { error: "Kunne ikke opprette lenke" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { messageId } = await params;
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json(
        { error: "linkId er påkrevd" },
        { status: 400 }
      );
    }

    const accessCheck = await verifyMessageAccess(messageId, authResult.user.id);
    if (!accessCheck.success) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: 403 }
      );
    }

    if (accessCheck.message.authorId !== authResult.user.id && authResult.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Du kan bare fjerne lenker fra egne meldinger" },
        { status: 403 }
      );
    }

    await prisma.chatMessageLink.delete({
      where: { id: linkId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete message link:", error);
    return NextResponse.json(
      { error: "Kunne ikke slette lenke" },
      { status: 500 }
    );
  }
}
