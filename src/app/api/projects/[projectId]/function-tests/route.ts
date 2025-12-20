import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import { normalizeSystemCode } from "@/lib/tfm-id";

function computeProgressStats(rows: { status: string }[]) {
  const totalRows = rows.length;
  const completedRows = rows.filter((r) =>
    ["COMPLETED", "NOT_APPLICABLE", "DEVIATION"].includes(r.status)
  ).length;
  const deviationRows = rows.filter((r) => r.status === "DEVIATION").length;
  const progress = totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0;

  return { totalRows, completedRows, deviationRows, progress };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const tests = await prisma.functionTest.findMany({
      where: { projectId },
      orderBy: { systemCode: "asc" },
      include: {
        rows: { select: { status: true } },
      },
    });

    const testsWithStats = tests.map((t) => {
      const { rows, ...rest } = t;
      return { ...rest, stats: computeProgressStats(rows) };
    });

    return NextResponse.json({ functionTests: testsWithStats });
  } catch (error) {
    console.error("Error fetching function tests:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente funksjonstester" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) return authResult.error;

    const membership =
      authResult.user.role === "ADMIN"
        ? null
        : await prisma.projectMember.findFirst({
            where: { projectId, userId: authResult.user.id },
            select: { role: true },
          });

    const canGenerate =
      authResult.user.role === "ADMIN" ||
      authResult.user.role === "PROJECT_LEADER" ||
      membership?.role === "PROJECT_LEADER";

    if (!canGenerate) {
      return NextResponse.json(
        { error: "Krever prosjektledertilgang" },
        { status: 403 }
      );
    }

    let requestedSystemCodes: string[] | undefined;
    try {
      const body = await request.json();
      if (body && Array.isArray(body.systemCodes)) {
        requestedSystemCodes = body.systemCodes;
      }
    } catch {
      // No body
    }

    const systemCodes = new Set<string>();

    if (requestedSystemCodes && requestedSystemCodes.length > 0) {
      for (const raw of requestedSystemCodes) {
        const normalized = normalizeSystemCode(raw);
        if (normalized) systemCodes.add(normalized);
      }
    } else {
      const componentSystems = await prisma.documentComponent.findMany({
        where: {
          system: { not: null },
          document: { projectId },
        },
        select: { system: true },
      });

      for (const c of componentSystems) {
        const normalized = normalizeSystemCode(c.system);
        if (normalized) systemCodes.add(normalized);
      }

      const protocolSystems = await prisma.mCProtocol.findMany({
        where: { projectId },
        select: { systemCode: true },
      });

      for (const p of protocolSystems) {
        const normalized = normalizeSystemCode(p.systemCode);
        if (normalized) systemCodes.add(normalized);
      }
    }

    const normalizedSystems = Array.from(systemCodes).sort((a, b) =>
      a.localeCompare(b)
    );

    if (normalizedSystems.length === 0) {
      return NextResponse.json(
        { error: "Fant ingen systemkoder å generere funksjonstester for" },
        { status: 400 }
      );
    }

    const predefinedTests = await prisma.predefinedFunctionTest.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { systemPart: "asc" }, { function: "asc" }],
    });

    if (predefinedTests.length === 0) {
      return NextResponse.json(
        { error: "Ingen predefinerte funksjonstester er aktivert" },
        { status: 400 }
      );
    }

    let createdFunctionTests = 0;
    let createdRows = 0;

    for (const systemCode of normalizedSystems) {
      const existing = await prisma.functionTest.findUnique({
        where: { projectId_systemCode: { projectId, systemCode } },
        select: { id: true },
      });

      const mcProtocol = await prisma.mCProtocol.findUnique({
        where: { projectId_systemCode: { projectId, systemCode } },
        select: { systemName: true },
      });

      const functionTest = await prisma.functionTest.upsert({
        where: { projectId_systemCode: { projectId, systemCode } },
        update: {},
        create: {
          projectId,
          systemCode,
          systemName: mcProtocol?.systemName || `System ${systemCode}`,
        },
      });

      if (!existing) createdFunctionTests++;

      const existingRows = await prisma.functionTestRow.findMany({
        where: {
          functionTestId: functionTest.id,
          predefinedTestId: { not: null },
        },
        select: { predefinedTestId: true, sortOrder: true },
      });

      const existingTemplateIds = new Set(
        existingRows.map((r) => r.predefinedTestId).filter((v): v is string => !!v)
      );

      const maxSortOrder =
        existingRows.length > 0
          ? Math.max(...existingRows.map((r) => r.sortOrder))
          : -1;

      let nextSortOrder = maxSortOrder + 1;

      const rowsToCreate = predefinedTests
        .filter((t) => !existingTemplateIds.has(t.id))
        .map((t) => ({
          functionTestId: functionTest.id,
          sortOrder: nextSortOrder++,
          status: "NOT_STARTED" as const,
          category: t.category,
          systemPart: t.systemPart,
          function: t.function,
          testExecution: t.testExecution,
          acceptanceCriteria: t.acceptanceCriteria,
          predefinedTestId: t.id,
        }));

      if (rowsToCreate.length > 0) {
        const result = await prisma.functionTestRow.createMany({
          data: rowsToCreate,
          skipDuplicates: true,
        });
        createdRows += result.count;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Opprettet/Oppdaterte ${createdFunctionTests} funksjonstester og la til ${createdRows} nye testpunkter.`,
      systems: normalizedSystems,
      createdFunctionTests,
      createdRows,
    });
  } catch (error: unknown) {
    console.error("Error generating function tests:", error);
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json(
      {
        error: `Kunne ikke generere funksjonstester: ${message}`,
      },
      { status: 500 }
    );
  }
}
