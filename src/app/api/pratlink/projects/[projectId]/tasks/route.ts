import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectAccess } from "@/lib/auth-helpers";
import prisma from "@/lib/db";
import { sanitizeString } from "@/lib/sanitize";
import { sendTaskAssignedEmail } from "@/lib/email";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const { projectId } = await params;

  const accessCheck = await requireProjectAccess(projectId);
  if (!accessCheck.success) {
    return accessCheck.error;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const assignedToMe = url.searchParams.get("assignedToMe") === "true";

  const whereClause: Record<string, unknown> = { projectId };

  if (status) {
    whereClause.status = status;
  }

  if (assignedToMe) {
    whereClause.responsibleUserId = authResult.user.id;
  }

  const tasks = await prisma.chatTask.findMany({
    where: whereClause,
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
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ tasks });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const { projectId } = await params;

  const accessCheck = await requireProjectAccess(projectId);
  if (!accessCheck.success) {
    return accessCheck.error;
  }

  const body = await request.json();
  const { title, description, responsibleUserId, dueDate, messageId } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "Tittel er påkrevd" },
      { status: 400 }
    );
  }

  const sanitizedTitle = sanitizeString(title.trim(), 500);
  const sanitizedDescription = description
    ? sanitizeString(description.trim(), 5000)
    : null;

  let validResponsibleUserId: string | null = null;

  if (responsibleUserId) {
    const isMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: responsibleUserId,
      },
    });

    if (!isMember) {
      return NextResponse.json(
        { error: "Ansvarlig bruker er ikke medlem av prosjektet" },
        { status: 400 }
      );
    }

    validResponsibleUserId = responsibleUserId;
  }

  let parsedDueDate: Date | null = null;
  if (dueDate) {
    parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return NextResponse.json(
        { error: "Ugyldig fristdato" },
        { status: 400 }
      );
    }
  }

  let validMessageId: string | null = null;
  if (messageId) {
    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        room: {
          projectId,
        },
      },
    });

    if (message) {
      validMessageId = messageId;
    }
  }

  const task = await prisma.chatTask.create({
    data: {
      projectId,
      title: sanitizedTitle,
      description: sanitizedDescription,
      responsibleUserId: validResponsibleUserId,
      dueDate: parsedDueDate,
      createdFromMessageId: validMessageId,
      createdById: authResult.user.id,
    },
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
      project: {
        select: {
          name: true,
        },
      },
    },
  });

  if (
    task.responsibleUser &&
    task.responsibleUser.id !== authResult.user.id &&
    task.createdBy
  ) {
    const baseUrl =
      process.env.NEXTAUTH_URL || `https://${request.headers.get("host")}`;
    const taskUrl = `${baseUrl}/pratlink/${projectId}?tab=tasks`;

    await sendTaskAssignedEmail(
      task.responsibleUser.email,
      task.responsibleUser.firstName,
      task.title,
      task.project.name,
      `${task.createdBy.firstName} ${task.createdBy.lastName}`,
      parsedDueDate
        ? format(parsedDueDate, "d. MMMM yyyy", { locale: nb })
        : null,
      taskUrl
    );

    await prisma.chatTask.update({
      where: { id: task.id },
      data: { emailSent: true },
    });

    await prisma.notification.create({
      data: {
        userId: task.responsibleUser.id,
        type: "task_assigned",
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          projectId,
          projectName: task.project.name,
          assignerName: `${task.createdBy.firstName} ${task.createdBy.lastName}`,
        },
      },
    });
  }

  return NextResponse.json({ task }, { status: 201 });
}
