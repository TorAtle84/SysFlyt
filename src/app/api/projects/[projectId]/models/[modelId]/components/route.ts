import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; modelId: string }> }
) {
  try {
    const { projectId, modelId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || null;
    const systemsParam = searchParams.get("systems");
    const limitParam = searchParams.get("limit");

    const systems = systemsParam
      ? systemsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const take = Math.min(Math.max(Number(limitParam) || 1000, 1), 5000);

    const where: any = { modelId };

    if (systems.length > 0) {
      where.systemCode = { in: systems };
    }

    if (q) {
      where.OR = [
        { fullTag: { contains: q, mode: "insensitive" } },
        { componentTag: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { ifcGuid: { contains: q, mode: "insensitive" } },
      ];
    }

    const components = await prisma.bimModelComponent.findMany({
      where,
      orderBy: [{ systemCode: "asc" }, { componentTag: "asc" }],
      take,
    });

    return NextResponse.json(components);
  } catch (error) {
    console.error("Error fetching model components:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

