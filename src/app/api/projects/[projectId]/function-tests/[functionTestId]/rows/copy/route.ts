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
        { error: "Ingen tilgang til å kopiere testrader" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const targetFunctionTestIds = body["targetFunctionTestIds"];
    const rowIds = body["rowIds"];

    if (!Array.isArray(targetFunctionTestIds) || targetFunctionTestIds.length === 0) {
      return NextResponse.json({ error: "Mangler målsystemer" }, { status: 400 });
    }

    if (!Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json({ error: "Mangler rader å kopiere" }, { status: 400 });
    }

    // Verify source function test exists and belongs to project
    const sourceFunctionTest = await prisma.functionTest.findFirst({
      where: { id: functionTestId, projectId },
      select: { id: true },
    });

    if (!sourceFunctionTest) {
      return NextResponse.json({ error: "Kilde-funksjonstest ikke funnet" }, { status: 404 });
    }

    // Verify all target function tests exist and belong to project
    const targetFunctionTests = await prisma.functionTest.findMany({
      where: {
        id: { in: targetFunctionTestIds.map(String) },
        projectId,
      },
      select: { id: true },
    });

    if (targetFunctionTests.length !== targetFunctionTestIds.length) {
      return NextResponse.json(
        { error: "Én eller flere målsystemer er ugyldige" },
        { status: 400 }
      );
    }

    // Get the rows to copy
    const sourceRows = await prisma.functionTestRow.findMany({
      where: {
        id: { in: rowIds.map(String) },
        functionTestId,
      },
      select: {
        category: true,
        systemPart: true,
        function: true,
        testExecution: true,
        acceptanceCriteria: true,
        predefinedTestId: true,
      },
    });

    if (sourceRows.length === 0) {
      return NextResponse.json({ error: "Ingen rader funnet å kopiere" }, { status: 400 });
    }

    // Copy rows to each target function test
    let totalCreated = 0;

    for (const targetId of targetFunctionTestIds) {
      // Get the highest sortOrder in the target function test
      const maxSortOrder = await prisma.functionTestRow.aggregate({
        where: { functionTestId: String(targetId) },
        _max: { sortOrder: true },
      });
      let nextSortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

      for (const row of sourceRows) {
        await prisma.functionTestRow.create({
          data: {
            functionTestId: String(targetId),
            sortOrder: nextSortOrder++,
            status: "NOT_STARTED",
            category: row.category,
            systemPart: row.systemPart,
            function: row.function,
            testExecution: row.testExecution,
            acceptanceCriteria: row.acceptanceCriteria,
            predefinedTestId: row.predefinedTestId,
            // Reset assignment fields
            responsibleId: null,
            assignedToId: null,
            performedById: null,
            completedDate: null,
            comments: undefined,
          },
        });
        totalCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      copiedCount: totalCreated,
      targetCount: targetFunctionTestIds.length,
      rowCount: sourceRows.length,
    });
  } catch (error) {
    console.error("Error copying function test rows:", error);
    return NextResponse.json(
      { error: "Kunne ikke kopiere testrader" },
      { status: 500 }
    );
  }
}
