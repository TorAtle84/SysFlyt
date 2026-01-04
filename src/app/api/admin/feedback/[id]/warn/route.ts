import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.success) {
      return authResult.error;
    }

    const { id } = await params;
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json(
        { error: "Advarselstekst mangler" },
        { status: 400 }
      );
    }

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      select: { id: true, userId: true, category: true },
    });

    if (!feedback) {
      return NextResponse.json(
        { error: "Tilbakemelding ikke funnet" },
        { status: 404 }
      );
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        status: "REJECTED",
        warningMessage: message,
        warningSentAt: new Date(),
        assignedToId: authResult.user.id,
      },
    });

    await prisma.notification.create({
      data: {
        userId: feedback.userId,
        type: "FEEDBACK_WARNING",
        metadata: {
          message,
          feedbackId: feedback.id,
          category: feedback.category,
        },
      },
    });

    return NextResponse.json({ feedback: updated });
  } catch (error) {
    console.error("Error sending feedback warning:", error);
    return NextResponse.json(
      { error: "Kunne ikke sende advarsel" },
      { status: 500 }
    );
  }
}
