import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { validateAndSanitizeProfileInput } from "@/lib/sanitize";

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const user = await prisma.user.findUnique({
      where: { id: authResult.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        company: true,
        title: true,
        discipline: true,
        reportsAsProjectLeaderEnabled: true,
        reportsAsMemberEnabled: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const body = await request.json();
    const validation = validateAndSanitizeProfileInput(body);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: authResult.user.id },
      data: {
        ...(validation.firstName !== undefined && { firstName: validation.firstName }),
        ...(validation.lastName !== undefined && { lastName: validation.lastName }),
        ...(validation.phone !== undefined && { phone: validation.phone }),
        ...(validation.company !== undefined && { company: validation.company }),
        ...(validation.title !== undefined && { title: validation.title }),
        ...(validation.discipline !== undefined && { discipline: validation.discipline }),
        ...(validation.reportsAsProjectLeaderEnabled !== undefined && {
          reportsAsProjectLeaderEnabled: validation.reportsAsProjectLeaderEnabled,
        }),
        ...(validation.reportsAsMemberEnabled !== undefined && {
          reportsAsMemberEnabled: validation.reportsAsMemberEnabled,
        }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        company: true,
        title: true,
        discipline: true,
        reportsAsProjectLeaderEnabled: true,
        reportsAsMemberEnabled: true,
        role: true,
        status: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
