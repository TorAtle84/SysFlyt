import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, canAnnotateDocuments } from "@/lib/auth-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { documentId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { project: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Dokument ikke funnet" }, { status: 404 });
    }

    const membership = await prisma.projectMember.findFirst({
      where: {
        projectId: document.projectId,
        userId: authResult.user.id,
      },
    });

    if (!membership && authResult.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Ingen tilgang til dette prosjektet" }, { status: 403 });
    }

    if (!canAnnotateDocuments(authResult.user.role, membership?.role)) {
      return NextResponse.json({ error: "Ingen tilgang til å opprette annoteringer" }, { status: 403 });
    }

    const body = await request.json();
    const { x, y, pageNumber, content } = body;

    if (typeof x !== "number" || typeof y !== "number" || typeof pageNumber !== "number") {
      return NextResponse.json({ error: "Mangler posisjon eller sidenummer" }, { status: 400 });
    }

    const annotation = await prisma.annotation.create({
      data: {
        documentId,
        authorId: authResult.user.id,
        x,
        y,
        status: "OPEN",
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (content && typeof content === "string" && content.trim()) {
      await prisma.comment.create({
        data: {
          content: content.trim(),
          annotationId: annotation.id,
          authorId: authResult.user.id,
          projectId: document.projectId,
        },
      });
    }

    const fullAnnotation = await prisma.annotation.findUnique({
      where: { id: annotation.id },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({
      ...fullAnnotation,
      pageNumber,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating annotation:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const body = await request.json();
    const { annotationId, status } = body;

    if (!annotationId || !status) {
      return NextResponse.json({ error: "Mangler annotasjon-ID eller status" }, { status: 400 });
    }

    const validStatuses = ["OPEN", "CLOSED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Ugyldig status" }, { status: 400 });
    }

    const annotation = await prisma.annotation.findUnique({
      where: { id: annotationId },
      include: { document: true },
    });

    if (!annotation) {
      return NextResponse.json({ error: "Annotasjon ikke funnet" }, { status: 404 });
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
      return NextResponse.json({ error: "Ingen tilgang til å oppdatere annotasjoner" }, { status: 403 });
    }

    const updatedAnnotation = await prisma.annotation.update({
      where: { id: annotationId },
      data: { status },
    });

    return NextResponse.json(updatedAnnotation);
  } catch (error) {
    console.error("Error updating annotation:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
