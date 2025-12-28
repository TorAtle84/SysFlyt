import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { randomBytes } from "crypto";
import { sendEmailVerificationEmail, sendAdminNewUserNotification } from "@/lib/email";
import { Role } from "@prisma/client";

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

function buildBaseUrl(request: NextRequest): string {
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    return process.env.NEXTAUTH_URL || `${protocol}://${host}`;
}

// POST: Send or resend verification email
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email } = body;

        if (!email || typeof email !== "string") {
            return NextResponse.json({ error: "E-post er påkrevd" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, firstName: true, email: true, emailVerified: true },
        });

        if (!user) {
            // Don't reveal if user exists
            return NextResponse.json({ ok: true, message: "Hvis e-postadressen finnes, vil du motta en verifiserings-e-post." });
        }

        if (user.emailVerified) {
            return NextResponse.json({ error: "E-posten er allerede verifisert" }, { status: 400 });
        }

        // Delete any existing tokens for this user
        await prisma.verificationToken.deleteMany({
            where: { identifier: `email-verify:${user.id}` },
        });

        // Create new verification token
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

        const baseUrl = buildBaseUrl(request);
        const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

        await sendEmailVerificationEmail(user.email, user.firstName, verifyUrl);

        return NextResponse.json({ ok: true, message: "Verifiserings-e-post sendt" });
    } catch (error) {
        console.error("Send verification email error:", error);
        return NextResponse.json({ error: "Kunne ikke sende verifiserings-e-post" }, { status: 500 });
    }
}

// GET: Verify email with token
export async function GET(request: NextRequest) {
    try {
        const token = request.nextUrl.searchParams.get("token");

        if (!token) {
            return NextResponse.json({ error: "Token mangler" }, { status: 400 });
        }

        const verificationToken = await prisma.verificationToken.findFirst({
            where: {
                token,
                identifier: { startsWith: "email-verify:" },
            },
        });

        if (!verificationToken) {
            return NextResponse.json({ error: "Ugyldig eller utløpt token" }, { status: 400 });
        }

        if (verificationToken.expires < new Date()) {
            await prisma.verificationToken.delete({
                where: { identifier_token: { identifier: verificationToken.identifier, token } },
            });
            return NextResponse.json({ error: "Token har utløpt. Be om ny verifiserings-e-post." }, { status: 400 });
        }

        const userId = verificationToken.identifier.replace("email-verify:", "");

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, firstName: true, lastName: true, email: true, company: true, emailVerified: true },
        });

        if (!user) {
            return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
        }

        if (user.emailVerified) {
            return NextResponse.json({ ok: true, alreadyVerified: true, message: "E-posten er allerede verifisert" });
        }

        // Mark email as verified
        await prisma.user.update({
            where: { id: userId },
            data: {
                emailVerified: true,
                emailVerifiedAt: new Date(),
            },
        });

        // Delete the verification token
        await prisma.verificationToken.delete({
            where: { identifier_token: { identifier: verificationToken.identifier, token } },
        });

        // Notify admins about the new verified user
        const admins = await prisma.user.findMany({
            where: { role: Role.ADMIN },
            select: { email: true },
        });

        if (admins.length > 0) {
            const baseUrl = buildBaseUrl(request);
            const adminUrl = `${baseUrl}/admin/users`;
            await sendAdminNewUserNotification(
                admins.map((a) => a.email),
                { firstName: user.firstName, lastName: user.lastName, email: user.email, company: user.company },
                adminUrl
            );
        }

        return NextResponse.json({
            ok: true,
            message: "E-post verifisert! En administrator vil gjennomgå kontoen din.",
        });
    } catch (error) {
        console.error("Verify email error:", error);
        return NextResponse.json({ error: "Kunne ikke verifisere e-post" }, { status: 500 });
    }
}
