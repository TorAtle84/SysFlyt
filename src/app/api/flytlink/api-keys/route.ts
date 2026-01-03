import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import crypto from "crypto";

// Simple encryption for API keys (in production, use a proper key management service)
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || "default-32-char-encryption-key!!";
const IV_LENGTH = 16;

function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text: string): string {
    const parts = text.split(":");
    const iv = Buffer.from(parts.shift()!, "hex");
    const encryptedText = Buffer.from(parts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { geminiApiKey, openaiApiKey } = body;

        const updateData: { geminiApiKey?: string; openaiApiKey?: string } = {};

        if (geminiApiKey) {
            updateData.geminiApiKey = encrypt(geminiApiKey);
        }
        if (openaiApiKey) {
            updateData.openaiApiKey = encrypt(openaiApiKey);
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "Ingen nøkler å lagre" }, { status: 400 });
        }

        await prisma.user.update({
            where: { email: session.user.email },
            data: updateData,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving API keys:", error);
        return NextResponse.json({ error: "Kunne ikke lagre API-nøkler" }, { status: 500 });
    }
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                geminiApiKey: true,
                openaiApiKey: true,
            },
        });

        return NextResponse.json({
            hasGeminiKey: !!user?.geminiApiKey,
            hasOpenaiKey: !!user?.openaiApiKey,
        });
    } catch (error) {
        console.error("Error fetching API keys status:", error);
        return NextResponse.json({ error: "Kunne ikke hente API-nøkler" }, { status: 500 });
    }
}
