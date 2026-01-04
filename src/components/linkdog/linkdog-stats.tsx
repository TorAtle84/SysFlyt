"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface StatsData {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    totalCostNok: number;
    history: { date: string; costUsd: number; costNok: number; }[];
}

export function LinkDogStats() {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/linkdog/stats")
            .then(res => res.json())
            .then(data => setStats(data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    if (!stats) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>📊 Forbruk og Kostnader</CardTitle>
                <CardDescription>
                    Oversikt over token-bruk og estimert kostnad for LinkDog.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Totalt Forbruk (NOK)</p>
                        <p className="text-2xl font-bold text-green-600">
                            {stats.totalCostNok.toFixed(2)} kr
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Meldinger</p>
                        <p className="text-2xl font-bold">{stats.totalRequests}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Input Tokens</p>
                        <p className="text-xl font-mono">{stats.totalInputTokens.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Output Tokens</p>
                        <p className="text-xl font-mono">{stats.totalOutputTokens.toLocaleString()}</p>
                    </div>
                </div>

                <div className="h-[250px] w-full mt-4">
                    <p className="text-xs text-muted-foreground mb-2">Siste 30 dager (NOK)</p>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.history}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(value) => value.split('-').slice(1).join('/')}
                                fontSize={12}
                            />
                            <YAxis fontSize={12} width={40} />
                            <Tooltip
                                formatter={(value: any) => [`${Number(value).toFixed(2)} kr`, 'Kostnad']}
                                labelFormatter={(label) => label}
                            />
                            <Bar dataKey="costNok" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
