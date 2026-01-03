import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/auth-helpers";
import {
    getHolidaysInRange,
    subtractBusinessDays
} from "@/lib/norwegian-holidays";
import { addMonths, startOfDay } from "date-fns";

export interface GanttItem {
    id: string;
    type: "MC_PROTOCOL" | "FUNCTION_TEST" | "MILESTONE";
    systemCode: string;
    systemName: string | null;
    subType?: string; // For function tests: category or test type
    startDate: string | null;
    endDate: string | null;
    status: string;
    href: string;
    isMilestone?: boolean;
    milestoneType?: "holiday" | "programansvarlig";
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
                href: `/syslink/projects/${projectId}/protocols/${p.id}`,
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
            // Parse dates from JSON field
            const dates = ft.dates as Record<string, { start?: string; end?: string }> | null;
            // Helper to parse date string
            const parseDate = (dateStr?: string) => dateStr ? new Date(dateStr) : null;

            let hasEmitted = false;
            let earliestDate: Date | null = null;

            const phases = [
                { key: "ioTesting", label: "I/O-test" },
                { key: "egentest", label: "Egentest" },
                { key: "funksjonstest", label: "Funksjonstest" }
            ] as const;

            // 1. Create items for each phase with dates
            if (dates) {
                for (const phase of phases) {
                    const phaseData = dates[phase.key];
                    const startRaw = phaseData?.start;
                    const endRaw = phaseData?.end;

                    if (startRaw) {
                        const startDate = parseDate(startRaw);
                        const endDate = parseDate(endRaw) || startDate;

                        if (startDate && !isNaN(startDate.getTime())) {
                            if (!earliestDate || startDate < earliestDate) {
                                earliestDate = startDate;
                            }

                            // Calculate status for this phase
                            let phaseRows = ft.rows;
                            if (phase.key === "egentest") {
                                phaseRows = ft.rows.filter(r => r.testParticipation === "Egentest" || r.testParticipation === "Begge");
                            } else if (phase.key === "funksjonstest") {
                                phaseRows = ft.rows.filter(r => r.testParticipation === "Funksjonstest" || r.testParticipation === "Begge");
                            }
                            // ioTesting uses all rows

                            const totalRows = phaseRows.length;
                            const completedRows = phaseRows.filter(r => r.status === "COMPLETED").length;
                            let status = "NOT_STARTED";
                            if (totalRows > 0) {
                                if (completedRows === totalRows) status = "COMPLETED";
                                else if (completedRows > 0) status = "IN_PROGRESS";
                            }

                            items.push({
                                id: `${ft.id}-${phase.key}`,
                                type: "FUNCTION_TEST",
                                systemCode: ft.systemCode,
                                systemName: ft.systemName,
                                subType: phase.label,
                                startDate: startDate.toISOString(),
                                endDate: endDate ? endDate.toISOString() : null,
                                status,
                                href: `/syslink/projects/${projectId}/protocols/function-tests/${ft.id}`,
                            });
                            hasEmitted = true;
                        }
                    }
                }
            }

            // 2. If no scheduled phases, add a generic unscheduled item
            if (!hasEmitted) {
                // Calculate overall status
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
                    subType: "Funksjonstest",
                    startDate: null,
                    endDate: null,
                    status,
                    href: `/syslink/projects/${projectId}/protocols/function-tests/${ft.id}`,
                });
            }

            // 3. Add Programansvarlig milestone (15 business days before I/O test or earliest date)
            if (earliestDate) {
                const ioTestStart = parseDate(dates?.ioTesting?.start);
                const referenceDate = ioTestStart || earliestDate;

                // Calculate 15 business days before reference date
                const programansvarligDate = subtractBusinessDays(referenceDate, 15);

                items.push({
                    id: `${ft.id}-programansvarlig`,
                    type: "MILESTONE",
                    systemCode: ft.systemCode,
                    systemName: ft.systemName,
                    subType: "Programansvarlig",
                    startDate: programansvarligDate.toISOString(),
                    endDate: programansvarligDate.toISOString(),
                    status: "NOT_STARTED",
                    href: `/syslink/projects/${projectId}/protocols/function-tests/${ft.id}`,
                    isMilestone: true,
                    milestoneType: "programansvarlig",
                });
            }
        }

        // Add Norwegian holidays as milestones for the visible date range
        // Get date range from items (or use current + 12 months if no items)
        const today = startOfDay(new Date());
        let minDate = today;
        let maxDate = addMonths(today, 12);

        for (const item of items) {
            if (item.startDate) {
                const d = new Date(item.startDate);
                if (d < minDate) minDate = d;
                if (d > maxDate) maxDate = d;
            }
            if (item.endDate) {
                const d = new Date(item.endDate);
                if (d > maxDate) maxDate = d;
            }
        }

        // Extend range by 1 month on each side
        minDate = addMonths(minDate, -1);
        maxDate = addMonths(maxDate, 1);

        const holidays = getHolidaysInRange(minDate, maxDate);
        for (const holiday of holidays) {
            items.push({
                id: `holiday-${holiday.date.toISOString()}`,
                type: "MILESTONE",
                systemCode: holiday.name,
                systemName: null,
                subType: "Helligdag",
                startDate: holiday.date.toISOString(),
                endDate: holiday.date.toISOString(),
                status: "NA",
                href: "#",
                isMilestone: true,
                milestoneType: "holiday",
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
