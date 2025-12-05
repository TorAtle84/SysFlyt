import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess, requireProjectLeaderAccess } from "@/lib/auth-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const { projectId, documentId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const document = await prisma.document.findUnique({
      where: { id: documentId, projectId },
      include: {
        tags: { include: { systemTag: true } },
        components: {
          orderBy: [{ system: "asc" }, { code: "asc" }],
        },
        annotations: {
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            comments: {
              include: {
                author: { select: { firstName: true, lastName: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        systemAnnotations: {
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
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }

    return NextResponse.json(document);
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const { projectId, documentId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const existingDoc = await prisma.document.findUnique({
      where: { id: documentId, projectId },
    });

    if (!existingDoc) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, systemTags, approvedDeviations, type } = body;

    const updateData: Record<string, unknown> = {};

    if (title !== undefined) {
      updateData.title = title;
    }

    if (systemTags !== undefined) {
      updateData.systemTags = systemTags;
    }

    if (approvedDeviations !== undefined) {
      updateData.approvedDeviations = approvedDeviations;
    }

    if (type !== undefined) {
      updateData.type = type;
    }

    const document = await prisma.document.update({
      where: { id: documentId },
      data: updateData,
      include: {
        tags: { include: { systemTag: true } },
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    console.error("Error updating document:", error);
    return NextResponse.json(
      { error: "Kunne ikke oppdatere dokument" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const { projectId, documentId } = await params;

    const authResult = await requireProjectLeaderAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const existingDoc = await prisma.document.findUnique({
      where: { id: documentId, projectId },
    });

    if (!existingDoc) {
      return NextResponse.json(
        { error: "Dokument ikke funnet" },
        { status: 404 }
      );
    }

    await prisma.document.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Kunne ikke slette dokument" },
      { status: 500 }
    );
  }
}
