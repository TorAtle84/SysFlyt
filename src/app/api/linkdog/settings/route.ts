import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { encrypt, decrypt, maskApiKey, isValidApiKey } from "@/lib/encryption";

/**
 * GET - Get LinkDog settings and API key status
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                linkdogEnabled: true,
                linkdogProvider: true,
                geminiApiKey: true,
                claudeApiKey: true,
                openaiApiKey: true,
            }
        });

        if (!user) {
            return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
        }

        // Helper to safely decrypt and mask
        const safeDecryptAndMask = (encryptedKey: string | null): string | null => {
            if (!encryptedKey) return null;
            try {
                return maskApiKey(decrypt(encryptedKey));
            } catch (e) {
                console.warn("Failed to decrypt API key (likely invalid format), treating as unconfigured:", e);
                return null;
            }
        };

        // Return settings with masked API keys
        return NextResponse.json({
            enabled: user.linkdogEnabled,
            provider: user.linkdogProvider || 'gemini',
            keys: {
                gemini: {
                    configured: !!user.geminiApiKey,
                    masked: safeDecryptAndMask(user.geminiApiKey)
                },
                claude: {
                    configured: !!user.claudeApiKey,
                    masked: safeDecryptAndMask(user.claudeApiKey)
                },
                openai: {
                    configured: !!user.openaiApiKey,
                    masked: safeDecryptAndMask(user.openaiApiKey)
                }
            }
        });

    } catch (error) {
        console.error("Error fetching LinkDog settings:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente innstillinger" },
            { status: 500 }
        );
    }
}

/**
 * PUT - Update LinkDog settings or API keys
 */
export async function PUT(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const body = await req.json();
        const { enabled, provider, geminiApiKey, claudeApiKey } = body;

        const updateData: Record<string, unknown> = {};

        // Update enabled state
        if (typeof enabled === 'boolean') {
            updateData.linkdogEnabled = enabled;
        }

        // Update provider
        if (provider && ['gemini', 'claude', 'openai'].includes(provider)) {
            updateData.linkdogProvider = provider;
        }

        // Update Gemini API key
        if (geminiApiKey !== undefined) {
            if (geminiApiKey === null || geminiApiKey === '') {
                // Remove key
                updateData.geminiApiKey = null;
            } else if (isValidApiKey(geminiApiKey, 'gemini')) {
                // Encrypt and store
                updateData.geminiApiKey = encrypt(geminiApiKey);
            } else {
                return NextResponse.json(
                    { error: "Ugyldig Gemini API-nøkkel" },
                    { status: 400 }
                );
            }
        }

        // Update Claude API key
        if (claudeApiKey !== undefined) {
            if (claudeApiKey === null || claudeApiKey === '') {
                // Remove key
                updateData.claudeApiKey = null;
            } else if (isValidApiKey(claudeApiKey, 'claude')) {
                // Encrypt and store
                updateData.claudeApiKey = encrypt(claudeApiKey);
            } else {
                return NextResponse.json(
                    { error: "Ugyldig Claude API-nøkkel (må starte med 'sk-ant-')" },
                    { status: 400 }
                );
            }
        }

        // Update OpenAI API key
        const { openaiApiKey } = body;
        if (openaiApiKey !== undefined) {
            if (openaiApiKey === null || openaiApiKey === '') {
                updateData.openaiApiKey = null;
            } else if (isValidApiKey(openaiApiKey, 'openai')) {
                updateData.openaiApiKey = encrypt(openaiApiKey);
            } else {
                return NextResponse.json(
                    { error: "Ugyldig OpenAI API-nøkkel (må starte med 'sk-')" },
                    { status: 400 }
                );
            }
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "Ingen endringer" }, { status: 400 });
        }

        await prisma.user.update({
            where: { email: session.user.email },
            data: updateData
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error updating LinkDog settings:", error);
        return NextResponse.json(
            { error: "Kunne ikke oppdatere innstillinger" },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Remove an API key
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const provider = searchParams.get('provider');

        if (!provider || !['gemini', 'claude', 'openai'].includes(provider)) {
            return NextResponse.json({ error: "Ugyldig provider" }, { status: 400 });
        }

        const updateData: Record<string, null> = {};

        if (provider === 'gemini') {
            updateData.geminiApiKey = null;
        } else if (provider === 'claude') {
            updateData.claudeApiKey = null;
        } else {
            updateData.openaiApiKey = null;
        }

        await prisma.user.update({
            where: { email: session.user.email },
            data: updateData
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error deleting API key:", error);
        return NextResponse.json(
            { error: "Kunne ikke slette API-nøkkel" },
            { status: 500 }
        );
    }
}
