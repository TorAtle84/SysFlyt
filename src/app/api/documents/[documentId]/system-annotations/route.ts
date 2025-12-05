import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth, canAnnotateDocuments } from "@/lib/auth-helpers";
import { Point } from "@/lib/geometry-utils";

export async function GET(
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
      select: { projectId: true },
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
      return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
    }

    const annotations = await prisma.systemAnnotation.findMany({
      where: { documentId },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
        comments: {
          include: {
            author: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(annotations);
  } catch (error) {
    console.error("Error fetching system annotations:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

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
      select: { projectId: true },
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
      return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
    }

    if (!canAnnotateDocuments(authResult.user.role, membership?.role)) {
      return NextResponse.json({ error: "Ingen tilgang til å opprette annoteringer" }, { status: 403 });
    }

    const body = await request.json();
    const { type, systemCode, content, pageNumber, color, points, x, y, width, height } = body;

    if (typeof pageNumber !== "number") {
      return NextResponse.json({ error: "Sidenummer er påkrevd" }, { status: 400 });
    }

    const annotation = await prisma.systemAnnotation.create({
      data: {
        documentId,
        type: type || "SYSTEM",
        systemCode: systemCode || null,
        content: content || null,
        pageNumber,
        color: color || "#3B82F6",
        points: points as Point[] | undefined,
        x: x ?? null,
        y: y ?? null,
        width: width ?? null,
        height: height ?? null,
        createdById: authResult.user.id,
      },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
        comments: true,
      },
    });

    return NextResponse.json(annotation, { status: 201 });
  } catch (error) {
    console.error("Error creating system annotation:", error);
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
    const { annotationId, systemCode, content, color, points } = body;

    if (!annotationId) {
      return NextResponse.json({ error: "annotationId er påkrevd" }, { status: 400 });
    }

    const annotation = await prisma.systemAnnotation.findUnique({
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
      return NextResponse.json({ error: "Ingen tilgang" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (systemCode !== undefined) updateData.systemCode = systemCode;
    if (content !== undefined) updateData.content = content;
    if (color !== undefined) updateData.color = color;
    if (points !== undefined) updateData.points = points;

    const updated = await prisma.systemAnnotation.update({
      where: { id: annotationId },
      data: updateData,
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
        comments: {
          include: {
            author: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating system annotation:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { searchParams } = new URL(request.url);
    const annotationId = searchParams.get("id");

    if (!annotationId) {
      return NextResponse.json({ error: "Mangler annotasjon-ID" }, { status: 400 });
    }

    const annotation = await prisma.systemAnnotation.findUnique({
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
