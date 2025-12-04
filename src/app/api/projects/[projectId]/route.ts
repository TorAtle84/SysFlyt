import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess, requireProjectLeaderAccess, requireAdmin } from "@/lib/auth-helpers";
import { validateAndSanitizeProjectInput } from "@/lib/sanitize";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: { include: { user: true } },
        documents: true,
        massList: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectLeaderAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const body = await request.json();
    const validation = validateAndSanitizeProjectInput(body);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: { 
        name: validation.name,
        description: validation.description,
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.success) {
      return authResult.error;
    }

    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
    }

    await prisma.project.delete({
      where: { id: projectId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
