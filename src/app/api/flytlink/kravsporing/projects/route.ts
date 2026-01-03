import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

// Default disciplines for new projects
const DEFAULT_DISCIPLINES = [
    { name: "Ventilasjon", color: "#10B981", sortOrder: 0 },
    { name: "Elektro", color: "#F59E0B", sortOrder: 1 },
    { name: "Rørlegger", color: "#3B82F6", sortOrder: 2 },
    { name: "Byggautomasjon", color: "#7C3AED", sortOrder: 3 },
    { name: "Felles", color: "#6B7280", sortOrder: 4 },
    { name: "Uspesifisert", color: "#9CA3AF", sortOrder: 5 },
];

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const showArchived = searchParams.get("archived") === "true";

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

        const projects = await prisma.kravsporingProject.findMany({
            where: {
                userId: user.id,
                deletedAt: showArchived ? { not: null } : null
            },
            orderBy: { updatedAt: "desc" },
            include: {
                _count: {
                    select: {
                        analyses: true,
                        disciplines: true,
                    },
                },
            },
        });

        return NextResponse.json({ projects });
    } catch (error) {
        console.error("Error fetching kravsporing projects:", error);
        return NextResponse.json({ error: "Kunne ikke hente prosjekter" }, { status: 500 });
    }
}

export async function POST(request: Request) {
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
        const { name, description } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: "Prosjektnavn er påkrevd" }, { status: 400 });
        }

        // Create project with default disciplines
        const project = await prisma.kravsporingProject.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                userId: user.id,
                disciplines: {
                    create: DEFAULT_DISCIPLINES,
                },
            },
            include: {
                disciplines: true,
                _count: {
                    select: {
                        analyses: true,
                        disciplines: true,
                    },
                },
            },
        });

        return NextResponse.json({ project });
    } catch (error) {
        console.error("Error creating kravsporing project:", error);
        return NextResponse.json({ error: "Kunne ikke opprette prosjekt" }, { status: 500 });
    }
}
