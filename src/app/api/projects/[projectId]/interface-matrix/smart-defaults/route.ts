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

        const { searchParams } = new URL(request.url);
        const systemCode = searchParams.get("systemCode");

        if (!systemCode) {
            return NextResponse.json({ predictions: {} });
        }

        // Determine prefix (e.g. "360.001" -> "360")
        // If dot exists, take first part. If not, use whole code?
        // Use heuristic: part before first dot
        const prefix = systemCode.split(".")[0];

        if (!prefix) {
            return NextResponse.json({ predictions: {} });
        }

        // specific restriction: length should be at least 2 to be meaningful
        if (prefix.length < 2) {
            return NextResponse.json({ predictions: {} });
        }

        // Find rows with same prefix in the SAME project
        const matrix = await prisma.interfaceMatrix.findUnique({
            where: { projectId },
        });

        if (!matrix) {
            return NextResponse.json({ predictions: {} });
        }

        const similarRows = await prisma.interfaceMatrixRow.findMany({
            where: {
                matrixId: matrix.id,
                systemCode: { startsWith: prefix },
                NOT: { systemCode: systemCode }, // Exclude self
            },
            include: {
                cells: {
                    include: { column: true }
                }
            },
            take: 50, // Limit sample size
        });

        if (similarRows.length === 0) {
            return NextResponse.json({ predictions: {} });
        }

        // Aggregate values per discipline
        // structure: { [discipline]: { [value]: count } }
        const stats: Record<string, Record<string, number>> = {};
        const columnCounts: Record<string, number> = {};

        for (const row of similarRows) {
            for (const cell of row.cells) {
                if (!cell.column.discipline) continue;
                const discipline = cell.column.discipline;

                if (!stats[discipline]) stats[discipline] = {};
                if (!columnCounts[discipline]) columnCounts[discipline] = 0;

                columnCounts[discipline]++;

                const values = Array.isArray(cell.values) ? cell.values as string[] : [];
                for (const val of values) {
                    stats[discipline][val] = (stats[discipline][val] || 0) + 1;
                }
            }
        }

        // Filter prediction (threshold > 50%)
        // The user said "høyest gjennomsnitt".
        // Let's take any value that appears in > 50% of the non-empty cells for that discipline?
        // Or just the most frequent?
        // User: "om Elektro ikke fikk kable og koble på 360.001 sist, men har hatt det på de 20 andre systemene..."
        // Implies we look at the majority.

        const predictions: Record<string, string[]> = {};

        for (const discipline in stats) {
            const valueCounts = stats[discipline];
            const totalRows = columnCounts[discipline]; // Number of rows that had *any* data? 
            // Actually simpler: Total rows with *same prefix*.
            // But we only iterated rows that have cells. 
            // Let's use `similarRows.length` as denominator? 
            // If 20 rows exist, and 10 have "Montasje", is that 50%?
            // Yes.

            const threshold = similarRows.length * 0.5;
            const predictedValues: string[] = [];

            for (const [val, count] of Object.entries(valueCounts)) {
                if (count >= threshold) {
                    predictedValues.push(val);
                }
            }

            if (predictedValues.length > 0) {
                predictions[discipline] = predictedValues;
            }
        }

        return NextResponse.json({ predictions });

    } catch (error) {
        console.error("Error predicting defaults:", error);
        return NextResponse.json({ predictions: {} }, { status: 500 });
    }
}
