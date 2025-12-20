import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, canAnnotateDocuments } from "@/lib/auth-helpers";

/**
 * DELETE /api/documents/[documentId]/system-annotations/[annotationId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string; annotationId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { documentId, annotationId } = await params;

    const annotation = await prisma.systemAnnotation.findUnique({
      where: { id: annotationId, documentId },
      include: { document: true },
    });

    if (!annotation) {
      return NextResponse.json(
        { error: "Annotasjon ikke funnet" },
        { status: 404 }
      );
    }

    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: annotation.document.projectId,
        userId: authResult.user.id,
      },
    });

    if (!membership && authResult.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
    }

    if (!canAnnotateDocuments(authResult.user.role, membership?.role)) {
      return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
    }

    await prisma.systemAnnotation.delete({
      where: { id: annotationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting system annotation:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
