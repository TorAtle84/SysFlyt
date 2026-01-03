import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(
    request: Request,
    { params }: { params: { projectId: string } }
) {
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

        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: params.projectId,
                userId: user.id,
            },
            include: {
                disciplines: {
                    orderBy: { sortOrder: "asc" },
                },
                analyses: {
                    orderBy: { startedAt: "desc" },
                    include: {
                        _count: {
                            select: {
                                files: true,
                                requirements: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        analyses: true,
                    },
                },
            },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        return NextResponse.json({ project });
    } catch (error) {
        console.error("Error fetching kravsporing project:", error);
        return NextResponse.json({ error: "Kunne ikke hente prosjekt" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { projectId: string } }
) {
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

        // Verify ownership before deleting
        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: params.projectId,
                userId: user.id,
            },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        await prisma.kravsporingProject.delete({
            where: { id: params.projectId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting kravsporing project:", error);
        return NextResponse.json({ error: "Kunne ikke slette prosjekt" }, { status: 500 });
    }
}
