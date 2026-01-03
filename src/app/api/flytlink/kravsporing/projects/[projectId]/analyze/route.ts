import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { runAnalysisPipeline } from "@/lib/flytlink/analysis-pipeline";

export const maxDuration = 60; // Allow up to 60 seconds (Vercel Hobby limit 10s usually, Pro 60s/300s)
export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, geminiApiKey: true },
        });

        if (!user) {
            return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
        }

        if (!user.geminiApiKey) {
            return NextResponse.json(
                { error: "Du må konfigurere Gemini API-nøkkel i profilen din" },
                { status: 400 }
            );
        }

        // Verify project ownership
        const project = await prisma.kravsporingProject.findFirst({
            where: { id: projectId, userId: user.id },
            select: { id: true },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        // Parse multipart form data
        const formData = await request.formData();
        const files: { name: string; buffer: Buffer; mimeType: string }[] = [];

        for (const [key, value] of formData.entries()) {
            if (key.startsWith("file") && value instanceof File) {
                const buffer = Buffer.from(await value.arrayBuffer());
                files.push({
                    name: value.name,
                    buffer,
                    mimeType: value.type,
                });
            }
        }

        if (files.length === 0) {
            return NextResponse.json({ error: "Ingen filer lastet opp" }, { status: 400 });
        }

        // Create analysis record
        const analysis = await prisma.kravsporingAnalysis.create({
            data: {
                projectId,
                status: "PROCESSING",
            },
        });

        // Run analysis synchronously (blocking) to ensure it finishes on Vercel
        // Note: For large files/production, this should be offloaded to a background job queue (e.g. Inngest)
        await runAnalysisPipeline(analysis.id, files, user.id);

        return NextResponse.json({
            analysisId: analysis.id,
            message: "Analyse startet",
        });

    } catch (error) {
        console.error("Error starting analysis:", error);
        return NextResponse.json(
            { error: "Kunne ikke starte analyse" },
            { status: 500 }
        );
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
    }

    try {
        const url = new URL(request.url);
        const analysisId = url.searchParams.get("analysisId");

        if (analysisId) {
            // Get specific analysis with counts
            const analysis = await prisma.kravsporingAnalysis.findFirst({
                where: { id: analysisId, projectId },
                include: {
                    _count: {
                        select: { files: true, requirements: true },
                    },
                },
            });

            if (analysis) {
                // Estimate current stage based on state
                let currentStage = "extracting";
                if (analysis._count.files > 0 && analysis._count.requirements === 0 && analysis.status === "PROCESSING") {
                    currentStage = "finding";
                }
                if (analysis.tokensUsed > 1000) {
                    currentStage = "validating";
                }
                if (analysis.tokensUsed > 5000) {
                    currentStage = "assigning";
                }

                return NextResponse.json({
                    analysis: {
                        ...analysis,
                        currentStage,
                    },
                });
            }

            return NextResponse.json({ analysis });
        }

        // Get all analyses for project
        const analyses = await prisma.kravsporingAnalysis.findMany({
            where: { projectId },
            orderBy: { startedAt: "desc" },
            include: {
                _count: {
                    select: { files: true, requirements: true },
                },
            },
        });

        return NextResponse.json({ analyses });

    } catch (error) {
        console.error("Error fetching analyses:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente analyser" },
            { status: 500 }
        );
    }
}
