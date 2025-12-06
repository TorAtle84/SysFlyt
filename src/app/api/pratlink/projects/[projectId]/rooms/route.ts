import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess, requireProjectLeaderAccess } from "@/lib/auth-helpers";
import { sanitizeString } from "@/lib/sanitize";

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

    const rooms = await prisma.chatRoom.findMany({
      where: { projectId, isActive: true },
      include: {
        _count: { select: { messages: true } },
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error("Error fetching chat rooms:", error);
    return NextResponse.json(
      { error: "Kunne ikke hente rom" },
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
    const { name, type, description } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Romnavn er påkrevd" },
        { status: 400 }
      );
    }

    const sanitizedName = sanitizeString(name, 100);
    const sanitizedDescription = description
      ? sanitizeString(description, 500)
      : null;

    const roomType = type === "PROJECT" ? "PROJECT" : "TOPIC";

    if (roomType === "PROJECT") {
      const existingProjectRoom = await prisma.chatRoom.findFirst({
        where: { projectId, type: "PROJECT", isActive: true },
      });
      if (existingProjectRoom) {
        return NextResponse.json(
          { error: "Prosjektet har allerede et hovedrom" },
          { status: 400 }
        );
      }
    }

    const room = await prisma.chatRoom.create({
      data: {
        projectId,
        name: sanitizedName,
        description: sanitizedDescription,
        type: roomType,
        createdById: authResult.user.id,
      },
      include: {
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    console.error("Error creating chat room:", error);
    return NextResponse.json(
      { error: "Kunne ikke opprette rom" },
      { status: 500 }
    );
  }
}
