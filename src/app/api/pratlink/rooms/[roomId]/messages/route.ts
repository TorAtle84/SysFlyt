import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { sanitizeString } from "@/lib/sanitize";

async function verifyRoomAccess(roomId: string, userId: string) {
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: {
      project: {
        include: {
          members: true,
        },
      },
    },
  });

  if (!room || !room.isActive) {
    return { success: false as const, error: "Rom ikke funnet" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { success: false as const, error: "Bruker ikke funnet" };
  }

  const isMember =
    room.project.members.some((m) => m.userId === userId) ||
    user.role === "ADMIN";

  if (!isMember) {
    return { success: false as const, error: "Ingen tilgang" };
  }

  return { success: true as const, room, user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { roomId } = await params;

    const accessCheck = await verifyRoomAccess(roomId, authResult.user.id);
    if (!accessCheck.success) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const before = searchParams.get("before");

    const messages = await prisma.chatMessage.findMany({
      where: {
        roomId,
        parentId: null,
        deletedAt: null,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
        mentions: {
          include: {
            mentionedUser: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        attachments: true,
        links: true,
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente meldinger" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { roomId } = await params;

    const accessCheck = await verifyRoomAccess(roomId, authResult.user.id);
    if (!accessCheck.success) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { content, parentId } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Meldingsinnhold er påkrevd" },
        { status: 400 }
      );
    }

    const sanitizedContent = sanitizeString(content, 10000);

    const mentionRegex = /@([A-Za-zÆØÅæøå\s]+?)(?=\s|$|@)/g;
    const mentionMatches = [...sanitizedContent.matchAll(mentionRegex)];

    const mentionedUserIds: string[] = [];

    if (mentionMatches.length > 0) {
      const mentionedNames = mentionMatches.map((m) => m[1].trim().toLowerCase());
      
      const projectMemberIds = accessCheck.room.project.members.map((m) => m.userId);
      
      const projectMemberUsers = await prisma.user.findMany({
        where: {
          id: { in: projectMemberIds },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });
      
      for (const name of mentionedNames) {
        const matchedMember = projectMemberUsers.find((user) => {
          const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
          const firstName = user.firstName.toLowerCase();
          return fullName === name || fullName.startsWith(name) || firstName === name;
        });
        
        if (
          matchedMember &&
          matchedMember.id !== authResult.user.id &&
          !mentionedUserIds.includes(matchedMember.id)
        ) {
          mentionedUserIds.push(matchedMember.id);
        }
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        authorId: authResult.user.id,
        content: sanitizedContent,
        parentId: parentId || null,
        mentions: {
          create: mentionedUserIds.map((userId) => ({
            mentionedUserId: userId,
          })),
        },
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
        mentions: {
          include: {
            mentionedUser: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    for (const mentionedUserId of mentionedUserIds) {
      await prisma.notification.create({
        data: {
          userId: mentionedUserId,
          type: "chat_mention",
          metadata: {
            roomId,
            roomName: accessCheck.room.name,
            messageId: message.id,
            projectId: accessCheck.room.projectId,
            projectName: accessCheck.room.project.name,
            senderName: `${message.author.firstName} ${message.author.lastName}`,
            messagePreview: sanitizedContent.slice(0, 100),
          },
        },
      });
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Error creating message:", error);
    return NextResponse.json(
      { error: "Kunne ikke sende melding" },
      { status: 500 }
    );
  }
}
