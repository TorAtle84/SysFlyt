import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { Role, UserStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-helpers";
import { sendAccountActivatedEmail } from "@/lib/email";

const TOTP_DEADLINE_DAYS = 14;

function buildBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return process.env.NEXTAUTH_URL || `${protocol}://${host}`;
}

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
      emailVerified: true,
    },
  });

  return NextResponse.json(pending);
}

export async function PATCH(req: NextRequest) {
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

  const updateData: Record<string, unknown> = {};

  if (status) {
    updateData.status = status;
  }

  if (role) {
    updateData.role = role;
  }

  const isActivating = status === UserStatus.ACTIVE && targetUser.status === UserStatus.PENDING;

  if (isActivating) {
    const totpDeadline = new Date();
    totpDeadline.setDate(totpDeadline.getDate() + TOTP_DEADLINE_DAYS);
    updateData.totpDeadline = totpDeadline;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      firstName: true,
      email: true,
      role: true,
      status: true,
    },
  });

  // Send activation email if user was activated
  if (isActivating) {
    const baseUrl = buildBaseUrl(req);
    const loginUrl = `${baseUrl}/syslink/login`;

    try {
      await sendAccountActivatedEmail(updated.email, updated.firstName, loginUrl);
    } catch (emailError) {
      console.error("Failed to send activation email:", emailError);
      // Continue even if email fails
    }
  }

  return NextResponse.json(updated);
}

