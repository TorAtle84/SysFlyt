import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectAccess } from "@/lib/auth-helpers";
import prisma from "@/lib/db";
import { sanitizeString } from "@/lib/sanitize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const { taskId } = await params;

  const task = await prisma.chatTask.findUnique({
    where: { id: taskId },
    include: {
      responsibleUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      createdFromMessage: {
        select: {
          id: true,
          content: true,
          room: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json(
      { error: "Oppgave ikke funnet" },
      { status: 404 }
    );
  }

  const accessCheck = await requireProjectAccess(task.projectId);
  if (!accessCheck.success) {
    return accessCheck.error;
  }

  return NextResponse.json({ task });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const { taskId } = await params;

  const task = await prisma.chatTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return NextResponse.json(
      { error: "Oppgave ikke funnet" },
      { status: 404 }
    );
  }

  const accessCheck = await requireProjectAccess(task.projectId);
  if (!accessCheck.success) {
    return accessCheck.error;
  }

  const body = await request.json();
  const { title, description, responsibleUserId, dueDate, status } = body;

  const updateData: Record<string, unknown> = {};

  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Tittel kan ikke være tom" },
        { status: 400 }
      );
    }
    updateData.title = sanitizeString(title.trim(), 500);
  }

  if (description !== undefined) {
    updateData.description = description
      ? sanitizeString(description.trim(), 5000)
      : null;
  }

  if (responsibleUserId !== undefined) {
    if (responsibleUserId === null) {
      updateData.responsibleUserId = null;
    } else {
      const isMember = await prisma.projectMember.findFirst({
        where: {
          projectId: task.projectId,
          userId: responsibleUserId,
        },
      });

      if (!isMember) {
        return NextResponse.json(
          { error: "Ansvarlig bruker er ikke medlem av prosjektet" },
          { status: 400 }
        );
      }

      updateData.responsibleUserId = responsibleUserId;
    }
  }

  if (dueDate !== undefined) {
    if (dueDate === null) {
      updateData.dueDate = null;
    } else {
      const parsedDate = new Date(dueDate);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: "Ugyldig fristdato" },
          { status: 400 }
        );
      }
      updateData.dueDate = parsedDate;
    }
  }

  if (status !== undefined) {
    if (!["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].includes(status)) {
      return NextResponse.json(
        { error: "Ugyldig status" },
        { status: 400 }
      );
    }
    updateData.status = status;
  }

  const updatedTask = await prisma.chatTask.update({
    where: { id: taskId },
    data: updateData,
    include: {
      responsibleUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return NextResponse.json({ task: updatedTask });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const { taskId } = await params;

  const task = await prisma.chatTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return NextResponse.json(
      { error: "Oppgave ikke funnet" },
      { status: 404 }
    );
  }

  const accessCheck = await requireProjectAccess(task.projectId);
  if (!accessCheck.success) {
    return accessCheck.error;
  }

  if (
    authResult.user.role !== "ADMIN" &&
    task.createdById !== authResult.user.id
  ) {
    return NextResponse.json(
      { error: "Du kan bare slette oppgaver du har opprettet" },
      { status: 403 }
    );
  }

  await prisma.chatTask.delete({
    where: { id: taskId },
  });

  return NextResponse.json({ success: true });
}
