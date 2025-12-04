import prisma from "@/lib/db";
import { NextResponse } from "next/server";
import { Role, UserStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";

export async function GET() {
  const authResult = await requireAdmin();
  if (!authResult.success) {
    return authResult.error;
  }

  const pending = await prisma.user.findMany({
    where: { status: UserStatus.PENDING },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      company: true,
      title: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(pending);
}

export async function PATCH(req: Request) {
  const authResult = await requireAdmin();
  if (!authResult.success) {
    return authResult.error;
  }

  const body = await req.json();
  const { userId, status, role } = body || {};
  
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId mangler" }, { status: 400 });
  }

  if (role && !Object.values(Role).includes(role)) {
    return NextResponse.json({ error: "Ugyldig rolle" }, { status: 400 });
  }
  
  if (status && !Object.values(UserStatus).includes(status)) {
    return NextResponse.json({ error: "Ugyldig status" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
  }

  if (targetUser.id === authResult.user.id && status === UserStatus.SUSPENDED) {
    return NextResponse.json(
      { error: "Du kan ikke suspendere din egen konto" },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      status: status || undefined,
      role: role || undefined,
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  return NextResponse.json(updated);
}
