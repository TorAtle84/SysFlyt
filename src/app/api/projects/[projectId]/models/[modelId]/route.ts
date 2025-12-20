import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess, requireProjectLeaderAccess } from "@/lib/auth-helpers";
import { deleteModelFiles } from "@/lib/bim/bim-file-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; modelId: string }> }
) {
  try {
    const { projectId, modelId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const model = await prisma.bimModel.findFirst({
      where: { id: modelId, projectId },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { components: true, sessions: true } },
      },
    });

    if (!model) {
      return NextResponse.json({ error: "Modell ikke funnet" }, { status: 404 });
    }

    return NextResponse.json(model);
  } catch (error) {
    console.error("Error fetching model:", error);
    return NextResponse.json({ error: "Intern serverfeil" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; modelId: string }> }
) {
  try {
    const { projectId, modelId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const existing = await prisma.bimModel.findFirst({
      where: { id: modelId, projectId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Modell ikke funnet" }, { status: 404 });
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : null;

    if (!name) {
      return NextResponse.json({ error: "Navn er påkrevd" }, { status: 400 });
    }

    const updated = await prisma.bimModel.update({
      where: { id: modelId },
      data: { name },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating model:", error);
    return NextResponse.json({ error: "Kunne ikke oppdatere modell" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; modelId: string }> }
) {
  try {
    const { projectId, modelId } = await params;

    const authResult = await requireProjectLeaderAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const existing = await prisma.bimModel.findFirst({
      where: { id: modelId, projectId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Modell ikke funnet" }, { status: 404 });
    }

    await prisma.bimModel.delete({ where: { id: modelId } });
    await deleteModelFiles({ projectId, modelId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting model:", error);
    return NextResponse.json({ error: "Kunne ikke slette modell" }, { status: 500 });
  }
}

