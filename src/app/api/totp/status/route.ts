import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";

const TOTP_DEADLINE_DAYS = 14;

export async function GET() {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const user = await prisma.user.findUnique({
      where: { id: authResult.user.id },
      select: {
        totpEnabled: true,
        totpDeadline: true,
        createdAt: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
    }

    if (user.totpEnabled) {
      return NextResponse.json({ totpEnabled: true, warning: null });
    }

    if (user.role === "ADMIN") {
      return NextResponse.json({ totpEnabled: false, warning: null });
    }

    const totpDeadline = user.totpDeadline || new Date(user.createdAt.getTime() + TOTP_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((totpDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    if (now >= totpDeadline) {
      return NextResponse.json({
        totpEnabled: false,
        warning: {
          daysRemaining: 0,
          deadline: totpDeadline.toISOString(),
          expired: true,
          message: "Fristen for å aktivere tofaktor-autentisering har utløpt",
        },
      });
    }

    return NextResponse.json({
      totpEnabled: false,
      warning: {
        daysRemaining,
        deadline: totpDeadline.toISOString(),
        expired: false,
        message: daysRemaining === 1
          ? "Du har 1 dag igjen til å aktivere tofaktor-autentisering"
          : `Du har ${daysRemaining} dager igjen til å aktivere tofaktor-autentisering`,
      },
    });
  } catch (error) {
    console.error("Error getting TOTP status:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
