import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const tags = await prisma.systemTag.findMany({
      orderBy: { code: "asc" },
    });

    return NextResponse.json(tags);
  } catch (error) {
    console.error("Error fetching system tags:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
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

    if (authResult.user.role !== Role.ADMIN && authResult.user.role !== Role.PROJECT_LEADER) {
      return NextResponse.json(
        { error: "Kun admins og prosjektledere kan opprette systemkoder" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { code, description } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Systemkode er påkrevd" },
        { status: 400 }
      );
    }

    const existingTag = await prisma.systemTag.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (existingTag) {
      return NextResponse.json(
        { error: "Systemkoden eksisterer allerede" },
        { status: 409 }
      );
    }

    const tag = await prisma.systemTag.create({
      data: {
        code: code.toUpperCase(),
        description: description || null,
      },
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error("Error creating system tag:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
