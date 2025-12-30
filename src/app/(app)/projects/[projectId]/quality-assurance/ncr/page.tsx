"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Search } from "lucide-react";

type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
};

type LinkedItem = {
  id: string;
  massList?: { tfm?: string | null; system?: string | null; component?: string | null } | null;
};

type NcrRow = {
  id: string;
  title: string;
  status: string;
  category: string;
  severity: string;
  createdAt: string;
  reporter?: UserSummary | null;
  assignee?: UserSummary | null;
  linkedItem?: LinkedItem | null;
  _count?: { comments: number; photos: number };
};

type NcrResponse = {
  items: NcrRow[];
  total: number;
  page: number;
  pageSize: number;
  canSetCompleted: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "P\u00e5g\u00e5r",
  DEVIATION: "Avvik",
  CANCELED: "Avlyst",
  REMEDIATED: "Utbedret",
  COMPLETED: "Fullf\u00f8rt",
};

const CATEGORY_LABELS: Record<string, string> = {
  INSTALLATION: "Installasjon",
  DOCUMENTATION: "Dokumentasjon",
  EQUIPMENT: "Utstyr",
  SAFETY: "Sikkerhet",
  OTHER: "Annet",
};

const SEVERITY_LABELS: Record<string, string> = {
  LOW: "Lav",
  MEDIUM: "Middels",
  HIGH: "H\u00f8y",
  CRITICAL: "Kritisk",
};

function statusTone(status: string) {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "DEVIATION":
      return "danger";
    case "REMEDIATED":
      return "warning";
    case "CANCELED":
      return "muted";
    default:
      return "default";
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default function NcrListPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [data, setData] = useState<NcrResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const fetchNcrs = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      params.set("page", String(page));
      params.set("pageSize", "20");

      const response = await fetch(`/api/projects/${projectId}/ncr?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Kunne ikke hente avvik");
      }
      const payload = (await response.json()) as NcrResponse;
      setData(payload);
    } catch (error) {
      console.error(error);
      toast.error("Kunne ikke hente avvik");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, search, statusFilter, categoryFilter, severityFilter, page]);

  useEffect(() => {
    fetchNcrs();
  }, [fetchNcrs]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, categoryFilter, severityFilter]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const headerSummary = useMemo(() => {
    const completed = items.filter((item) => item.status === "COMPLETED").length;
    const deviations = items.filter((item) => item.status === "DEVIATION").length;
    return { completed, deviations };
  }, [items]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Avvik (NCR)</h1>
          <p className="text-muted-foreground">
            Registrer og f\u00f8lg opp avvik i prosjektet
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={fetchNcrs} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Oppdater
          </Button>
          <Button asChild>
            <Link href={`/projects/${projectId}/quality-assurance/ncr/new`}>
              <Plus className="mr-2 h-4 w-4" />
              Nytt avvik
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totalt antall
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avvik i arbeid
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-semibold">{headerSummary.deviations}</div>
            <Badge tone="danger">Avvik</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fullf\u00f8rt
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-semibold">{headerSummary.completed}</div>
            <Badge tone="success">Fullf\u00f8rt</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="text-lg">Filtrer avvik</CardTitle>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="S\u00f8k etter tittel eller navn..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statuser</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle kategorier</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Alvorlighet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle alvorligheter</SelectItem>
                {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Ingen avvik matcher filteret.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tittel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Alvorlighet</TableHead>
                    <TableHead>Rapportert</TableHead>
                    <TableHead>Tildelt</TableHead>
                    <TableHead>Opprettet</TableHead>
                    <TableHead className="text-center">Kommentarer</TableHead>
                    <TableHead className="text-center">Bilder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const reporter = item.reporter
                      ? `${item.reporter.firstName} ${item.reporter.lastName}`
                      : "-";
                    const assignee = item.assignee
                      ? `${item.assignee.firstName} ${item.assignee.lastName}`
                      : "-";
                    const linkedLabel =
                      item.linkedItem?.massList?.tfm ||
                      [item.linkedItem?.massList?.system, item.linkedItem?.massList?.component]
                        .filter(Boolean)
                        .join("-") ||
                      null;

                    return (
                      <TableRow key={item.id} className="hover:bg-muted/40">
                        <TableCell className="max-w-[240px]">
                          <Link
                            href={`/projects/${projectId}/quality-assurance/ncr/${item.id}`}
                            className="flex flex-col text-sm font-medium text-foreground hover:underline"
                          >
                            {item.title}
                            {linkedLabel && (
                              <span className="text-xs text-muted-foreground">
                                Koblet til {linkedLabel}
                              </span>
                            )}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge tone={statusTone(item.status)}>
                            {STATUS_LABELS[item.status] || item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{CATEGORY_LABELS[item.category] || item.category}</TableCell>
                        <TableCell>{SEVERITY_LABELS[item.severity] || item.severity}</TableCell>
                        <TableCell>{reporter}</TableCell>
                        <TableCell>{assignee}</TableCell>
                        <TableCell>{formatDate(item.createdAt)}</TableCell>
                        <TableCell className="text-center">
                          {item._count?.comments ?? 0}
                        </TableCell>
                        <TableCell className="text-center">
                          {item._count?.photos ?? 0}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-4 flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
              <span>
                Side {page} av {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={!hasPrev}
                >
                  Forrige
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={!hasNext}
                >
                  Neste
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
