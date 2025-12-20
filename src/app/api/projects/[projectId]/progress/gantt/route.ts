import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";

export interface GanttItem {
    id: string;
    type: "MC_PROTOCOL" | "FUNCTION_TEST";
    systemCode: string;
    systemName: string | null;
    subType?: string; // For function tests: category or test type
    startDate: string | null;
    endDate: string | null;
    status: string;
    href: string;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;

        const authResult = await requireProjectAccess(projectId);
        if (!authResult.success) {
            return authResult.error;
        }

        const items: GanttItem[] = [];

        // Fetch MC Protocols with dates
        const protocols = await prisma.mCProtocol.findMany({
            where: { projectId },
            select: {
                id: true,
                systemCode: true,
                systemName: true,
                startTime: true,
                endTime: true,
                status: true,
            },
        });

        for (const p of protocols) {
            items.push({
                id: p.id,
                type: "MC_PROTOCOL",
                systemCode: p.systemCode,
                systemName: p.systemName,
                startDate: p.startTime?.toISOString() || null,
                endDate: p.endTime?.toISOString() || null,
                status: p.status,
                href: `/projects/${projectId}/protocols/${p.id}`,
            });
        }

        // Fetch Function Tests with dates
        const functionTests = await prisma.functionTest.findMany({
            where: { projectId },
            select: {
                id: true,
                systemCode: true,
                systemName: true,
                dates: true,
                rows: {
                    select: {
                        status: true,
                        category: true,
                        testParticipation: true,
                    },
                },
            },
        });

        for (const ft of functionTests) {
            // Parse dates from JSON field - structure is: { ioTesting: { start, end }, egentest: { start, end }, funksjonstest: { start, end } }
            const dates = ft.dates as Record<string, { start?: string; end?: string }> | null;

            // Helper to parse date string
            const parseDate = (dateStr?: string) => dateStr ? new Date(dateStr) : null;

            // Extract all valid dates from all phases
            const allStartDates: Date[] = [];
            const allEndDates: Date[] = [];
            const phases: string[] = [];

            if (dates && typeof dates === 'object') {
                for (const [phase, phaseData] of Object.entries(dates)) {
                    if (phaseData && typeof phaseData === 'object') {
                        const start = parseDate(phaseData.start);
                        const end = parseDate(phaseData.end);
                        if (start && !isNaN(start.getTime())) {
                            allStartDates.push(start);
                            phases.push(phase);
                        }
                        if (end && !isNaN(end.getTime())) {
                            allEndDates.push(end);
                        }
                    }
                }
            }

            // Get earliest start and latest end
            const startDate = allStartDates.length > 0
                ? new Date(Math.min(...allStartDates.map(d => d.getTime())))
                : null;
            const endDate = allEndDates.length > 0
                ? new Date(Math.max(...allEndDates.map(d => d.getTime())))
                : null;

            // Map phase keys to human-readable labels
            const phaseLabels: Record<string, string> = {
                ioTesting: "I/O Test",
                egentest: "Egentest",
                funksjonstest: "Funksjonstest",
            };

            // Get the primary phase label (prioritize funksjonstest > egentest > ioTesting)
            const phaseOrder = ["funksjonstest", "egentest", "ioTesting"];
            const primaryPhase = phaseOrder.find(p => phases.includes(p)) || phases[0];
            const subType = primaryPhase ? phaseLabels[primaryPhase] || primaryPhase : undefined;

            // Derive status from rows
            const totalRows = ft.rows.length;
            const completedRows = ft.rows.filter((r) => r.status === "COMPLETED").length;
            const status = totalRows === 0
                ? "NOT_STARTED"
                : completedRows === totalRows
                    ? "COMPLETED"
                    : completedRows > 0
                        ? "IN_PROGRESS"
                        : "NOT_STARTED";

            items.push({
                id: ft.id,
                type: "FUNCTION_TEST",
                systemCode: ft.systemCode,
                systemName: ft.systemName,
                subType,
                startDate: startDate?.toISOString() || null,
                endDate: endDate?.toISOString() || null,
                status,
                href: `/projects/${projectId}/protocols/function-tests/${ft.id}`,
            });
        }

        // Sort by start date (items without dates last)
        items.sort((a, b) => {
            if (!a.startDate && !b.startDate) return 0;
            if (!a.startDate) return 1;
            if (!b.startDate) return -1;
            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        });

        return NextResponse.json({ items });
    } catch (error) {
        console.error("Error fetching Gantt data:", error);
        return NextResponse.json(
            { error: "Kunne ikke hente fremdriftsdata" },
            { status: 500 }
        );
    }
}
