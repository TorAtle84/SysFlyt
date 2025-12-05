import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const excludeProjectId = searchParams.get("excludeProject");

    if (!excludeProjectId) {
      return NextResponse.json({ error: "Prosjekt-ID er påkrevd" }, { status: 400 });
    }

    const requesterMembership = await prisma.projectMember.findFirst({
      where: {
        projectId: excludeProjectId,
        userId: authResult.user.id,
      },
    });

    const isAdmin = authResult.user.role === Role.ADMIN;
    const isProjectLeader = requesterMembership?.role === Role.PROJECT_LEADER;

    if (!isAdmin && !isProjectLeader) {
      return NextResponse.json(
        { error: "Kun admins og prosjektledere kan søke etter brukere" },
        { status: 403 }
      );
    }

    if (query.length < 2) {
      return NextResponse.json([]);
    }

    const existingMembers = await prisma.projectMember.findMany({
      where: { projectId: excludeProjectId },
      select: { userId: true },
    });
    const excludeUserIds = existingMembers.map((m) => m.userId);

    const users = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        id: {
          notIn: excludeUserIds,
        },
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { company: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
        title: true,
      },
      take: 10,
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
