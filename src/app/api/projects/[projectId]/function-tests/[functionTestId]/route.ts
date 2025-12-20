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

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; functionTestId: string }>;
  }
) {
  try {
    const { projectId, functionTestId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const functionTest = await prisma.functionTest.findFirst({
      where: { id: functionTestId, projectId },
      include: {
        systemOwner: { select: { id: true, firstName: true, lastName: true } },
        responsibles: {
          orderBy: [{ discipline: "asc" }, { systemCode: "asc" }, { createdAt: "asc" }],
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        rows: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            responsible: true,
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            performedBy: { select: { id: true, firstName: true, lastName: true } },
            predefinedTest: { select: { id: true, isActive: true } },
          },
        },
      },
    });

    if (!functionTest) {
      return NextResponse.json({ error: "Funksjonstest ikke funnet" }, { status: 404 });
    }

    return NextResponse.json({ functionTest });
  } catch (error) {
    console.error("Error fetching function test:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente funksjonstest" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; functionTestId: string }>;
  }
) {
  try {
    const { projectId, functionTestId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const canWrite = await requireProjectWriteAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canWrite) {
      return NextResponse.json(
        { error: "Ingen tilgang til å endre funksjonstest" },
        { status: 403 }
      );
    }

    const existing = await prisma.functionTest.findFirst({
      where: { id: functionTestId, projectId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Funksjonstest ikke funnet" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    const systemNameValue = body["systemName"];
    if (systemNameValue !== undefined) {
      data.systemName = systemNameValue ? String(systemNameValue).trim() : null;
    }

    const systemOwnerIdValue = body["systemOwnerId"];
    if (systemOwnerIdValue !== undefined) {
      data.systemOwnerId = systemOwnerIdValue ? String(systemOwnerIdValue) : null;
    }

    const systemOwnerDisciplineValue = body["systemOwnerDiscipline"];
    if (systemOwnerDisciplineValue !== undefined) {
      data.systemOwnerDiscipline = systemOwnerDisciplineValue ? String(systemOwnerDisciplineValue) : null;
    }

    const softwareResponsibleValue = body["softwareResponsible"];
    if (softwareResponsibleValue !== undefined) {
      data.softwareResponsible = softwareResponsibleValue ? String(softwareResponsibleValue) : null;
    }

    const datesValue = body["dates"];
    if (datesValue !== undefined) {
      if (datesValue === null) {
        data.dates = null;
      } else if (isRecord(datesValue)) {
        data.dates = datesValue;
      } else {
        return NextResponse.json({ error: "Ugyldig dates-format" }, { status: 400 });
      }
    }

    const updated = await prisma.functionTest.update({
      where: { id: functionTestId },
      data,
      include: {
        systemOwner: { select: { id: true, firstName: true, lastName: true } },
        responsibles: {
          orderBy: [{ discipline: "asc" }, { systemCode: "asc" }, { createdAt: "asc" }],
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        rows: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            responsible: true,
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            performedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    return NextResponse.json({ functionTest: updated });
  } catch (error) {
    console.error("Error updating function test:", error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere funksjonstest" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; functionTestId: string }>;
  }
) {
  try {
    const { projectId, functionTestId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const canWrite = await requireProjectWriteAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canWrite) {
      return NextResponse.json(
        { error: "Ingen tilgang til å slette funksjonstest" },
        { status: 403 }
      );
    }

    const existing = await prisma.functionTest.findFirst({
      where: { id: functionTestId, projectId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Funksjonstest ikke funnet" },
        { status: 404 }
      );
    }

    await prisma.functionTest.delete({
      where: { id: functionTestId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting function test:", error);
    return NextResponse.json(
      { error: "Kunne ikke slette funksjonstest" },
      { status: 500 }
    );
  }
}
