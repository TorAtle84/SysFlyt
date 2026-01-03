import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseFileForSystems } from "@/lib/tfm-parser";
import { syncInterfaceMatrix } from "@/lib/interface-matrix-sync";

/**
 * GET - Fetch Interface Matrix for a FlytLink KravsporingProject
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

        // Verify user owns or has access to this project
        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                user: { email: session.user.email },
                deletedAt: null,
            },
            include: {
                linkedProject: { select: { id: true, name: true } },
            },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        // Get or create matrix
        let matrix = await prisma.interfaceMatrix.findUnique({
            where: { kravsporingProjectId: projectId },
            include: {
                rows: {
                    orderBy: { sortOrder: "asc" },
                    include: { cells: true },
                },
                columns: {
                    orderBy: { sortOrder: "asc" },
                },
            },
        });

        if (!matrix) {
            // Create matrix with default columns
            matrix = await prisma.interfaceMatrix.create({
                data: { kravsporingProjectId: projectId },
                include: {
                    rows: { include: { cells: true } },
                    columns: true,
                },
            });

            // Create default columns
            const defaultDisciplines = [
                { code: "EL", color: "#FEF9C3" },
                { code: "AUT", color: "#E9D5FF" },
                { code: "VENT", color: "#DCFCE7" },
                { code: "RØR", color: "#DBEAFE" },
                { code: "BH", color: "#F3F4F6" },
                { code: "ENT", color: "#FFEDD5" },
                { code: "KUL", color: "#E0F2FE" },
            ];

            await prisma.interfaceMatrixColumn.createMany({
                data: defaultDisciplines.map((d, index) => ({
                    matrixId: matrix!.id,
                    discipline: d.code,
                    color: d.color,
                    sortOrder: index,
                })),
            });

            // Re-fetch with columns
            matrix = await prisma.interfaceMatrix.findUnique({
                where: { kravsporingProjectId: projectId },
                include: {
                    rows: {
                        orderBy: { sortOrder: "asc" },
                        include: { cells: true },
                    },
                    columns: {
                        orderBy: { sortOrder: "asc" },
                    },
                },
            });
        }

        return NextResponse.json({
            matrix,
            linkedProject: project.linkedProject,
        });
    } catch (error) {
        console.error("Error fetching FlytLink interface matrix:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente grensesnittmatrise" },
            { status: 500 }
        );
    }
}

/**
 * POST - Import systems from uploaded PDF/Excel files
 * 
 * Expects multipart/form-data with one or more files
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

        // Verify user owns this project
        const project = await prisma.kravsporingProject.findFirst({
            where: {
                id: projectId,
                user: { email: session.user.email },
                deletedAt: null,
            },
            include: {
                linkedProject: true,
            },
        });

        if (!project) {
            return NextResponse.json({ error: "Prosjekt ikke funnet" }, { status: 404 });
        }

        // Parse form data
        const formData = await request.formData();
        const files = formData.getAll("files") as File[];

        if (files.length === 0) {
            return NextResponse.json({ error: "Ingen filer lastet opp" }, { status: 400 });
        }

        // Extract systems from all files
        const allSystems: string[] = [];
        const errors: string[] = [];

        for (const file of files) {
            try {
                const buffer = Buffer.from(await file.arrayBuffer());
                const systems = await parseFileForSystems(buffer, file.name);
                allSystems.push(...systems);
            } catch (fileError) {
                errors.push(`${file.name}: ${fileError instanceof Error ? fileError.message : "Ukjent feil"}`);
            }
        }

        // Deduplicate and sort
        const uniqueSystems = [...new Set(allSystems)].sort((a, b) => {
            const aParts = a.split(/[.:]/);
            const bParts = b.split(/[.:]/);
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const aNum = parseInt(aParts[i] || '0', 10);
                const bNum = parseInt(bParts[i] || '0', 10);
                if (aNum !== bNum) return aNum - bNum;
            }
            return 0;
        });

        if (uniqueSystems.length === 0) {
            return NextResponse.json({
                createdCount: 0,
                message: "Ingen systemkoder funnet i filene",
                errors: errors.length > 0 ? errors : undefined,
            });
        }

        // Get or create matrix
        let matrix = await prisma.interfaceMatrix.findUnique({
            where: { kravsporingProjectId: projectId },
        });

        if (!matrix) {
            matrix = await prisma.interfaceMatrix.create({
                data: { kravsporingProjectId: projectId },
            });
        }

        // Get existing rows
        const existingRows = await prisma.interfaceMatrixRow.findMany({
            where: { matrixId: matrix.id },
            select: { systemCode: true },
        });
        const existingCodes = new Set(existingRows.map(r => r.systemCode));

        // Filter to only new systems
        const newSystems = uniqueSystems.filter(s => !existingCodes.has(s));

        if (newSystems.length === 0) {
            return NextResponse.json({
                createdCount: 0,
                message: "Alle systemkoder finnes allerede",
                totalFound: uniqueSystems.length,
                errors: errors.length > 0 ? errors : undefined,
            });
        }

        // Get max sort order
        const maxSort = await prisma.interfaceMatrixRow.findFirst({
            where: { matrixId: matrix.id },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
        });
        let currentSort = (maxSort?.sortOrder ?? -1) + 1;

        // Create new rows
        const rowsData = newSystems.map(systemCode => ({
            matrixId: matrix!.id,
            systemCode,
            description: `System ${systemCode}`,
            sortOrder: currentSort++,
            sourceApp: "FLYTLINK",
        }));

        await prisma.interfaceMatrixRow.createMany({
            data: rowsData,
        });

        // Re-sort all rows by systemCode
        const allRows = await prisma.interfaceMatrixRow.findMany({
            where: { matrixId: matrix.id },
        });

        allRows.sort((a, b) => {
            const aParts = a.systemCode.split(/[.:]/);
            const bParts = b.systemCode.split(/[.:]/);
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const aNum = parseInt(aParts[i] || '0', 10);
                const bNum = parseInt(bParts[i] || '0', 10);
                if (aNum !== bNum) return aNum - bNum;
            }
            return 0;
        });

        for (let i = 0; i < allRows.length; i++) {
            if (allRows[i].sortOrder !== i) {
                await prisma.interfaceMatrixRow.update({
                    where: { id: allRows[i].id },
                    data: { sortOrder: i },
                });
            }
        }

        // If linked to SysLink project, trigger sync
        let syncResult = null;
        if (project.linkedProject) {
            syncResult = await syncInterfaceMatrix(projectId, "FLYTLINK");
        }

        return NextResponse.json({
            createdCount: newSystems.length,
            totalFound: uniqueSystems.length,
            message: `La til ${newSystems.length} nye systemer fra ${files.length} fil(er)`,
            syncResult: syncResult,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        console.error("Error importing systems from files:", error);
        return NextResponse.json(
            { error: "Kunne ikke importere systemer fra filer" },
            { status: 500 }
        );
    }
}
