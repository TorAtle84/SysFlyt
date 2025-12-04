import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Role, UserStatus } from "@prisma/client";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || user.role !== Role.ADMIN) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { userId, status, role } = body || {};
  if (!userId) return NextResponse.json({ error: "userId mangler" }, { status: 400 });

  if (role && !Object.values(Role).includes(role)) {
    return NextResponse.json({ error: "Ugyldig rolle" }, { status: 400 });
  }
  if (status && !Object.values(UserStatus).includes(status)) {
    return NextResponse.json({ error: "Ugyldig status" }, { status: 400 });
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
