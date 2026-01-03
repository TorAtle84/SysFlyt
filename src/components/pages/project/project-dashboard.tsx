"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
    ClipboardList,
    CheckCircle2,
    AlertTriangle,
    TrendingUp,
    Activity,
    FileText,
    MessageSquare,
    AlertCircle,
    Calendar,
    ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardStats {
    protocols: {
        mc: number;
        functionTest: number;
        total: number;
    };
    completion: {
        completed: number;
        total: number;
        percentage: number;
    };
    deviations: {
        open: number;
        closed: number;
    };
    ganttTasks: {
        id: string;
        name: string;
        startDate: string;
        endDate: string;
        progress: number;
        color?: string;
    }[];
    recentActivity: {
        type: "document" | "comment" | "ncr";
        message: string;
        user: string;
        timestamp: string;
    }[];
}

interface ProjectDashboardProps {
    projectId: string;
}

export function ProjectDashboard({ projectId }: ProjectDashboardProps) {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await fetch(`/api/projects/${projectId}/dashboard-stats`);
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                }
            } catch (error) {
                console.error("Failed to fetch dashboard stats:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, [projectId]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-28" />
                    ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-64" />
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                    Kunne ikke laste dashboard-data
                </CardContent>
            </Card>
        );
    }

    const activityIcon = (type: string) => {
        switch (type) {
            case "document":
                return <FileText className="h-4 w-4 text-info" />;
            case "comment":
                return <MessageSquare className="h-4 w-4 text-success" />;
            case "ncr":
                return <AlertCircle className="h-4 w-4 text-warning" />;
            default:
                return <Activity className="h-4 w-4" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Protocols */}
                <Card>
                    <CardContent className="flex items-center gap-4 p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                            <ClipboardList className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground">Protokoller</p>
                            <p className="text-2xl font-bold">{stats.protocols.total}</p>
                            <p className="text-xs text-muted-foreground">
                                MC: {stats.protocols.mc} • Funk: {stats.protocols.functionTest}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Completion */}
                <Card>
                    <CardContent className="flex items-center gap-4 p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10">
                            <CheckCircle2 className="h-6 w-6 text-success" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground">Utført</p>
                            <p className="text-2xl font-bold">
                                {stats.completion.completed}
                                <span className="text-base font-normal text-muted-foreground">
                                    {" "}/ {stats.completion.total}
                                </span>
                            </p>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full bg-success transition-all"
                                    style={{ width: `${stats.completion.percentage}%` }}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Deviations */}
                <Card>
                    <CardContent className="flex items-center gap-4 p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
                            <AlertTriangle className="h-6 w-6 text-warning" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-muted-foreground">Åpne avvik</p>
                            <p className="text-2xl font-bold">{stats.deviations.open}</p>
                            <p className="text-xs text-muted-foreground">
                                Lukket: {stats.deviations.closed}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Lower Section */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Gantt Preview */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <TrendingUp className="h-4 w-4" />
                            Fremdrift (2 uker)
                        </CardTitle>
                        <Link
                            href={`/syslink/projects/${projectId}/gantt`}
                            className="flex items-center gap-1 text-xs text-info hover:underline"
                        >
                            Se full Gantt
                            <ChevronRight className="h-3 w-3" />
                        </Link>
                    </CardHeader>
                    <CardContent>
                        {stats.ganttTasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Calendar className="mb-2 h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                    Ingen oppgaver denne perioden
                                </p>
                                <Link
                                    href={`/syslink/projects/${projectId}/gantt`}
                                    className="mt-2 text-xs text-info hover:underline"
                                >
                                    Legg til oppgaver i Gantt
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {stats.ganttTasks.slice(0, 5).map((task) => (
                                    <div key={task.id} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="truncate font-medium">{task.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {task.progress}%
                                            </span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full transition-all"
                                                style={{
                                                    width: `${task.progress}%`,
                                                    backgroundColor: task.color || "#3b82f6",
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Activity className="h-4 w-4" />
                            Siste aktivitet
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {stats.recentActivity.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Activity className="mb-2 h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                    Ingen aktivitet enda
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stats.recentActivity.map((activity, index) => (
                                    <div key={index} className="flex gap-3">
                                        <div className="mt-0.5">{activityIcon(activity.type)}</div>
                                        <div className="flex-1 space-y-1">
                                            <p className="text-sm leading-tight">{activity.message}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{activity.user}</span>
                                                <span>•</span>
                                                <span>
                                                    {formatDistanceToNow(new Date(activity.timestamp), {
                                                        addSuffix: true,
                                                        locale: nb,
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
