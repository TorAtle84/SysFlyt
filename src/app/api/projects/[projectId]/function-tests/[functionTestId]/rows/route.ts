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

    // Fetch project creator to use as default value for assignedToId (Ansvarlig)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { createdById: true },
    });
    const defaultResponsibleId = project?.createdById;

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const groupValue = body["predefinedFunctionGroup"];
    if (isRecord(groupValue)) {
      const systemGroupRaw = String(groupValue["systemGroup"] ?? "").trim();
      const systemType = String(
        groupValue["systemType"] ?? groupValue["systemPart"] ?? ""
      ).trim();
      const functionName = String(
        groupValue["functionName"] ?? groupValue["function"] ?? ""
      ).trim();

      if (!systemType || !functionName) {
        return NextResponse.json(
          { error: "Systemtype og funksjon er påkrevd" },
          { status: 400 }
        );
      }

      const andFilters: Prisma.PredefinedFunctionTestWhereInput[] = [
        {
          OR: [
            { systemType: { equals: systemType, mode: "insensitive" } },
            { systemPart: { equals: systemType, mode: "insensitive" } },
          ],
        },
        { function: { equals: functionName, mode: "insensitive" } },
      ];

      if (systemGroupRaw) {
        andFilters.push({ systemGroup: systemGroupRaw });
      } else {
        andFilters.push({
          OR: [{ systemGroup: null }, { systemGroup: "" }],
        });
      }

      const templates = await prisma.predefinedFunctionTest.findMany({
        where: {
          isActive: true,
          AND: andFilters,
        },
        orderBy: [{ category: "asc" }, { id: "asc" }],
        select: {
          id: true,
          category: true,
          systemPart: true,
          function: true,
          testExecution: true,
          acceptanceCriteria: true,
        },
      });

      if (templates.length === 0) {
        return NextResponse.json({ error: "Testmaler ikke funnet" }, { status: 404 });
      }

      const templateIds = templates.map((t) => t.id);

      const existingTemplates = await prisma.functionTestRow.findMany({
        where: {
          functionTestId,
          predefinedTestId: { in: templateIds },
        },
        select: { predefinedTestId: true },
      });

      const existingTemplateIds = new Set(
        existingTemplates.map((row) => row.predefinedTestId).filter((v): v is string => !!v)
      );

      const maxSortOrders = await prisma.functionTestRow.groupBy({
        by: ["category"],
        where: { functionTestId },
        _max: { sortOrder: true },
      });

      const nextSortOrderByCategory = new Map(
        maxSortOrders.map((entry) => [entry.category, entry._max.sortOrder ?? -1])
      );

      const rowsToCreate: Prisma.FunctionTestRowCreateManyInput[] = [];

      for (const template of templates) {
        if (existingTemplateIds.has(template.id)) continue;
        const currentOrder = nextSortOrderByCategory.get(template.category) ?? -1;
        const nextOrder = currentOrder + 1;
        nextSortOrderByCategory.set(template.category, nextOrder);

        rowsToCreate.push({
          functionTestId,
          sortOrder: nextOrder,
          status: "NOT_STARTED",
          category: template.category,
          systemPart: template.systemPart,
          function: template.function,
          testExecution: template.testExecution,
          acceptanceCriteria: template.acceptanceCriteria,
          predefinedTestId: template.id,
          assignedToId: defaultResponsibleId,
        });
      }

      if (rowsToCreate.length === 0) {
        return NextResponse.json({
          rows: [],
          createdCount: 0,
          skippedCount: templates.length,
        });
      }

      const result = await prisma.functionTestRow.createMany({
        data: rowsToCreate,
        skipDuplicates: true,
      });

      const createdRows = await prisma.functionTestRow.findMany({
        where: {
          functionTestId,
          predefinedTestId: { in: rowsToCreate.map((row) => row.predefinedTestId!).filter(Boolean) },
        },
        include: {
          responsible: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          performedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return NextResponse.json(
        {
          rows: createdRows,
          createdCount: result.count,
          skippedCount: templates.length - result.count,
        },
        { status: 201 }
      );
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
        assignedToId: defaultResponsibleId,
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
