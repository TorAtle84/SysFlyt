"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectSidebar } from "@/components/pages/project/project-sidebar";
import { MassListUpload } from "@/components/pages/project/mass-list/mass-list-upload";
import { MassListTable } from "@/components/pages/project/mass-list/mass-list-table";
import { Separator } from "@/components/ui/separator";
import { use } from "react";

export default function MassListPage({ params }: { params: Promise<{ projectId: string }> }) {
    const { projectId } = use(params);
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/mass-list`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/projects/${projectId}/mass-list?id=${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setData((prev) => prev.filter((item) => item.id !== id));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteAll = async () => {
        if (!confirm("Er du sikker på at du vil slette HELE masselisten?")) return;
        try {
            const res = await fetch(`/api/projects/${projectId}/mass-list?all=true`, {
                method: "DELETE",
            });
            if (res.ok) {
                setData([]);
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <AppShell sidebar={<ProjectSidebar projectId={projectId} />}>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Masseliste</h1>
                    <p className="text-muted-foreground">
                        Last opp og administrer masselister for prosjektet.
                    </p>
                </div>

                <MassListUpload projectId={projectId} onUploadComplete={loadData} />

                <Separator />

                <MassListTable data={data} onDelete={handleDelete} onDeleteAll={handleDeleteAll} />
            </div>
        </AppShell>
    );
}
