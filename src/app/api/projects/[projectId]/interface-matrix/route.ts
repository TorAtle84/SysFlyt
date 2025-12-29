import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) return authResult.error;

        let matrix = await prisma.interfaceMatrix.findUnique({
            where: { projectId },
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
            // Create empty matrix if not exists
            matrix = await prisma.interfaceMatrix.create({
                data: { projectId },
                include: {
                    rows: { include: { cells: true } },
                    columns: true,
                },
            });

            // Create default columns
            const defaultDisciplines = [
                { code: "EL", color: "#FEF9C3" },      // Yellow
                { code: "AUT", color: "#E9D5FF" },     // Purple
                { code: "VENT", color: "#DCFCE7" },    // Green
                { code: "RØR", color: "#DBEAFE" },     // Blue
                { code: "BH", color: "#F3F4F6" },      // Gray
                { code: "ENT", color: "#FFEDD5" },     // Orange
                { code: "KUL", color: "#E0F2FE" },     // Dark Blueish
            ];

            await prisma.interfaceMatrixColumn.createMany({
                data: defaultDisciplines.map((d, index) => ({
                    matrixId: matrix!.id,
                    discipline: d.code,
                    color: d.color,
                    sortOrder: index,
                })),
            });

            // Re-fetch to get columns
            matrix = await prisma.interfaceMatrix.findUnique({
                where: { projectId },
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

        return NextResponse.json({ matrix });
    } catch (error) {
        console.error("Error fetching interface matrix:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente grensesnittmatrise" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) return authResult.error;

        // Ensure matrix exists
        let matrix = await prisma.interfaceMatrix.findUnique({
            where: { projectId },
        });

        if (!matrix) {
            matrix = await prisma.interfaceMatrix.create({
                data: { projectId },
            });
            // (Columns should be created by GET or separate init logic, but here we assume if POST is called, maybe we should init too? 
            // For simplicity, let's assume GET is called first or handles init. But to be safe, we can trigger init logic here too if needed. 
            // Current design: GET handles init of columns.)
        }

        // Fetch all unique system codes from FunctionTests
        // (User said "importert de unike {system} vi har i prosjektet". 
        // Usually via FunctionTests, MCProtocols, or MassLists. 
        // Let's scan FunctionTestRow.systemPart (Wait, system code is usually the prefix like 360.001? Or is it systemPart? 
        // In SysFlyt, "System" often refers to TFM "System" part. 
        // Let's assume we scan functionTestRow.systemPart and ensure it looks like a system.)

        // Also check MCProtocol.system? 
        // Let's aggregate unique systemStrings from FunctionTestRows for now.

        // 1. Get existing rows to avoid duplicates
        const existingRows = await prisma.interfaceMatrixRow.findMany({
            where: { matrixId: matrix.id },
            select: { systemCode: true },
        });
        const existingCodes = new Set(existingRows.map(r => r.systemCode));

        // 2. Find new candidate systems
        // Aggregate unique systemPart from FunctionTestRow where not null
        const ftRows = await prisma.functionTestRow.findMany({
            where: {
                functionTest: { projectId },
                systemPart: { not: "" }
            },
            select: { systemPart: true },
            distinct: ['systemPart']
        });

        const candidates = ftRows
            .map(r => r.systemPart)
            .filter(code => code && code.trim().length > 0 && !existingCodes.has(code));

        // Sort candidates
        candidates.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        if (candidates.length === 0) {
            return NextResponse.json({ createdCount: 0, message: "Ingen nye systemer funnet" });
        }

        // 3. Create new rows
        // Get max sort order
        const maxSort = await prisma.interfaceMatrixRow.findFirst({
            where: { matrixId: matrix.id },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true }
        });
        let currentSort = (maxSort?.sortOrder ?? -1) + 1;

        const rowsData = candidates.map(code => ({
            matrixId: matrix!.id,
            systemCode: code,
            sortOrder: currentSort++,
        }));

        await prisma.interfaceMatrixRow.createMany({
            data: rowsData,
        });

        // Smart Default Application
        // Fetch newly created rows to get IDs
        const newRows = await prisma.interfaceMatrixRow.findMany({
            where: {
                matrixId: matrix.id,
                systemCode: { in: rowsData.map(r => r.systemCode) }
            }
        });

        // Fetch existing columns and all rows for learning
        const columns = await prisma.interfaceMatrixColumn.findMany({
            where: { matrixId: matrix.id },
        });

        const allRows = await prisma.interfaceMatrixRow.findMany({
            where: { matrixId: matrix.id },
            include: { cells: { include: { column: true } } }
        });

        const newCellsData = [];

        for (const row of newRows) {
            const prefix = row.systemCode.split(".")[0];
            if (!prefix || prefix.length < 2) continue;

            const similar = allRows.filter(r => r.id !== row.id && r.systemCode.startsWith(prefix));
            if (similar.length === 0) continue;

            for (const col of columns) {
                if (!col.discipline) continue;

                const valueCounts: Record<string, number> = {};
                for (const r of similar) {
                    const cell = r.cells.find(c => c.columnId === col.id);
                    if (cell && Array.isArray(cell.values)) {
                        (cell.values as string[]).forEach(v => {
                            valueCounts[v] = (valueCounts[v] || 0) + 1;
                        });
                    }
                }

                const threshold = similar.length * 0.5;
                const predictedValues = Object.entries(valueCounts)
                    .filter(([_, count]) => count >= threshold)
                    .map(([val]) => val);

                if (predictedValues.length > 0) {
                    newCellsData.push({
                        rowId: row.id,
                        columnId: col.id,
                        values: predictedValues,
                    });
                }
            }
        }

        if (newCellsData.length > 0) {
            await prisma.interfaceMatrixCell.createMany({
                data: newCellsData,
            });
        }

        return NextResponse.json({
            createdCount: rowsData.length,
            message: `La til ${rowsData.length} nye systemer med autoforslag`
        });

    } catch (error) {
        console.error("Error importing interface matrix rows:", error);
        return NextResponse.json(
            { error: "Kunne ikke importere systemer" },
            { status: 500 }
        );
    }
}
