import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = parseInt(searchParams.get("limit") || "20");

    const notifications = await prisma.notification.findMany({
      where: {
        userId: authResult.user.id,
        ...(unreadOnly ? { read: false } : {}),
      },
      include: {
        comment: {
          select: {
            id: true,
            content: true,
            author: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        annotation: {
          select: {
            id: true,
            document: {
              select: {
                id: true,
                title: true,
                projectId: true,
              },
            },
          },
        },
        systemAnnotation: {
          select: {
            id: true,
            document: {
              select: {
                id: true,
                title: true,
                projectId: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: {
        userId: authResult.user.id,
        read: false,
      },
    });

    const formattedNotifications = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      metadata: n.metadata,
      comment: n.comment
        ? {
            id: n.comment.id,
            content: n.comment.content,
            author: n.comment.author,
          }
        : null,
      annotation: n.annotation
        ? {
            id: n.annotation.id,
            document: n.annotation.document,
          }
        : n.systemAnnotation
        ? {
            id: n.systemAnnotation.id,
            document: n.systemAnnotation.document,
          }
        : null,
    }));

    return NextResponse.json({
      notifications: formattedNotifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const body = await request.json();
    const { notificationId, markAllRead } = body;

    if (markAllRead) {
      await prisma.notification.updateMany({
        where: {
          userId: authResult.user.id,
          read: false,
        },
        data: { read: true },
      });
      return NextResponse.json({ success: true });
    }

    if (!notificationId) {
      return NextResponse.json({ error: "Mangler varsel-ID" }, { status: 400 });
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return NextResponse.json({ error: "Varsel ikke funnet" }, { status: 404 });
    }

    if (notification.userId !== authResult.user.id) {
      return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notification:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
