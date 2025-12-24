"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    addDays,
    addMonths,
    addWeeks,
    addYears,
    differenceInDays,
    differenceInWeeks,
    differenceInMonths,
    eachWeekOfInterval,
    eachMonthOfInterval,
    eachYearOfInterval,
    endOfWeek,
    endOfMonth,
    endOfYear,
    format,
    startOfWeek,
    startOfMonth,
    startOfYear,
    startOfDay,
    isSameWeek,
    isSameMonth,
    isSameYear,
} from "date-fns";
import { nb } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, ClipboardCheck, Diamond, ListChecks, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface GanttItem {
    id: string;
    type: "MC_PROTOCOL" | "FUNCTION_TEST" | "MILESTONE";
    systemCode: string;
    systemName: string | null;
    subType?: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    href: string;
    isMilestone?: boolean;
    milestoneType?: "holiday" | "programansvarlig";
}

type ZoomLevel = "week" | "month" | "year";

interface GanttChartProps {
    projectId: string;
}

// Range options for each zoom level
const rangeOptions: Record<ZoomLevel, number[]> = {
    week: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    month: [1, 2, 3, 4, 5, 6],
    year: [1],
};

export function GanttChart({ projectId }: GanttChartProps) {
    const router = useRouter();
    const timelineRef = useRef<HTMLDivElement>(null);
    const [items, setItems] = useState<GanttItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("month");
    const [range, setRange] = useState(3); // How many units ahead from today
    const [offset, setOffset] = useState(0); // Shift from center (today)

    const today = useMemo(() => startOfDay(new Date()), []);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch(`/api/projects/${projectId}/progress/gantt`);
                if (res.ok) {
                    const data = await res.json();
                    setItems(data.items || []);
                }
            } catch (error) {
                console.error("Error fetching Gantt data:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [projectId]);

    // Reset offset when zoom level or range changes
    useEffect(() => {
        setOffset(0);
    }, [zoomLevel, range]);

    // Filter items with dates
    const itemsWithDates = useMemo(
        () => items.filter((item) => item.startDate),
        [items]
    );

    // Calculate view range based on zoom level
    const { viewStart, viewEnd, columns, columnWidth, unitWidth } = useMemo(() => {
        let start: Date;
        let end: Date;
        let cols: { date: Date; label: string; isCurrentPeriod: boolean }[] = [];
        let width: number; // Width per unit (week/month/year)
        let unitW: number; // Pixel width per day for bar calculations

        switch (zoomLevel) {
            case "week": {
                // Each column is a week
                const weeksBack = 1 + offset;
                const weeksForward = range + offset;
                start = startOfWeek(addWeeks(today, -weeksBack), { locale: nb });
                end = endOfWeek(addWeeks(today, weeksForward), { locale: nb });
                width = 120; // px per week
                unitW = width / 7;
                cols = eachWeekOfInterval({ start, end }, { locale: nb }).map((date) => ({
                    date,
                    label: `Uke ${format(date, "w", { locale: nb })}`,
                    isCurrentPeriod: isSameWeek(date, today, { locale: nb }),
                }));
                break;
            }
            case "month": {
                // Each column is a month
                const monthsBack = 1 + offset;
                const monthsForward = range + offset;
                start = startOfMonth(addMonths(today, -monthsBack));
                end = endOfMonth(addMonths(today, monthsForward));
                width = 150; // px per month
                unitW = width / 30; // approx days per month
                cols = eachMonthOfInterval({ start, end }).map((date) => ({
                    date,
                    label: format(date, "MMM yyyy", { locale: nb }),
                    isCurrentPeriod: isSameMonth(date, today),
                }));
                break;
            }
            case "year": {
                // Each column is a year
                const yearsBack = 0 + offset;
                const yearsForward = range + offset;
                start = startOfYear(addYears(today, -yearsBack));
                end = endOfYear(addYears(today, yearsForward));
                width = 200; // px per year
                unitW = width / 365;
                cols = eachYearOfInterval({ start, end }).map((date) => ({
                    date,
                    label: format(date, "yyyy", { locale: nb }),
                    isCurrentPeriod: isSameYear(date, today),
                }));
                break;
            }
        }

        return { viewStart: start, viewEnd: end, columns: cols, columnWidth: width, unitWidth: unitW };
    }, [zoomLevel, range, offset, today]);

    // Calculate position of today marker
    const todayMarkerPosition = useMemo(() => {
        const daysFromStart = differenceInDays(today, viewStart);
        return daysFromStart * unitWidth;
    }, [today, viewStart, unitWidth]);

    // Navigate view
    const navigate = (direction: "prev" | "next") => {
        setOffset((prev) => prev + (direction === "prev" ? -1 : 1));
    };

    // Calculate bar position and width
    const getBarStyle = (item: GanttItem) => {
        if (!item.startDate) return null;

        const start = new Date(item.startDate);
        const end = item.endDate ? new Date(item.endDate) : addDays(start, 1);

        const daysFromViewStart = differenceInDays(start, viewStart);
        const duration = Math.max(1, differenceInDays(end, start));

        const left = daysFromViewStart * unitWidth;
        const width = duration * unitWidth;

        const totalWidth = columns.length * columnWidth;

        // Only show if visible in viewport
        if (left + width < 0 || left > totalWidth) {
            return null;
        }

        return {
            left: Math.max(0, left),
            width: Math.min(width, totalWidth - Math.max(0, left)),
        };
    };

    // Get status color
    const getStatusColor = (status: string) => {
        switch (status) {
            case "COMPLETED":
            case "APPROVED":
                return "bg-green-500";
            case "IN_PROGRESS":
                return "bg-blue-500";
            default:
                return "bg-gray-400";
        }
    };

    // Handle range change
    const handleRangeChange = (value: string) => {
        setRange(parseInt(value, 10));
    };

    // Handle zoom level change
    const handleZoomChange = (value: ZoomLevel) => {
        setZoomLevel(value);
        // Set default range for new zoom level
        setRange(value === "year" ? 1 : value === "month" ? 3 : 4);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (itemsWithDates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <Calendar className="h-16 w-16" />
                <p className="text-lg">Ingen protokoller eller tester med planlagte datoer</p>
                <p className="text-sm">Legg til start- og sluttdato på protokoller for å se dem her</p>
            </div>
        );
    }

    const totalWidth = columns.length * columnWidth;

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => navigate("next")}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    {/* Range selector */}
                    <Select value={range.toString()} onValueChange={handleRangeChange}>
                        <SelectTrigger className="w-24">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {rangeOptions[zoomLevel].map((n) => (
                                <SelectItem key={n} value={n.toString()}>
                                    +{n} {zoomLevel === "week" ? "uker" : zoomLevel === "month" ? "mnd" : "år"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button variant="outline" size="icon" onClick={() => navigate("prev")}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>

                    <span className="text-sm text-muted-foreground ml-2">
                        {format(viewStart, "d. MMM", { locale: nb })} – {format(viewEnd, "d. MMM yyyy", { locale: nb })}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Visning:</span>
                    <Select value={zoomLevel} onValueChange={(v) => handleZoomChange(v as ZoomLevel)}>
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="week">Uke</SelectItem>
                            <SelectItem value="month">Måned</SelectItem>
                            <SelectItem value="year">År</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Gantt Container */}
            <div className="flex-1 overflow-auto" ref={timelineRef}>
                <div className="flex min-h-full">
                    {/* Left sidebar - Item labels */}
                    <div className="w-64 flex-shrink-0 border-r bg-card sticky left-0 z-20">
                        {/* Header */}
                        <div className="h-12 border-b flex items-center px-4 font-medium text-sm bg-muted/50">
                            System / Test
                        </div>
                        {/* Items */}
                        {itemsWithDates.map((item) => (
                            <div
                                key={item.id}
                                className={cn(
                                    "h-12 border-b flex items-center gap-2 px-4 transition-colors",
                                    item.isMilestone
                                        ? "bg-muted/30"
                                        : "hover:bg-muted/50 cursor-pointer"
                                )}
                                onClick={() => !item.isMilestone && item.href !== "#" && router.push(item.href)}
                            >
                                {item.type === "MC_PROTOCOL" ? (
                                    <ClipboardCheck className="h-4 w-4 text-orange-500 flex-shrink-0" />
                                ) : item.type === "MILESTONE" ? (
                                    <Diamond className={cn(
                                        "h-4 w-4 flex-shrink-0",
                                        item.milestoneType === "holiday"
                                            ? "text-red-500"
                                            : "text-purple-500"
                                    )} />
                                ) : (
                                    <ListChecks className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">{item.systemCode}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        {item.type === "MC_PROTOCOL"
                                            ? "Protokoll MC"
                                            : item.type === "MILESTONE"
                                                ? item.subType
                                                : "Funksjonstest"}
                                        {item.type === "FUNCTION_TEST" && item.subType && ` · ${item.subType}`}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right side - Timeline */}
                    <div className="flex-1 overflow-x-auto relative">
                        <div style={{ width: totalWidth, minWidth: "100%" }}>
                            {/* Timeline header */}
                            <div className="h-12 border-b flex bg-muted/50 sticky top-0 z-10">
                                {columns.map((col, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "flex items-center justify-center text-xs font-medium border-r",
                                            col.isCurrentPeriod && "bg-orange-100 dark:bg-orange-900/20"
                                        )}
                                        style={{ width: columnWidth }}
                                    >
                                        {col.label}
                                    </div>
                                ))}
                            </div>

                            {/* Bars with today marker */}
                            <div className="relative">
                                {/* Today marker - vertical orange line */}
                                {todayMarkerPosition >= 0 && todayMarkerPosition <= totalWidth && (
                                    <div
                                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10"
                                        style={{ left: todayMarkerPosition }}
                                    >
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                                            I dag
                                        </div>
                                    </div>
                                )}

                                {itemsWithDates.map((item) => {
                                    const barStyle = getBarStyle(item);

                                    return (
                                        <div
                                            key={item.id}
                                            className="h-12 border-b relative"
                                            style={{ width: totalWidth }}
                                        >
                                            {/* Grid lines */}
                                            <div className="absolute inset-0 flex">
                                                {columns.map((col, i) => (
                                                    <div
                                                        key={i}
                                                        className={cn(
                                                            "border-r border-border/30",
                                                            col.isCurrentPeriod && "bg-orange-50 dark:bg-orange-900/10"
                                                        )}
                                                        style={{ width: columnWidth }}
                                                    />
                                                ))}
                                            </div>

                                            {/* Bar or Milestone */}
                                            {barStyle && (
                                                item.isMilestone ? (
                                                    // Render milestone as diamond
                                                    <div
                                                        className={cn(
                                                            "absolute top-2 flex items-center justify-center",
                                                            item.milestoneType === "holiday"
                                                                ? "text-red-500"
                                                                : "text-purple-500"
                                                        )}
                                                        style={{
                                                            left: barStyle.left - 12,
                                                        }}
                                                        title={`${item.systemCode}${item.subType ? ` - ${item.subType}` : ""}`}
                                                    >
                                                        <Diamond className="h-6 w-6 fill-current" />
                                                    </div>
                                                ) : (
                                                    // Render regular bar
                                                    <div
                                                        className={cn(
                                                            "absolute top-2 h-8 rounded cursor-pointer transition-all hover:opacity-80 flex items-center px-2 text-white text-xs font-medium shadow-sm",
                                                            getStatusColor(item.status)
                                                        )}
                                                        style={{
                                                            left: barStyle.left,
                                                            width: Math.max(barStyle.width, 24),
                                                        }}
                                                        onClick={() => router.push(item.href)}
                                                        title={`${item.systemCode} - ${item.type === "MC_PROTOCOL" ? "Protokoll MC" : "Funksjonstest"}`}
                                                    >
                                                        <span className="truncate">
                                                            {barStyle.width > 60 ? item.systemCode : ""}
                                                        </span>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 px-4 py-2 border-t bg-card text-sm flex-wrap">
                <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-orange-500" />
                    <span>Protokoll MC</span>
                </div>
                <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-blue-500" />
                    <span>Funksjonstest</span>
                </div>
                <div className="flex items-center gap-2">
                    <Diamond className="h-4 w-4 text-purple-500 fill-purple-500" />
                    <span>Programansvarlig</span>
                </div>
                <div className="flex items-center gap-2">
                    <Diamond className="h-4 w-4 text-red-500 fill-red-500" />
                    <span>Helligdag</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-orange-500" />
                    <span>I dag</span>
                </div>
                <div className="flex items-center gap-4 ml-auto">
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-gray-400" />
                        <span className="text-muted-foreground">Ikke startet</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-blue-500" />
                        <span className="text-muted-foreground">Pågår</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-green-500" />
                        <span className="text-muted-foreground">Fullført</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
