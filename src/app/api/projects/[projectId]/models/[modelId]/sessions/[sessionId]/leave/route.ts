import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function POST(
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
      select: { id: true, hostUserId: true, participants: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Sesjon ikke funnet" }, { status: 404 });
    }

    const existing = Array.isArray(session.participants) ? (session.participants as any[]) : [];
    const participants = existing.map(String).filter((id) => id !== authResult.user.id);

    const isHost = session.hostUserId === authResult.user.id;

    const updated = await prisma.bimModelSession.update({
      where: { id: sessionId },
      data: {
        participants,
        ...(isHost ? { isActive: false } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error leaving model session:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

