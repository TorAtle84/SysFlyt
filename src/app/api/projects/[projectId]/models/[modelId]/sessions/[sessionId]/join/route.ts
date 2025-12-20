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
      select: { id: true, participants: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Sesjon ikke funnet" }, { status: 404 });
    }

    const existing = Array.isArray(session.participants) ? (session.participants as any[]) : [];
    const participants = existing.map(String);

    const MAX_PARTICIPANTS = 10;

    if (!participants.includes(authResult.user.id) && participants.length >= MAX_PARTICIPANTS) {
      return NextResponse.json({ error: "Sesjon full" }, { status: 409 });
    }

    if (!participants.includes(authResult.user.id)) {
      participants.push(authResult.user.id);
    }

    const updated = await prisma.bimModelSession.update({
      where: { id: sessionId },
      data: { participants },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error joining model session:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}
