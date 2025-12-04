import { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { requireAuth } from "@/lib/auth-helpers";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const body = await request.json();
  const { code } = body;

  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { error: "Verifiseringskode er påkrevd" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: authResult.user.id },
    select: { 
      totpSecret: true, 
      totpEnabled: true,
      totpFailedAttempts: true,
      totpLockedUntil: true,
    },
  });

  if (!user || !user.totpEnabled || !user.totpSecret) {
    return NextResponse.json(
      { error: "Tofaktor-autentisering er ikke aktivert" },
      { status: 400 }
    );
  }

  if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.totpLockedUntil.getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `For mange feilede forsøk. Prøv igjen om ${minutesLeft} minutter.` },
      { status: 429 }
    );
  }

  const isValid = authenticator.verify({
    token: code,
    secret: user.totpSecret,
  });

  if (!isValid) {
    const newFailedAttempts = user.totpFailedAttempts + 1;
    const lockoutTime = newFailedAttempts >= 5 
      ? new Date(Date.now() + 15 * 60 * 1000) 
      : null;

    await prisma.user.update({
      where: { id: authResult.user.id },
      data: {
        totpFailedAttempts: newFailedAttempts,
        totpLockedUntil: lockoutTime,
      },
    });

    if (lockoutTime) {
      return NextResponse.json(
        { error: "For mange feilede forsøk. Kontoen er låst i 15 minutter." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Ugyldig verifiseringskode" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: authResult.user.id },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Tofaktor-autentisering er nå deaktivert",
  });
}
