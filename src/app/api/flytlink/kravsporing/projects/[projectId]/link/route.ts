import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initialLinkSync } from "@/lib/interface-matrix-sync";

/**
 * POST - Link a FlytLink KravsporingProject to a SysLink Project
 * 
 * Body: { sysLinkProjectId: string }
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
        const { sysLinkProjectId } = body;

        if (!sysLinkProjectId) {
            return NextResponse.json({ error: "sysLinkProjectId er påkrevd" }, { status: 400 });
        }

        // Verify user owns the FlytLink project
        const flytLinkProject = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                user: { email: session.user.email },
                deletedAt: null,
            },
        });

        if (!flytLinkProject) {
            return NextResponse.json({ error: "FlytLink-prosjekt ikke funnet" }, { status: 404 });
        }

        // Check if already linked
        if (flytLinkProject.id) {
            const existingLink = await prisma.project.findFirst({
                where: { linkedKravsporingProjectId: projectId },
            });
            if (existingLink) {
                return NextResponse.json({
                    error: "FlytLink-prosjektet er allerede koblet til et SysLink-prosjekt"
                }, { status: 400 });
            }
        }

        // Verify the SysLink project exists and is not already linked
        const sysLinkProject = await prisma.project.findUnique({
            where: { id: sysLinkProjectId },
        });

        if (!sysLinkProject) {
            return NextResponse.json({ error: "SysLink-prosjekt ikke funnet" }, { status: 404 });
        }

        if (sysLinkProject.linkedKravsporingProjectId) {
            return NextResponse.json({
                error: "SysLink-prosjektet er allerede koblet til et annet FlytLink-prosjekt"
            }, { status: 400 });
        }

        // Create the link
        await prisma.project.update({
            where: { id: sysLinkProjectId },
            data: { linkedKravsporingProjectId: projectId },
        });

        // Perform initial sync
        const syncResult = await initialLinkSync(sysLinkProjectId, projectId);

        return NextResponse.json({
            success: true,
            message: "Prosjektene er nå koblet sammen",
            linkedTo: {
                id: sysLinkProject.id,
                name: sysLinkProject.name,
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
 * DELETE - Unlink a FlytLink KravsporingProject from a SysLink Project
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

        // Verify user owns the FlytLink project
        const flytLinkProject = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                user: { email: session.user.email },
                deletedAt: null,
            },
        });

        if (!flytLinkProject) {
            return NextResponse.json({ error: "FlytLink-prosjekt ikke funnet" }, { status: 404 });
        }

        // Find and remove the link
        const linkedProject = await prisma.project.findFirst({
            where: { linkedKravsporingProjectId: projectId },
        });

        if (!linkedProject) {
            return NextResponse.json({ error: "Prosjektet er ikke koblet" }, { status: 400 });
        }

        // Remove the link
        await prisma.project.update({
            where: { id: linkedProject.id },
            data: { linkedKravsporingProjectId: null },
        });

        return NextResponse.json({
            success: true,
            message: "Koblingen er fjernet",
            unlinkedFrom: {
                id: linkedProject.id,
                name: linkedProject.name,
            },
        });

    } catch (error) {
        console.error("Error unlinking projects:", error);
        return NextResponse.json(
            { error: "Kunne ikke fjerne koblingen" },
            { status: 500 }
        );
    }
}

/**
 * GET - Get link status and available projects to link
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

        // Verify user owns the FlytLink project
        const flytLinkProject = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                user: { email: session.user.email },
                deletedAt: null,
            },
        });

        if (!flytLinkProject) {
            return NextResponse.json({ error: "FlytLink-prosjekt ikke funnet" }, { status: 404 });
        }

        // Check if currently linked
        const linkedSysLinkProject = await prisma.project.findFirst({
            where: { linkedKravsporingProjectId: projectId },
            select: { id: true, name: true, description: true },
        });

        // Get available (unlinked) SysLink projects
        // For regular users: projects created by users with same email domain
        // For admins: all projects
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

        const availableProjects = await prisma.project.findMany({
            where: {
                linkedKravsporingProjectId: null,
                status: "ACTIVE",
                // For non-admins, filter by same email domain
                ...(isAdmin ? {} : {
                    createdBy: {
                        email: { endsWith: `@${emailDomain}` }
                    }
                })
            },
            select: {
                id: true,
                name: true,
                description: true,
                createdBy: { select: { name: true, email: true } }
            },
            orderBy: { name: "asc" },
        });

        return NextResponse.json({
            isLinked: !!linkedSysLinkProject,
            linkedProject: linkedSysLinkProject,
            availableProjects,
        });

    } catch (error) {
        console.error("Error getting link status:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente koblingstatus" },
            { status: 500 }
        );
    }
}
