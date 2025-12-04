import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";

const TOTP_DEADLINE_DAYS = 14;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, totpCode } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-post og passord er påkrevd" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordHash: true,
        role: true,
        status: true,
        totpEnabled: true,
        totpSecret: true,
        totpFailedAttempts: true,
        totpLockedUntil: true,
        totpDeadline: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Ugyldig e-post eller passord" },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Ugyldig e-post eller passord" },
        { status: 401 }
      );
    }

    if (user.status === "SUSPENDED") {
      return NextResponse.json(
        { error: "Kontoen din er suspendert. Kontakt administrator." },
        { status: 403 }
      );
    }

    if (user.status === "PENDING") {
      return NextResponse.json(
        { error: "Kontoen din venter på godkjenning fra administrator." },
        { status: 403 }
      );
    }

    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Kontoen din er ikke aktiv." },
        { status: 403 }
      );
    }

    const totpDeadline = user.totpDeadline || new Date(user.createdAt.getTime() + TOTP_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((totpDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (!user.totpEnabled && daysRemaining < 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "SUSPENDED" },
      });
      return NextResponse.json(
        { error: "Kontoen din er deaktivert fordi tofaktor-autentisering ikke ble aktivert innen fristen. Kontakt administrator." },
        { status: 403 }
      );
    }

    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return NextResponse.json(
          { requiresTotp: true, message: "TOTP_REQUIRED" },
          { status: 200 }
        );
      }

      if (user.totpLockedUntil && user.totpLockedUntil > new Date()) {
        const minutesLeft = Math.ceil((user.totpLockedUntil.getTime() - Date.now()) / 60000);
        return NextResponse.json(
          { error: `For mange feilede forsøk. Prøv igjen om ${minutesLeft} minutter.` },
          { status: 429 }
        );
      }

      const isValidTotp = authenticator.verify({
        token: totpCode,
        secret: user.totpSecret,
      });

      if (!isValidTotp) {
        const newFailedAttempts = user.totpFailedAttempts + 1;
        const lockoutTime = newFailedAttempts >= 5 
          ? new Date(Date.now() + 15 * 60 * 1000) 
          : null;

        await prisma.user.update({
          where: { id: user.id },
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
          { status: 401 }
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          totpFailedAttempts: 0,
          totpLockedUntil: null,
        },
      });
    }

    const totpWarning = !user.totpEnabled && daysRemaining > 0 && daysRemaining <= TOTP_DEADLINE_DAYS
      ? {
          daysRemaining,
          deadline: totpDeadline.toISOString(),
          message: daysRemaining === 1
            ? "Du har 1 dag igjen til å aktivere tofaktor-autentisering"
            : `Du har ${daysRemaining} dager igjen til å aktivere tofaktor-autentisering`,
        }
      : null;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        status: user.status,
      },
      totpWarning,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Intern serverfeil" },
      { status: 500 }
    );
  }
}
