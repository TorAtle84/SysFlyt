import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectLeaderAccess } from "@/lib/auth-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const authResult = await requireProjectLeaderAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
    }

    if (project.status !== "ARCHIVED") {
      return NextResponse.json({ error: "Prosjektet er ikke arkivert" }, { status: 400 });
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "ACTIVE",
        archivedAt: null,
      },
    });

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error("Error restoring project:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
