import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; modelId: string; sessionId: string }> }
) {
  try {
    const { projectId, modelId, sessionId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const session = await prisma.bimModelSession.findFirst({
      where: { id: sessionId, modelId, isActive: true, model: { projectId } },
      include: {
        hostUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Sesjon ikke funnet" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("Error fetching model session:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; modelId: string; sessionId: string }> }
) {
  try {
    const { projectId, modelId, sessionId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const session = await prisma.bimModelSession.findFirst({
      where: { id: sessionId, modelId, isActive: true, model: { projectId } },
      select: { id: true, hostUserId: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Sesjon ikke funnet" }, { status: 404 });
    }

    if (session.hostUserId !== authResult.user.id) {
      return NextResponse.json({ error: "Kun vert kan oppdatere sesjonen" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const cameraPosition = body?.cameraPosition ?? null;
    const state = body?.state ?? null;
    const selectedComponentId = body?.selectedComponentId ?? null;
    const isActive = body?.isActive;

    const updated = await prisma.bimModelSession.update({
      where: { id: sessionId },
      data: {
        cameraPosition,
        state,
        selectedComponentId,
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      },
      include: {
        hostUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating model session:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

