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

export async function PUT(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; functionTestId: string; responsibleId: string }>;
  }
) {
  try {
    const { projectId, functionTestId, responsibleId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const canWrite = await requireProjectWriteAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canWrite) {
      return NextResponse.json(
        { error: "Ingen tilgang til å endre delansvarlige" },
        { status: 403 }
      );
    }

    const existing = await prisma.functionTestResponsible.findFirst({
      where: {
        id: responsibleId,
        functionTestId,
        functionTest: { projectId },
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Delansvarlig ikke funnet" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body["systemCode"] !== undefined) {
      data.systemCode = String(body["systemCode"] ?? "").trim();
    }
    if (body["discipline"] !== undefined) {
      data.discipline = String(body["discipline"] ?? "").trim();
    }
    if (body["systemOwnerDiscipline"] !== undefined) {
      const value = body["systemOwnerDiscipline"];
      data.systemOwnerDiscipline = value ? String(value).trim() : null;
    }
    if (body["testParticipation"] !== undefined) {
      const value = body["testParticipation"];
      if (value && !["Egentest", "Funksjonstest", "Begge"].includes(String(value))) {
        return NextResponse.json({ error: "Ugyldig testdeltagelse" }, { status: 400 });
      }
      data.testParticipation = value ? String(value) : null;
    }
    if (body["userId"] !== undefined) {
      const value = body["userId"];
      data.userId = value ? String(value) : null;
    }

    const updated = await prisma.functionTestResponsible.update({
      where: { id: responsibleId },
      data,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    return NextResponse.json({ responsible: updated });
  } catch (error) {
    console.error("Error updating function test responsible:", error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere delansvarlig" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; functionTestId: string; responsibleId: string }>;
  }
) {
  try {
    const { projectId, functionTestId, responsibleId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const canWrite = await requireProjectWriteAccess(
      projectId,
      authResult.user.id,
      authResult.user.role
    );

    if (!canWrite) {
      return NextResponse.json(
        { error: "Ingen tilgang til å slette delansvarlig" },
        { status: 403 }
      );
    }

    const existing = await prisma.functionTestResponsible.findFirst({
      where: {
        id: responsibleId,
        functionTestId,
        functionTest: { projectId },
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Delansvarlig ikke funnet" }, { status: 404 });
    }

    await prisma.functionTestResponsible.delete({ where: { id: responsibleId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting function test responsible:", error);
    return NextResponse.json(
      { error: "Kunne ikke slette delansvarlig" },
      { status: 500 }
    );
  }
}
