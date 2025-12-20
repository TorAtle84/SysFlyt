import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; modelId: string }> }
) {
  try {
    const { projectId, modelId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const sessions = await prisma.bimModelSession.findMany({
      where: { modelId, isActive: true, model: { projectId } },
      orderBy: { updatedAt: "desc" },
      include: {
        hostUser: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 25,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Error fetching model sessions:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; modelId: string }> }
) {
  try {
    const { projectId, modelId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const model = await prisma.bimModel.findFirst({
      where: { id: modelId, projectId },
      select: { id: true, status: true },
    });

    if (!model) {
      return NextResponse.json({ error: "Modell ikke funnet" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const cameraPosition = body?.cameraPosition ?? null;
    const state = body?.state ?? null;
    const selectedComponentId = body?.selectedComponentId ?? null;

    const session = await prisma.bimModelSession.create({
      data: {
        modelId,
        hostUserId: authResult.user.id,
        cameraPosition,
        selectedComponentId,
        participants: [authResult.user.id],
        state,
        isActive: true,
      },
      include: {
        hostUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Error creating model session:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

