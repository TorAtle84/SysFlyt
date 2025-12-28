import { Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { adminEmails, titleCase } from "@/lib/utils";
import { sendEmailVerificationEmail } from "@/lib/email";
import { randomBytes } from "crypto";

const TOTP_DEADLINE_DAYS = 14;
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

function buildBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return process.env.NEXTAUTH_URL || `${protocol}://${host}`;
}

const registerSchema = z.object({
  firstName: z.string().min(1, "Fornavn er påkrevd"),
  lastName: z.string().min(1, "Etternavn er påkrevd"),
  email: z.string().email("Ugyldig e-post"),
  phone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  discipline: z.string().optional(),
  other: z.string().optional(),
  password: z.string().min(8, "Passord må ha minst 8 tegn"),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = registerSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Bruker finnes allerede" }, { status: 400 });
    }

    const isAdmin = adminEmails.includes(data.email.toLowerCase());
    const role = isAdmin ? Role.ADMIN : Role.READER;
    const status = isAdmin ? UserStatus.ACTIVE : UserStatus.PENDING;

    const passwordHash = await bcrypt.hash(data.password, 10);

    const totpDeadline = new Date();
    totpDeadline.setDate(totpDeadline.getDate() + TOTP_DEADLINE_DAYS);

    const user = await prisma.user.create({
      data: {
        firstName: titleCase(data.firstName),
        lastName: titleCase(data.lastName),
        email: data.email.toLowerCase(),
        phone: data.phone,
        company: data.company,
        title: data.title,
        discipline: data.discipline,
        other: data.other,
        passwordHash,
        role,
        status,
        totpDeadline: isAdmin ? totpDeadline : null,
        // Admins are auto-verified
        emailVerified: isAdmin,
        emailVerifiedAt: isAdmin ? new Date() : null,
      },
    });

    // If not admin, send verification email
    if (!isAdmin) {
      // Create verification token
      const token = randomBytes(32).toString("hex");
      const expires = new Date();
      expires.setHours(expires.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

      await prisma.verificationToken.create({
        data: {
          identifier: `email-verify:${user.id}`,
          token,
          expires,
        },
      });

      const baseUrl = buildBaseUrl(req);
      const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

      try {
        await sendEmailVerificationEmail(user.email, user.firstName, verifyUrl);
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        // Continue even if email fails - user can request resend
      }
    }

    return NextResponse.json({
      id: user.id,
      status,
      role,
      requiresEmailVerification: !isAdmin,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Kunne ikke opprette bruker. Vennligst prøv igjen senere." }, { status: 500 });
  }
}

