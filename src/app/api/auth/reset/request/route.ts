import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { sendResetEmail } from "@/lib/email";
import crypto from "crypto";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Ugyldig e-post" }, { status: 400 });

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Do not reveal existence
      return NextResponse.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset?token=${token}`;
    await sendResetEmail(email, resetUrl);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Kunne ikke sende e-post. Prøv igjen senere." }, { status: 500 });
  }
}
