import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAuth } from "@/lib/auth-helpers";
import { validateAndSanitizeProjectInput } from "@/lib/sanitize";

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const user = authResult.user;

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { createdById: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      include: {
        members: { include: { user: true } },
        documents: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const user = authResult.user;

    if (user.role !== "ADMIN" && user.role !== "PROJECT_LEADER") {
      return NextResponse.json({ error: "Kun admins og prosjektledere kan opprette prosjekter" }, { status: 403 });
    }

    const body = await request.json();
    const validation = validateAndSanitizeProjectInput(body);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name: validation.name,
        description: validation.description,
        createdById: user.id,
        members: {
          create: {
            userId: user.id,
            role: Role.PROJECT_LEADER,
          },
        },
      },
      include: {
        members: { include: { user: true } },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
