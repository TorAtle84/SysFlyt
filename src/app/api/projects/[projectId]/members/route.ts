import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectLeaderAccess, requireProjectAccess } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";

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

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true,
            title: true,
          },
        },
      },
    });

    return NextResponse.json(members);
  } catch (error) {
    console.error("Error fetching members:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const { userId, role } = body;

    if (!userId) {
      return NextResponse.json({ error: "Bruker-ID er påkrevd" }, { status: 400 });
    }

    const validRoles: Role[] = ["PROJECT_LEADER", "USER", "READER"];
    const memberRole = validRoles.includes(role) ? role : "USER";

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json({ error: "Bruker er ikke aktiv" }, { status: 400 });
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json({ error: "Bruker er allerede medlem" }, { status: 400 });
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId,
        userId,
        role: memberRole,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            company: true,
            title: true,
          },
        },
      },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error("Error adding member:", error);
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
    const { projectId } = await params;

    const authResult = await requireProjectLeaderAccess(projectId);
    if (!authResult.success) {
      return authResult.error;
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Bruker-ID er påkrevd" }, { status: 400 });
    }

    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Medlem ikke funnet" }, { status: 404 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (project?.createdById === userId) {
      return NextResponse.json({ error: "Kan ikke fjerne prosjektoppretteren" }, { status: 400 });
    }

    await prisma.projectMember.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
