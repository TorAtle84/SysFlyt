import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getUserGeminiKey } from "@/lib/flytlink/gemini-analysis";
import { generateFeedbackActionPlan } from "@/lib/feedback/ai";

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
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!feedback) {
      return NextResponse.json(
        { error: "Tilbakemelding ikke funnet" },
        { status: 404 }
      );
    }

    const apiKey = await getUserGeminiKey(authResult.user.id);
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API-nøkkel mangler. Legg den inn i profilinnstillinger." },
        { status: 400 }
      );
    }

    const { plan, raw } = await generateFeedbackActionPlan(apiKey, {
      category: feedback.category,
      priority: feedback.priority,
      status: feedback.status,
      message: feedback.message,
      reporterName: `${feedback.user.firstName} ${feedback.user.lastName}`.trim(),
      reporterEmail: feedback.user.email,
      attachmentCount: Array.isArray(feedback.attachments) ? feedback.attachments.length : 0,
      createdAt: feedback.createdAt.toISOString(),
    });

    return NextResponse.json({ plan, raw });
  } catch (error) {
    console.error("Error generating feedback action plan:", error);
    return NextResponse.json(
      { error: "Kunne ikke generere tiltaksplan" },
      { status: 500 }
    );
  }
}
