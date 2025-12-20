import { NextRequest, NextResponse } from "next/server";
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

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) return authResult.error;

    const tests = await prisma.predefinedFunctionTest.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { systemPart: "asc" }, { function: "asc" }],
      select: {
        id: true,
        category: true,
        systemPart: true,
        function: true,
        testExecution: true,
        acceptanceCriteria: true,
      },
    });

    return NextResponse.json({ tests });
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

    const systemPart = String(body["systemPart"] ?? "").trim();
    const functionName = String(body["function"] ?? "").trim();
    const testExecution = String(body["testExecution"] ?? "").trim();
    const acceptanceCriteria = String(body["acceptanceCriteria"] ?? "").trim();

    if (!systemPart || !functionName || !testExecution || !acceptanceCriteria) {
      return NextResponse.json(
        { error: "Alle felt må fylles ut" },
        { status: 400 }
      );
    }

    const created = await prisma.predefinedFunctionTest.create({
      data: {
        category,
        systemPart,
        function: functionName,
        testExecution,
        acceptanceCriteria,
        isActive: true,
        createdById: authResult.user.id,
      },
      select: {
        id: true,
        category: true,
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

    if (body["systemPart"] !== undefined) {
      data.systemPart = String(body["systemPart"] ?? "").trim();
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

