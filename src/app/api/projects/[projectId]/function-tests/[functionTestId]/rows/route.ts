import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function requireProjectWriteAccess(projectId: string, userId: string, userRole: string) {
  if (userRole === "ADMIN" || userRole === "PROJECT_LEADER") return true;
  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { role: true },
  });
  return membership?.role === "PROJECT_LEADER" || membership?.role === "USER";
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
        { error: "Ingen tilgang til å opprette testpunkter" },
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
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const predefinedTestIdValue = body["predefinedTestId"];
    const predefinedTestId =
      typeof predefinedTestIdValue === "string" && predefinedTestIdValue.trim()
        ? predefinedTestIdValue.trim()
        : null;

    let category: "START_STOP" | "SECURITY" | "REGULATION" | "EXTERNAL" | "OTHER" = "OTHER";
    let systemPart = "";
    let functionName = "";
    let testExecution = "";
    let acceptanceCriteria = "";

    if (predefinedTestId) {
      const template = await prisma.predefinedFunctionTest.findFirst({
        where: { id: predefinedTestId, isActive: true },
        select: {
          id: true,
          category: true,
          systemPart: true,
          function: true,
          testExecution: true,
          acceptanceCriteria: true,
        },
      });

      if (!template) {
        return NextResponse.json({ error: "Testmal ikke funnet" }, { status: 404 });
      }

      category = template.category;
      systemPart = template.systemPart;
      functionName = template.function;
      testExecution = template.testExecution;
      acceptanceCriteria = template.acceptanceCriteria;
    } else {
      const categoryValue = body["category"];
      if (categoryValue !== undefined) {
        if (!isValidCategory(categoryValue)) {
          return NextResponse.json({ error: "Ugyldig kategori" }, { status: 400 });
        }
        category = categoryValue;
      }

      systemPart = String(body["systemPart"] ?? "");
      functionName = String(body["function"] ?? "");
      testExecution = String(body["testExecution"] ?? "");
      acceptanceCriteria = String(body["acceptanceCriteria"] ?? "");
    }

    const latestRowInCategory = await prisma.functionTestRow.findFirst({
      where: { functionTestId, category },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (latestRowInCategory?.sortOrder ?? -1) + 1;

    const row = await prisma.functionTestRow.create({
      data: {
        functionTestId,
        sortOrder,
        status: "NOT_STARTED",
        category,
        systemPart,
        function: functionName,
        testExecution,
        acceptanceCriteria,
        predefinedTestId,
      },
      include: {
        responsible: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ row }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Testpunkt finnes allerede i denne funksjonstesten" },
        { status: 409 }
      );
    }

    console.error("Error creating function test row:", error);
    return NextResponse.json({ error: "Kunne ikke opprette testpunkt" }, { status: 500 });
  }
}
