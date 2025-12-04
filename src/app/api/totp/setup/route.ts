import { NextResponse } from "next/server";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { requireAuth } from "@/lib/auth-helpers";
import prisma from "@/lib/db";

export async function POST() {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const user = await prisma.user.findUnique({
    where: { id: authResult.user.id },
    select: { email: true, totpEnabled: true, totpSecret: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
  }

  if (user.totpEnabled) {
    return NextResponse.json(
      { error: "Tofaktor-autentisering er allerede aktivert" },
      { status: 400 }
    );
  }

  const secret = authenticator.generateSecret();

  await prisma.user.update({
    where: { id: authResult.user.id },
    data: { totpSecret: secret },
  });

  const otpauth = authenticator.keyuri(user.email, "Sluttfase", secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  return NextResponse.json({
    secret,
    qrCode: qrCodeDataUrl,
    message: "Scan QR-koden med din authenticator-app",
  });
}

export async function GET() {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult.error;
  }

  const user = await prisma.user.findUnique({
    where: { id: authResult.user.id },
    select: { totpEnabled: true },
  });

  return NextResponse.json({
    totpEnabled: user?.totpEnabled ?? false,
  });
}
