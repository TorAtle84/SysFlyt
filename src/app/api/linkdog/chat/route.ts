import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { chat, isIrrelevantMessage, getExitMessage, type AIProvider } from "@/lib/linkdog/ai-client";
import type { LinkDogContext } from "@/lib/linkdog/system-prompt";

interface ChatRequestBody {
    message: string;
    context: {
        currentPage: string;
        app: 'syslink' | 'flytlink';
        projectId?: string;
        projectName?: string;
    };
    irrelevantCount?: number;
    sameTopicCount?: number;
}

/**
 * POST - Send a message to LinkDog
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                id: true,
                role: true,
                linkdogEnabled: true,
                linkdogProvider: true,
                geminiApiKey: true,
                claudeApiKey: true,
                openaiApiKey: true,
                appAccess: {
                    where: { status: "APPROVED" },
                    select: {
                        application: { select: { code: true } }
                    }
                }
            }
        });

        if (!user) {
            return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
        }

        if (!user.linkdogEnabled) {
            return NextResponse.json({
                error: "LinkDog er deaktivert. Aktiver den i Profil-innstillingene."
            }, { status: 400 });
        }

        const body: ChatRequestBody = await req.json();
        const { message, context, irrelevantCount = 0, sameTopicCount = 0 } = body;

        if (!message || !message.trim()) {
            return NextResponse.json({ error: "Melding mangler" }, { status: 400 });
        }

        // Check conversation limits
        if (sameTopicCount >= 5) {
            return NextResponse.json({
                response: getExitMessage(),
                shouldEnd: true,
                reason: "same_topic_limit"
            });
        }

        // Check for irrelevant messages
        if (isIrrelevantMessage(message)) {
            const newIrrelevantCount = irrelevantCount + 1;

            if (newIrrelevantCount >= 3) {
                return NextResponse.json({
                    response: getExitMessage(),
                    shouldEnd: true,
                    irrelevantCount: newIrrelevantCount,
                    reason: "irrelevant_limit"
                });
            }

            return NextResponse.json({
                response: "Dette kan jeg ikke hjelpe deg med, men jeg kan hjelpe deg med noe i applikasjonen! 🐾",
                shouldEnd: false,
                irrelevantCount: newIrrelevantCount
            });
        }

        // Determine which API key to use
        const provider = (user.linkdogProvider as AIProvider) || 'gemini';
        let apiKey: string | null = null;

        if (provider === 'gemini') {
            apiKey = user.geminiApiKey;
        } else if (provider === 'claude') {
            apiKey = user.claudeApiKey;
        } else if (provider === 'openai') {
            apiKey = user.openaiApiKey;
        }

        if (!apiKey) {
            const providerName = provider === 'gemini' ? 'Gemini' : provider === 'claude' ? 'Claude' : 'OpenAI';
            return NextResponse.json({
                response: "",
                error: `Du har ikke konfigurert en ${providerName} API-nøkkel. Gå til [Profil](/syslink/profile) for å legge den til! 🐕`,
                shouldEnd: false
            });
        }

        // Build context
        const linkdogContext: LinkDogContext = {
            currentPage: context.currentPage || '/unknown',
            app: context.app || 'syslink',
            userRole: user.role,
            appAccess: user.appAccess.map(a => a.application.code),
            isAdmin: user.role === 'ADMIN',
            projectId: context.projectId,
            projectName: context.projectName,
        };

        // Get AI response
        const result = await chat(message, linkdogContext, provider, apiKey);

        if (result.error) {
            return NextResponse.json({
                response: "",
                error: result.error,
                shouldEnd: false
            });
        }

        return NextResponse.json({
            response: result.response,
            shouldEnd: false,
            irrelevantCount: 0 // Reset on valid response
        });

    } catch (error) {
        console.error("LinkDog chat error:", error);
        return NextResponse.json(
            { error: "En feil oppstod. Prøv igjen senere! 🐕" },
            { status: 500 }
        );
    }
}
