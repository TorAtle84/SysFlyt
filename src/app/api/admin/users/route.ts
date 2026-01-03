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

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (!authResult.success) {
    return authResult.error;
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const all = searchParams.get("all") === "true";

  // Build where clause
  const where: Record<string, unknown> = {};

  if (!all && !statusFilter) {
    // Default: return only pending (backwards compatible)
    where.status = UserStatus.PENDING;
  } else if (statusFilter && Object.values(UserStatus).includes(statusFilter as UserStatus)) {
    where.status = statusFilter;
  }
  // If all=true and no status, return all users

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      company: true,
      title: true,
      discipline: true,
      role: true,
      status: true,
      createdAt: true,
      emailVerified: true,
      totpEnabled: true,
      appAccess: {
        select: {
          application: { select: { code: true, name: true } },
          status: true,
        },
      },
    },
  });

  return NextResponse.json(users);
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

  // Update App Access if provided
  // Expects apps to be an array of AppCode strings ['SYSLINK', 'FLYTLINK']
  // If provided, it sets these to APPROVED and removes access to others
  if (body.apps && Array.isArray(body.apps)) {
    const allApps = await prisma.application.findMany();
    const selectedCodes = new Set(body.apps);

    for (const app of allApps) {
      if (selectedCodes.has(app.code)) {
        // Approve/Grant
        await prisma.userAppAccess.upsert({
          where: { userId_applicationId: { userId, applicationId: app.id } },
          create: {
            userId,
            applicationId: app.id,
            status: "APPROVED",
            approvedById: authResult.user.id,
            approvedAt: new Date(),
          },
          update: {
            status: "APPROVED",
            approvedById: authResult.user.id,
            approvedAt: new Date(),
          },
        });
      } else {
        // Revoke/Delete
        await prisma.userAppAccess.deleteMany({
          where: { userId, applicationId: app.id },
        });
      }
    }
  }

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

/**
 * PUT - Full user update (all fields except email)
 */
export async function PUT(req: NextRequest) {
  const authResult = await requireAdmin();
  if (!authResult.success) {
    return authResult.error;
  }

  const body = await req.json();
  const { userId, firstName, lastName, phone, company, title, discipline, role, status, apps } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId mangler" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
  }

  // Prevent self-suspension/deletion
  if (targetUser.id === authResult.user.id && status === UserStatus.SUSPENDED) {
    return NextResponse.json(
      { error: "Du kan ikke suspendere din egen konto" },
      { status: 400 }
    );
  }

  // Build update data
  const updateData: Record<string, unknown> = {};

  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (phone !== undefined) updateData.phone = phone;
  if (company !== undefined) updateData.company = company;
  if (title !== undefined) updateData.title = title;
  if (discipline !== undefined) updateData.discipline = discipline;

  if (role && Object.values(Role).includes(role)) {
    updateData.role = role;
  }

  if (status && Object.values(UserStatus).includes(status)) {
    updateData.status = status;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      company: true,
      title: true,
      discipline: true,
      role: true,
      status: true,
    },
  });

  // Update App Access if provided
  if (apps && Array.isArray(apps)) {
    const allApps = await prisma.application.findMany();
    const selectedCodes = new Set(apps);

    for (const app of allApps) {
      if (selectedCodes.has(app.code)) {
        await prisma.userAppAccess.upsert({
          where: { userId_applicationId: { userId, applicationId: app.id } },
          create: {
            userId,
            applicationId: app.id,
            status: "APPROVED",
            approvedById: authResult.user.id,
            approvedAt: new Date(),
          },
          update: {
            status: "APPROVED",
            approvedById: authResult.user.id,
            approvedAt: new Date(),
          },
        });
      } else {
        await prisma.userAppAccess.deleteMany({
          where: { userId, applicationId: app.id },
        });
      }
    }
  }

  return NextResponse.json(updated);
}

/**
 * DELETE - Remove a user permanently
 */
export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin();
  if (!authResult.success) {
    return authResult.error;
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId mangler" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
  }

  // Prevent self-deletion
  if (targetUser.id === authResult.user.id) {
    return NextResponse.json(
      { error: "Du kan ikke slette din egen konto" },
      { status: 400 }
    );
  }

  // Delete the user (cascades to related records)
  await prisma.user.delete({
    where: { id: userId },
  });

  return NextResponse.json({ success: true, message: "Bruker slettet" });
}
