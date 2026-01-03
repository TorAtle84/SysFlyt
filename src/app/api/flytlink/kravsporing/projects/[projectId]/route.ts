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

        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
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

export async function PATCH(
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

        const body = await request.json();
        const { restore } = body;

        let project;

        if (restore) {
            // Restore project
            project = await prisma.kravsporingProject.update({
                where: {
                    id: projectId,
                    userId: user.id,
                },
                data: {
                    deletedAt: null,
                },
            });
        } else {
            // Check if user is owner before normal update
            project = await prisma.kravsporingProject.findFirst({
                where: { id: projectId, userId: user.id },
            });

            if (!project) {
                return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
            }

            // Allow other updates here if needed later
        }

        return NextResponse.json({ project });
    } catch (error) {
        console.error("Error updating/restoring project:", error);
        return NextResponse.json({ error: "Kunne ikke oppdatere prosjekt" }, { status: 500 });
    }
}

export async function DELETE(
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

        // Check if permanent delete
        const { searchParams } = new URL(request.url);
        const permanent = searchParams.get("permanent") === "true";

        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                userId: user.id,
            },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        if (permanent) {
            await prisma.kravsporingProject.delete({
                where: {
                    id: projectId,
                },
            });
        } else {
            await prisma.kravsporingProject.update({
                where: {
                    id: projectId,
                },
                data: {
                    deletedAt: new Date(),
                },
            });
        }

        return NextResponse.json({ message: "Prosjekt slettet" });
    } catch (error) {
        console.error("Error deleting kravsporing project:", error);
        return NextResponse.json({ error: "Kunne ikke slette prosjekt" }, { status: 500 });
    }
}
