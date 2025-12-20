"use client";

import { useState } from "react";
import { Trash2, Search, AlertTriangle, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

export interface MassListItem {
  id: string;
  typeCode: string | null;
  description: string | null;
  tfm?: string | null;
  building?: string | null;
  system?: string | null;
  component?: string | null;
  productName?: string | null;
  supplierName?: string | null;
  location?: string | null;
  zone?: string | null;
}

interface MassListTableProps {
  data: MassListItem[];
  projectName?: string;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
}

export function MassListTable({ data, projectName, onDelete, onDeleteAll }: MassListTableProps) {
  const [search, setSearch] = useState("");
  const [systemFilter, setSystemFilter] = useState<string>("all");

  const uniqueSystems = [...new Set(data.map((item) => item.system).filter(Boolean))] as string[];

  const filtered = data.filter((item) => {
    const matchesSearch =
      (item.typeCode?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (item.tfm?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (item.description?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (item.productName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (item.supplierName?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (item.building?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (item.location?.toLowerCase() || "").includes(search.toLowerCase());

    const matchesSystem = systemFilter === "all" || item.system === systemFilter;

    return matchesSearch && matchesSystem;
  });

  function handleExport() {
    const exportData = filtered.map((item) => ({
      "TFM-kode": item.tfm || item.typeCode || "",
      "Byggnr": item.building || "",
      "System": item.system || "",
      "Komponent": item.component || "",
      "Typekode": item.typeCode || "",
      "Leverandør": item.supplierName || "",
      "Produktnavn": item.productName || "",
      "Plassering": item.location || "",
      "Sone": item.zone || "",
      "Beskrivelse": item.description || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Masseliste");

    const colWidths = [
      { wch: 20 },
      { wch: 10 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
      { wch: 15 },
      { wch: 30 },
    ];
    worksheet["!cols"] = colWidths;

    const filename = `masseliste${projectName ? `_${projectName.replace(/\s+/g, "_")}` : ""}_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="mx-auto mb-4 text-muted-foreground" size={48} />
          <p className="text-muted-foreground">Ingen oppføringer i masselisten</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Last opp en Excel-fil for å legge til oppføringer
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="text-primary" size={20} />
            Masseliste
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length} av {data.length} oppføringer
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={14} className="mr-1" />
            Eksporter
          </Button>
          <Button variant="destructive" size="sm" onClick={onDeleteAll}>
            <Trash2 size={14} className="mr-1" />
            Slett alle
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              placeholder="Søk etter TFM-kode, produkt, plassering..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {uniqueSystems.length > 0 && (
            <Select value={systemFilter} onValueChange={setSystemFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Alle systemer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle systemer</SelectItem>
                {uniqueSystems.map((system) => (
                  <SelectItem key={system} value={system}>
                    System {system}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-3 md:hidden">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-primary">
                      {item.tfm || item.typeCode || "-"}
                    </span>
                    {item.system ? (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        System {item.system}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-foreground line-clamp-2">
                    {item.productName || item.description || "-"}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(item.id)}
                  className="h-10 w-10 text-muted-foreground hover:text-red-500"
                  title="Slett"
                >
                  <Trash2 size={16} />
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="truncate">
                  <span className="font-medium text-foreground/80">Bygg:</span>{" "}
                  {item.building || "-"}
                </div>
                <div className="truncate">
                  <span className="font-medium text-foreground/80">Sone:</span>{" "}
                  {item.zone || "-"}
                </div>
                <div className="truncate">
                  <span className="font-medium text-foreground/80">Komponent:</span>{" "}
                  {item.component || "-"}
                </div>
                <div className="truncate">
                  <span className="font-medium text-foreground/80">Type:</span>{" "}
                  {item.typeCode || "-"}
                </div>
                <div className="col-span-2 truncate">
                  <span className="font-medium text-foreground/80">Plassering:</span>{" "}
                  {item.location || "-"}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px]">
            <thead className="bg-muted/50">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="py-3 px-4 font-medium whitespace-nowrap">TFM-kode</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Bygg</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">System</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Komponent</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Typekode</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Leverandør</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Produkt</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Plassering</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Sone</th>
                <th className="py-3 px-4 font-medium whitespace-nowrap">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-border text-sm hover:bg-muted/30"
                >
                  <td className="py-3 px-4">
                    <span className="font-mono font-medium text-primary whitespace-nowrap">
                      {item.tfm || "-"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-foreground whitespace-nowrap">
                    {item.building || "-"}
                  </td>
                  <td className="py-3 px-4">
                    {item.system ? (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        {item.system}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {item.component ? (
                      <span className="font-mono text-xs text-foreground whitespace-nowrap">
                        {item.component}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {item.typeCode ? (
                      <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {item.typeCode}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-3 px-4 text-foreground">
                    <span className="max-w-[200px] truncate inline-block" title={item.supplierName || undefined}>
                      {item.supplierName || "-"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-foreground">
                    <span className="max-w-[200px] truncate inline-block" title={item.productName || undefined}>
                      {item.productName || "-"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    <span className="max-w-[150px] truncate inline-block" title={item.location || undefined}>
                      {item.location || "-"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                    {item.zone || "-"}
                  </td>
                  <td className="py-3 px-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(item.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (search || systemFilter !== "all") && (
          <div className="py-8 text-center text-muted-foreground">
            <p>Ingen resultater for gjeldende filter</p>
            <Button
              variant="link"
              className="mt-2"
              onClick={() => {
                setSearch("");
                setSystemFilter("all");
              }}
            >
              Nullstill filter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
