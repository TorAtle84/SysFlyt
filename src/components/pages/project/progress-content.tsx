"use client";

import {
  TrendingUp,
  FileText,
  List,
  AlertCircle,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProgressStats {
  totalDocuments: number;
  totalMassListItems: number;
  totalAnnotations: number;
  closedAnnotations: number;
  openAnnotations: number;
  completionRate: number;
}

interface ProgressContentProps {
  project: { id: string; name: string };
  stats: ProgressStats;
}

export function ProgressContent({ project, stats }: ProgressContentProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Fremdrift</h1>
        <p className="text-muted-foreground">
          Oversikt over prosjektets status og fremdrift
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dokumenter
            </CardTitle>
            <FileText size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats.totalDocuments}
            </div>
            <p className="text-xs text-muted-foreground">
              Tegninger og skjema
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Masseliste
            </CardTitle>
            <List size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats.totalMassListItems}
            </div>
            <p className="text-xs text-muted-foreground">
              Komponenter registrert
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Åpne avvik
            </CardTitle>
            <AlertCircle size={16} className="text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {stats.openAnnotations}
            </div>
            <p className="text-xs text-muted-foreground">
              Krever oppfølging
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Utført
            </CardTitle>
            <CheckCircle2 size={16} className="text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {stats.closedAnnotations}
            </div>
            <p className="text-xs text-muted-foreground">
              Avvik lukket
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity size={20} />
            Fullføringsgrad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total fremdrift</span>
            <span className="text-2xl font-bold text-foreground">
              {stats.completionRate}%
            </span>
          </div>
          <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-green-500 transition-all duration-500"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avvik per type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-orange-500" />
                <span className="text-sm">Åpne avvik</span>
              </div>
              <span className="font-medium">{stats.openAnnotations}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm">Lukkede avvik</span>
              </div>
              <span className="font-medium">{stats.closedAnnotations}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prosjektstatus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dokumenter</span>
                <span>{stats.totalDocuments} lastet opp</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Masseliste</span>
                <span>{stats.totalMassListItems} komponenter</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Totale avvik</span>
                <span>{stats.totalAnnotations} registrert</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
