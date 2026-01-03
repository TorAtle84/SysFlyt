import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ projectId: string; analysisId: string }> }
) {
    const { projectId, analysisId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true },
        });

        if (!user) {
            return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
        }

        // Verify ownership
        const project = await prisma.kravsporingProject.findFirst({
            where: { id: projectId, userId: user.id },
            select: { id: true },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        const analysis = await prisma.kravsporingAnalysis.findUnique({
            where: { id: analysisId },
        });

        if (!analysis) {
            return NextResponse.json({ error: "Analyse ikke funnet" }, { status: 404 });
        }

        if (analysis.status === "COMPLETED" || analysis.status === "FAILED") {
            return NextResponse.json({ message: "Analysen er allerede ferdig" });
        }

        // Update status to CANCELLED
        await prisma.kravsporingAnalysis.update({
            where: { id: analysisId },
            data: { status: "CANCELLED" },
        });

        return NextResponse.json({ message: "Analyse kansellert" });
    } catch (error) {
        console.error("Error canceling analysis:", error);
        return NextResponse.json(
            { error: "Kunne ikke kansellere analyse" },
            { status: 500 }
        );
    }
}
