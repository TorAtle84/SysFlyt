import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

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
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true },
        });

        if (!user) {
            return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
        }

        // Verify project ownership
        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                userId: user.id,
            },
            select: { id: true },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        // Get all requirements for this project through analyses
        const requirements = await prisma.kravsporingRequirement.findMany({
            where: {
                analysis: {
                    projectId: projectId,
                },
            },
            include: {
                discipline: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json({ requirements });
    } catch (error) {
        console.error("Error fetching requirements:", error);
        return NextResponse.json({ error: "Kunne ikke hente krav" }, { status: 500 });
    }
}
