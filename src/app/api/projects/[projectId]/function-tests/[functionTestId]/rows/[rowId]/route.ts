import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function requireProjectWriteAccess(
  projectId: string,
  userId: string,
  userRole: string
) {
  if (userRole === "ADMIN" || userRole === "PROJECT_LEADER") return true;
  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  });
  return membership?.role === "PROJECT_LEADER" || membership?.role === "USER";
}

function isValidStatus(
  value: unknown
): value is "NOT_STARTED" | "COMPLETED" | "NOT_APPLICABLE" | "DEVIATION" {
  return (
    value === "NOT_STARTED" ||
    value === "COMPLETED" ||
    value === "NOT_APPLICABLE" ||
    value === "DEVIATION"
  );
}

function isValidCategory(
  value: unknown
): value is "START_STOP" | "SECURITY" | "REGULATION" | "EXTERNAL" | "OTHER" {
  return (
    value === "START_STOP" ||
    value === "SECURITY" ||
    value === "REGULATION" ||
    value === "EXTERNAL" ||
    value === "OTHER"
  );
}

export async function PUT(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; functionTestId: string; rowId: string }>;
  }
) {
  try {
    const { projectId, functionTestId, rowId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const canWrite = await requireProjectWriteAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canWrite) {
      return NextResponse.json(
        { error: "Ingen tilgang til å endre testpunkt" },
        { status: 403 }
      );
    }

    const existing = await prisma.functionTestRow.findFirst({
      where: {
        id: rowId,
        functionTestId,
        functionTest: { projectId },
      },
      select: {
        id: true,
        status: true,
        completedDate: true,
        performedById: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Testpunkt ikke funnet" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    const sortOrderValue = body["sortOrder"];
    if (typeof sortOrderValue === "number" && Number.isFinite(sortOrderValue)) {
      data.sortOrder = sortOrderValue;
    }

    const categoryValue = body["category"];
    if (categoryValue !== undefined) {
      if (!isValidCategory(categoryValue)) {
        return NextResponse.json({ error: "Ugyldig kategori" }, { status: 400 });
      }
      data.category = categoryValue;
    }

    const systemPartValue = body["systemPart"];
    if (systemPartValue !== undefined) {
      data.systemPart = String(systemPartValue ?? "").trim();
    }

    const functionValue = body["function"];
    if (functionValue !== undefined) {
      data.function = String(functionValue ?? "").trim();
    }

    const testExecutionValue = body["testExecution"];
    if (testExecutionValue !== undefined) {
      data.testExecution = String(testExecutionValue ?? "").trim();
    }

    const acceptanceCriteriaValue = body["acceptanceCriteria"];
    if (acceptanceCriteriaValue !== undefined) {
      data.acceptanceCriteria = String(acceptanceCriteriaValue ?? "").trim();
    }

    if (body["responsibleId"] !== undefined) {
      const value = body["responsibleId"];
      data.responsibleId = value ? String(value) : null;
    }

    if (body["discipline"] !== undefined) {
      const value = body["discipline"];
      data.discipline = value ? String(value) : null;
    }

    if (body["testParticipation"] !== undefined) {
      const value = body["testParticipation"];
      if (value && !["Egentest", "Funksjonstest", "Begge"].includes(String(value))) {
        return NextResponse.json({ error: "Ugyldig testdeltagelse" }, { status: 400 });
      }
      data.testParticipation = value ? String(value) : null;
    }

    if (body["assignedToId"] !== undefined) {
      const value = body["assignedToId"];
      data.assignedToId = value ? String(value) : null;
    }

    if (body["performedById"] !== undefined) {
      const value = body["performedById"];
      data.performedById = value ? String(value) : null;
    }

    const completedDateValue = body["completedDate"];
    if (completedDateValue !== undefined) {
      if (completedDateValue === null || completedDateValue === "") {
        data.completedDate = null;
      } else {
        const parsed = new Date(String(completedDateValue));
        if (!Number.isFinite(parsed.getTime())) {
          return NextResponse.json({ error: "Ugyldig completedDate" }, { status: 400 });
        }
        data.completedDate = parsed;
      }
    }

    const commentsValue = body["comments"];
    if (commentsValue !== undefined) {
      if (commentsValue === null) {
        data.comments = null;
      } else if (Array.isArray(commentsValue)) {
        data.comments = commentsValue;
      } else {
        return NextResponse.json({ error: "Ugyldig comments-format" }, { status: 400 });
      }
    }

    let nextStatus = existing.status;
    const statusValue = body["status"];
    if (statusValue !== undefined) {
      if (!isValidStatus(statusValue)) {
        return NextResponse.json({ error: "Ugyldig status" }, { status: 400 });
      }
      nextStatus = statusValue;
      data.status = statusValue;
    }

    const isCompletionStatus = ["COMPLETED", "NOT_APPLICABLE", "DEVIATION"].includes(
      nextStatus
    );
    const changedToCompleted = isCompletionStatus && existing.status !== nextStatus;
    const hasCompletedDateInRequest = "completedDate" in data;

    if (!isCompletionStatus) {
      data.completedDate = null;
    } else if (changedToCompleted && !existing.completedDate && !hasCompletedDateInRequest) {
      data.completedDate = new Date();
      if (!("performedById" in data) && !existing.performedById) {
        data.performedById = authResult.user.id;
      }
    }

    const updated = await prisma.functionTestRow.update({
      where: { id: rowId },
      data,
      include: {
        responsible: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true } },
        functionTest: {
          select: {
            systemCode: true,
            projectId: true,
            project: { select: { name: true } },
          },
        },
      },
    });

    // Create notifications
    const notificationsToCreate: {
      userId: string;
      type: string;
      metadata: object;
    }[] = [];

    // Notification for assignment
    const newAssignedToId = body["assignedToId"];
    if (newAssignedToId && typeof newAssignedToId === "string" && newAssignedToId !== authResult.user.id) {
      notificationsToCreate.push({
        userId: newAssignedToId,
        type: "FUNCTION_TEST_ASSIGNMENT",
        metadata: {
          functionTestId,
          rowId,
          systemCode: updated.functionTest.systemCode,
          projectId: updated.functionTest.projectId,
          projectName: updated.functionTest.project.name,
          systemPart: updated.systemPart,
          function: updated.function,
          assignedBy: `${authResult.user.firstName} ${authResult.user.lastName}`,
        },
      });
    }

    // Notification for deviation
    const statusChanged = body["status"] !== undefined && body["status"] !== existing.status;
    if (statusChanged && nextStatus === "DEVIATION") {
      // Notify the responsible person if there is one
      const responsibleUserId = updated.responsible?.userId;
      if (responsibleUserId && responsibleUserId !== authResult.user.id) {
        notificationsToCreate.push({
          userId: responsibleUserId,
          type: "FUNCTION_TEST_DEVIATION",
          metadata: {
            functionTestId,
            rowId,
            systemCode: updated.functionTest.systemCode,
            projectId: updated.functionTest.projectId,
            projectName: updated.functionTest.project.name,
            systemPart: updated.systemPart,
            function: updated.function,
            reportedBy: `${authResult.user.firstName} ${authResult.user.lastName}`,
          },
        });
      }
    }

    // Create all notifications
    if (notificationsToCreate.length > 0) {
      await prisma.notification.createMany({
        data: notificationsToCreate,
      });
    }

    return NextResponse.json({ row: updated });
  } catch (error) {
    console.error("Error updating function test row:", error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere testpunkt" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; functionTestId: string; rowId: string }>;
  }
) {
  try {
    const { projectId, functionTestId, rowId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const canWrite = await requireProjectWriteAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canWrite) {
      return NextResponse.json(
        { error: "Ingen tilgang til å slette testpunkt" },
        { status: 403 }
      );
    }

    const existing = await prisma.functionTestRow.findFirst({
      where: {
        id: rowId,
        functionTestId,
        functionTest: { projectId },
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Testpunkt ikke funnet" }, { status: 404 });
    }

    await prisma.functionTestRow.delete({
      where: { id: rowId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting function test row:", error);
    return NextResponse.json(
      { error: "Kunne ikke slette testpunkt" },
      { status: 500 }
    );
  }
}
