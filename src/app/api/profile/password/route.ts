import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function checkRateLimit(userId: string): { allowed: boolean; remainingTime?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const remainingTime = Math.ceil((entry.resetTime - now) / 1000 / 60);
    return { allowed: false, remainingTime };
  }

  entry.count++;
  return { allowed: true };
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.success) {
      return authResult.error;
    }

    const rateLimit = checkRateLimit(authResult.user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `For mange forsøk. Prøv igjen om ${rateLimit.remainingTime} minutter.` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword, totpCode } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Alle felt må fylles ut" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "Nytt passord og bekreftelse stemmer ikke overens" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Passord må være minst 8 tegn" },
        { status: 400 }
      );
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return NextResponse.json(
        { error: "Passord må inneholde minst én stor bokstav, én liten bokstav, ett tall og ett spesialtegn" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: authResult.user.id },
      select: { 
        passwordHash: true,
        totpEnabled: true,
        totpSecret: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Bruker ikke funnet" },
        { status: 404 }
      );
    }

    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return NextResponse.json(
          { error: "TOTP_REQUIRED", requiresTotp: true },
          { status: 400 }
        );
      }

      const isValidTotp = authenticator.verify({ token: totpCode, secret: user.totpSecret });
      if (!isValidTotp) {
        return NextResponse.json(
          { error: "Ugyldig verifiseringskode" },
          { status: 400 }
        );
      }
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Nåværende passord er feil" },
        { status: 400 }
      );
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      return NextResponse.json(
        { error: "Nytt passord kan ikke være likt det nåværende passordet" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: authResult.user.id },
      data: { passwordHash: hashedPassword },
    });

    rateLimitMap.delete(authResult.user.id);

    console.log(`Password changed for user ${authResult.user.id} at ${new Date().toISOString()}`);

    return NextResponse.json({ message: "Passord oppdatert" });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
