import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { FeedbackPriority, FeedbackStatus } from "@prisma/client";

export async function PATCH(
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
    const { status, priority, assignedToId } = body || {};

    const data: Record<string, unknown> = {};

    if (status) {
      if (!Object.values(FeedbackStatus).includes(status as FeedbackStatus)) {
        return NextResponse.json({ error: "Ugyldig status" }, { status: 400 });
      }
      data.status = status;
    }

    if (priority) {
      if (!Object.values(FeedbackPriority).includes(priority as FeedbackPriority)) {
        return NextResponse.json({ error: "Ugyldig prioritet" }, { status: 400 });
      }
      data.priority = priority;
    }

    if (assignedToId !== undefined) {
      if (assignedToId === null || assignedToId === "") {
        data.assignedToId = null;
      } else {
        const assignee = await prisma.user.findUnique({
          where: { id: assignedToId },
          select: { id: true },
        });
        if (!assignee) {
          return NextResponse.json({ error: "Ugyldig ansvarlig" }, { status: 400 });
        }
        data.assignedToId = assignedToId;
      }
    }

    const feedback = await prisma.feedback.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Error updating feedback:", error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere tilbakemelding" },
      { status: 500 }
    );
  }
}
