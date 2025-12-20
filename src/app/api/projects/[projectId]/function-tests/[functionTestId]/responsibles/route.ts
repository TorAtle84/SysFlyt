import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

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
      select: { id: true },
    });

    if (!functionTest) {
      return NextResponse.json({ error: "Funksjonstest ikke funnet" }, { status: 404 });
    }

    const responsibles = await prisma.functionTestResponsible.findMany({
      where: { functionTestId },
      orderBy: [{ discipline: "asc" }, { systemCode: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    return NextResponse.json({ responsibles });
  } catch (error) {
    console.error("Error fetching function test responsibles:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente delansvarlige" },
      { status: 500 }
    );
  }
}

export async function POST(
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
        { error: "Ingen tilgang til å endre delansvarlige" },
        { status: 403 }
      );
    }

    const functionTest = await prisma.functionTest.findFirst({
      where: { id: functionTestId, projectId },
      select: { id: true },
    });

    if (!functionTest) {
      return NextResponse.json({ error: "Funksjonstest ikke funnet" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const systemCode = String(body?.systemCode ?? "").trim();
    const discipline = String(body?.discipline ?? "").trim();
    const systemOwnerDiscipline = body?.systemOwnerDiscipline ? String(body.systemOwnerDiscipline).trim() : null;
    const testParticipation = body?.testParticipation ? String(body.testParticipation).trim() : null;
    const userId = body?.userId ? String(body.userId) : null;
    const isAutoDetected = Boolean(body?.isAutoDetected);

    if (!systemCode) {
      return NextResponse.json({ error: "systemCode er påkrevd" }, { status: 400 });
    }
    if (!discipline) {
      return NextResponse.json({ error: "discipline er påkrevd" }, { status: 400 });
    }

    // Validate testParticipation if provided
    if (testParticipation && !["Egentest", "Funksjonstest", "Begge"].includes(testParticipation)) {
      return NextResponse.json({ error: "Ugyldig testdeltagelse" }, { status: 400 });
    }

    const responsible = await prisma.functionTestResponsible.create({
      data: {
        functionTestId,
        systemCode,
        discipline,
        systemOwnerDiscipline,
        testParticipation,
        userId,
        isAutoDetected,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    return NextResponse.json({ responsible }, { status: 201 });
  } catch (error) {
    console.error("Error creating function test responsible:", error);
    return NextResponse.json(
      { error: "Kunne ikke opprette delansvarlig" },
      { status: 500 }
    );
  }
}

