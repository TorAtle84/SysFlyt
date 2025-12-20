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
        { error: "Ingen tilgang til å endre rekkefølge" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const rowId = body?.rowId;
    const direction = body?.direction;

    if (!rowId || (direction !== "up" && direction !== "down")) {
      return NextResponse.json(
        { error: "rowId og direction (up/down) er påkrevd" },
        { status: 400 }
      );
    }

    const current = await prisma.functionTestRow.findFirst({
      where: {
        id: String(rowId),
        functionTestId,
        functionTest: { projectId },
      },
      select: { id: true, sortOrder: true, category: true },
    });

    if (!current) {
      return NextResponse.json({ error: "Testpunkt ikke funnet" }, { status: 404 });
    }

    const neighbor = await prisma.functionTestRow.findFirst({
      where: {
        functionTestId,
        category: current.category,
        sortOrder:
          direction === "up"
            ? { lt: current.sortOrder }
            : { gt: current.sortOrder },
      },
      orderBy: [
        { sortOrder: direction === "up" ? "desc" : "asc" },
        { id: direction === "up" ? "desc" : "asc" },
      ],
      select: { id: true, sortOrder: true },
    });

    if (!neighbor) {
      return NextResponse.json({ success: true, changed: false });
    }

    await prisma.$transaction([
      prisma.functionTestRow.update({
        where: { id: current.id },
        data: { sortOrder: neighbor.sortOrder },
      }),
      prisma.functionTestRow.update({
        where: { id: neighbor.id },
        data: { sortOrder: current.sortOrder },
      }),
    ]);

    return NextResponse.json({ success: true, changed: true });
  } catch (error) {
    console.error("Error reordering function test rows:", error);
    return NextResponse.json(
      { error: "Kunne ikke endre rekkefølge" },
      { status: 500 }
    );
  }
}
