import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";


/**
 * GET - Debug endpoint to check encryption configuration
 * Only accessible by admins
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { role: true, id: true }
        });

        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Kun for administratorer" }, { status: 403 });
        }

        // Check encryption key
        const encryptionKeySet = !!process.env.ENCRYPTION_KEY;
        const encryptionKeyLength = process.env.ENCRYPTION_KEY?.length || 0;

        // Check user's API keys (encrypted format only, not decrypted for security)
        const userData = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                geminiApiKey: true,
                claudeApiKey: true,
                openaiApiKey: true,
                linkdogProvider: true,
                linkdogEnabled: true
            }
        });

        return NextResponse.json({
            encryption: {
                keySet: encryptionKeySet,
                keyLength: encryptionKeyLength,
                expectedLength: 64 // 64 hex characters = 32 bytes
            },
            apiKeys: {
                gemini: {
                    configured: !!userData?.geminiApiKey,
                    encryptedLength: userData?.geminiApiKey?.length || 0,
                    hasColons: userData?.geminiApiKey?.includes(':') || false,
                    connectionCheck: userData?.geminiApiKey ? await checkGeminiConnection(decrypt(userData.geminiApiKey)) : 'skipped'
                },
                claude: {
                    configured: !!userData?.claudeApiKey,
                    encryptedLength: userData?.claudeApiKey?.length || 0,
                    hasColons: userData?.claudeApiKey?.includes(':') || false
                },
                openai: {
                    configured: !!userData?.openaiApiKey,
                    encryptedLength: userData?.openaiApiKey?.length || 0,
                    hasColons: userData?.openaiApiKey?.includes(':') || false
                }
            },
            linkdog: {
                enabled: userData?.linkdogEnabled ?? false,
                provider: userData?.linkdogProvider || 'not set'
            }
        });

    } catch (error) {
        console.error("Debug endpoint error:", error);
        return NextResponse.json(
            { error: "Debug check failed", details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function checkGeminiConnection(apiKey: string): Promise<any> {
    try {
        if (!apiKey) return { success: false, error: 'Empty key' };
        // List models to verify access
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            return { success: false, status: res.status, error: data };
        }

        // Check if flash model exists
        const models = data.models || [];
        const flashModel = models.find((m: any) => m.name.includes('flash'));

        return {
            success: true,
            modelCount: models.length,
            hasFlash: !!flashModel,
            flashModelName: flashModel?.name
        };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
}
