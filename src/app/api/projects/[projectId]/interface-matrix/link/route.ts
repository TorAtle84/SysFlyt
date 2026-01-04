import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initialLinkSync } from "@/lib/interface-matrix-sync";

/**
 * GET - Get link status and available FlytLink projects to link to
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const { projectId } = await params;

        // Get the SysLink project and check if it's linked
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                id: true,
                name: true,
                linkedKravsporingProjectId: true,
                linkedKravsporingProject: {
                    select: { id: true, name: true, description: true }
                }
            }
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        // Get user to find their role and email domain
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, email: true, role: true },
        });

        if (!user) {
            return NextResponse.json({ error: "Bruker ikke funnet" }, { status: 404 });
        }

        // Extract email domain for filtering
        const emailDomain = user.email.split("@")[1];
        const isAdmin = user.role === "ADMIN";

        // Get already linked FlytLink project IDs to exclude
        const linkedIds = (await prisma.project.findMany({
            where: { linkedKravsporingProjectId: { not: null } },
            select: { linkedKravsporingProjectId: true }
        })).map(p => p.linkedKravsporingProjectId!).filter(Boolean);

        // Get available (unlinked) FlytLink projects
        // For regular users: only projects owned by users with same email domain
        // For admins: all projects
        const availableFlytLinkProjects = await prisma.kravsporingProject.findMany({
            where: {
                deletedAt: null,
                // Not already linked to another SysLink project
                NOT: { id: { in: linkedIds } },
                // For non-admins, filter by same email domain
                ...(isAdmin ? {} : {
                    user: {
                        email: { endsWith: `@${emailDomain}` }
                    }
                })
            },
            select: {
                id: true,
                name: true,
                description: true,
            },
            orderBy: { name: "asc" },
        });

        return NextResponse.json({
            isLinked: !!project.linkedKravsporingProjectId,
            linkedProject: project.linkedKravsporingProject,
            availableProjects: availableFlytLinkProjects,
        });

    } catch (error) {
        console.error("Error getting link status:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente koblingstatus" },
            { status: 500 }
        );
    }
}

/**
 * POST - Link a SysLink Project to a FlytLink KravsporingProject
 * 
 * Body: { flytLinkProjectId: string }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const { projectId } = await params;
        const body = await request.json();
        const { flytLinkProjectId } = body;

        if (!flytLinkProjectId) {
            return NextResponse.json({ error: "flytLinkProjectId er påkrevd" }, { status: 400 });
        }

        // Verify the SysLink project exists
        const sysLinkProject = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!sysLinkProject) {
            return NextResponse.json({ error: "SysLink-prosjekt ikke funnet" }, { status: 404 });
        }

        // Check if already linked
        if (sysLinkProject.linkedKravsporingProjectId) {
            return NextResponse.json({
                error: "SysLink-prosjektet er allerede koblet til et FlytLink-prosjekt"
            }, { status: 400 });
        }

        // Verify the FlytLink project exists and is not already linked
        const flytLinkProject = await prisma.kravsporingProject.findUnique({
            where: { id: flytLinkProjectId },
        });

        if (!flytLinkProject) {
            return NextResponse.json({ error: "FlytLink-prosjekt ikke funnet" }, { status: 404 });
        }

        // Check if FlytLink project is already linked to another SysLink project
        const existingLink = await prisma.project.findFirst({
            where: { linkedKravsporingProjectId: flytLinkProjectId },
        });

        if (existingLink) {
            return NextResponse.json({
                error: "FlytLink-prosjektet er allerede koblet til et annet SysLink-prosjekt"
            }, { status: 400 });
        }

        // Create the link
        await prisma.project.update({
            where: { id: projectId },
            data: { linkedKravsporingProjectId: flytLinkProjectId },
        });

        // Perform initial sync
        const syncResult = await initialLinkSync(projectId, flytLinkProjectId);

        return NextResponse.json({
            success: true,
            message: "Prosjektene er nå koblet sammen",
            linkedTo: {
                id: flytLinkProject.id,
                name: flytLinkProject.name,
            },
            syncResult,
        });

    } catch (error) {
        console.error("Error linking projects:", error);
        return NextResponse.json(
            { error: "Kunne ikke koble prosjektene" },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Unlink a SysLink Project from a FlytLink KravsporingProject
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Ikke autentisert" }, { status: 401 });
        }

        const { projectId } = await params;

        // Get the SysLink project
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                id: true,
                linkedKravsporingProjectId: true,
                linkedKravsporingProject: { select: { id: true, name: true } }
            }
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        if (!project.linkedKravsporingProjectId) {
            return NextResponse.json({ error: "Prosjektet er ikke koblet" }, { status: 400 });
        }

        const unlinkedFrom = project.linkedKravsporingProject;

        // Remove the link
        await prisma.project.update({
            where: { id: projectId },
            data: { linkedKravsporingProjectId: null },
        });

        return NextResponse.json({
            success: true,
            message: "Koblingen er fjernet",
            unlinkedFrom,
        });

    } catch (error) {
        console.error("Error unlinking projects:", error);
        return NextResponse.json(
            { error: "Kunne ikke fjerne koblingen" },
            { status: 500 }
        );
    }
}
