import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) return authResult.error;

    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");
    const hasPaging = pageParam !== null || pageSizeParam !== null;
    const page = Math.max(1, Number.parseInt(pageParam || "1", 10));
    const pageSizeRaw = Number.parseInt(pageSizeParam || "10", 10);
    const pageSize = hasPaging
      ? Math.min(50, Math.max(1, Number.isNaN(pageSizeRaw) ? 10 : pageSizeRaw))
      : 0;

    const systemGroup = (searchParams.get("systemGroup") || "").trim();
    const systemType = (searchParams.get("systemType") || "").trim();
    const functionName = (searchParams.get("function") || "").trim();
    const category = (searchParams.get("category") || "").trim();
    const query = (searchParams.get("q") || "").trim();
    const groupBy = (searchParams.get("groupBy") || "").trim();

    const where: Prisma.PredefinedFunctionTestWhereInput = {
      isActive: true,
    };

    const andFilters: Prisma.PredefinedFunctionTestWhereInput[] = [];

    if (systemGroup) {
      andFilters.push({
        systemGroup: { contains: systemGroup, mode: "insensitive" },
      });
    }

    if (systemType) {
      andFilters.push({
        OR: [
          { systemType: { contains: systemType, mode: "insensitive" } },
          { systemPart: { contains: systemType, mode: "insensitive" } },
        ],
      });
    }

    if (functionName) {
      andFilters.push({
        function: { contains: functionName, mode: "insensitive" },
      });
    }

    if (category && isValidCategory(category)) {
      andFilters.push({ category });
    }

    if (query) {
      andFilters.push({
        OR: [
          { systemGroup: { contains: query, mode: "insensitive" } },
          { systemType: { contains: query, mode: "insensitive" } },
          { systemPart: { contains: query, mode: "insensitive" } },
          { function: { contains: query, mode: "insensitive" } },
          { testExecution: { contains: query, mode: "insensitive" } },
          { acceptanceCriteria: { contains: query, mode: "insensitive" } },
        ],
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    if (groupBy === "function") {
      const groupOrderBy: Prisma.PredefinedFunctionTestOrderByWithAggregationInput[] = [
        { systemGroup: "asc" },
        { systemType: "asc" },
        { function: "asc" },
      ];

      const [totalGroups, grouped] = await prisma.$transaction([
        prisma.predefinedFunctionTest.groupBy({
          by: ["systemGroup", "systemType", "function"],
          where,
          orderBy: groupOrderBy,
        }),
        prisma.predefinedFunctionTest.groupBy({
          by: ["systemGroup", "systemType", "function"],
          where,
          _count: { _all: true },
          orderBy: groupOrderBy,
          ...(hasPaging
            ? {
                skip: (page - 1) * pageSize,
                take: pageSize,
              }
            : {}),
        }),
      ]);

      return NextResponse.json({
        functions: grouped.map((group) => {
          const countValue =
            (group._count as { _all?: number } | null | undefined)?._all ?? 0;
          return {
            systemGroup: group.systemGroup,
            systemType: group.systemType,
            function: group.function,
            testCount: countValue,
          };
        }),
        total: totalGroups.length,
        page: hasPaging ? page : 1,
        pageSize: hasPaging ? pageSize : totalGroups.length,
      });
    }

    const [total, tests] = await prisma.$transaction([
      prisma.predefinedFunctionTest.count({ where }),
      prisma.predefinedFunctionTest.findMany({
        where,
        orderBy: [
          { systemGroup: "asc" },
          { systemType: "asc" },
          { function: "asc" },
          { category: "asc" },
        ],
        ...(hasPaging
          ? {
              skip: (page - 1) * pageSize,
              take: pageSize,
            }
          : {}),
        select: {
          id: true,
          category: true,
          systemGroup: true,
          systemType: true,
          systemPart: true,
          function: true,
          testExecution: true,
          acceptanceCriteria: true,
        },
      }),
    ]);

    return NextResponse.json({
      tests,
      total,
      page: hasPaging ? page : 1,
      pageSize: hasPaging ? pageSize : total,
    });
  } catch (error) {
    console.error("Error fetching predefined function tests:", error);
    return NextResponse.json({ error: "Kunne ikke hente testmaler" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) return authResult.error;

    // Only admins can create predefined tests
    if (authResult.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Kun administratorer kan opprette testmaler" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const category = body["category"];
    if (!isValidCategory(category)) {
      return NextResponse.json({ error: "Ugyldig kategori" }, { status: 400 });
    }

    const systemGroup = String(body["systemGroup"] ?? "").trim();
    const systemType = String(body["systemType"] ?? body["systemPart"] ?? "").trim();
    const functionName = String(body["function"] ?? "").trim();
    const testExecution = String(body["testExecution"] ?? "").trim();
    const acceptanceCriteria = String(body["acceptanceCriteria"] ?? "").trim();

    if (!systemType || !functionName || !testExecution || !acceptanceCriteria) {
      return NextResponse.json(
        { error: "Alle felt må fylles ut" },
        { status: 400 }
      );
    }

    const existing = await prisma.predefinedFunctionTest.findFirst({
      where: {
        category,
        systemGroup: systemGroup || null,
        systemType,
        function: functionName,
        testExecution,
        acceptanceCriteria,
        isActive: true,
      },
      select: {
        id: true,
        category: true,
        systemGroup: true,
        systemType: true,
        systemPart: true,
        function: true,
        testExecution: true,
        acceptanceCriteria: true,
      },
    });

    if (existing) {
      return NextResponse.json({ test: existing, skipped: true });
    }

    const created = await prisma.predefinedFunctionTest.create({
      data: {
        category,
        systemGroup: systemGroup || null,
        systemType,
        systemPart: systemType,
        function: functionName,
        testExecution,
        acceptanceCriteria,
        isActive: true,
        createdById: authResult.user.id,
      },
      select: {
        id: true,
        category: true,
        systemGroup: true,
        systemType: true,
        systemPart: true,
        function: true,
        testExecution: true,
        acceptanceCriteria: true,
      },
    });

    return NextResponse.json({ test: created });
  } catch (error) {
    console.error("Error creating predefined function test:", error);
    return NextResponse.json(
      { error: "Kunne ikke opprette testmal" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) return authResult.error;

    if (authResult.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Kun administratorer kan redigere testmaler" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const id = body["id"];
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "Mangler test-id" }, { status: 400 });
    }

    const existing = await prisma.predefinedFunctionTest.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Testmal ikke funnet" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    const category = body["category"];
    if (category !== undefined) {
      if (!isValidCategory(category)) {
        return NextResponse.json({ error: "Ugyldig kategori" }, { status: 400 });
      }
      data.category = category;
    }

    if (body["systemGroup"] !== undefined) {
      const value = String(body["systemGroup"] ?? "").trim();
      data.systemGroup = value || null;
    }

    if (body["systemType"] !== undefined || body["systemPart"] !== undefined) {
      const value = String(body["systemType"] ?? body["systemPart"] ?? "").trim();
      if (!value) {
        return NextResponse.json({ error: "Type kan ikke være tom" }, { status: 400 });
      }
      data.systemType = value;
      data.systemPart = value;
    }

    if (body["function"] !== undefined) {
      data.function = String(body["function"] ?? "").trim();
    }

    if (body["testExecution"] !== undefined) {
      data.testExecution = String(body["testExecution"] ?? "").trim();
    }

    if (body["acceptanceCriteria"] !== undefined) {
      data.acceptanceCriteria = String(body["acceptanceCriteria"] ?? "").trim();
    }

    const updated = await prisma.predefinedFunctionTest.update({
      where: { id },
      data,
      select: {
        id: true,
        category: true,
        systemGroup: true,
        systemType: true,
        systemPart: true,
        function: true,
        testExecution: true,
        acceptanceCriteria: true,
      },
    });

    return NextResponse.json({ test: updated });
  } catch (error) {
    console.error("Error updating predefined function test:", error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere testmal" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) return authResult.error;

    if (authResult.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Kun administratorer kan slette testmaler" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Mangler test-id" }, { status: 400 });
    }

    const existing = await prisma.predefinedFunctionTest.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Testmal ikke funnet" }, { status: 404 });
    }

    // Soft delete - mark as inactive
    await prisma.predefinedFunctionTest.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting predefined function test:", error);
    return NextResponse.json(
      { error: "Kunne ikke slette testmal" },
      { status: 500 }
    );
  }
}
