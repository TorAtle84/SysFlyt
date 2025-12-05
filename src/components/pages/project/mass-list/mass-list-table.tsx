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

interface MassListItem {
  id: string;
  typeCode: string | null;
  description: string | null;
  tfm?: string | null;
  building?: string | null;
  system?: string | null;
  component?: string | null;
  productName?: string | null;
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

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-sm text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">TFM-kode</th>
                <th className="pb-3 pr-4 font-medium">Bygg</th>
                <th className="pb-3 pr-4 font-medium">System</th>
                <th className="pb-3 pr-4 font-medium">Produkt</th>
                <th className="pb-3 pr-4 font-medium">Plassering</th>
                <th className="pb-3 pr-4 font-medium">Sone</th>
                <th className="pb-3 font-medium">Handlinger</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border/50 text-sm hover:bg-muted/30"
                >
                  <td className="py-3 pr-4">
                    <span className="font-mono font-medium text-primary">
                      {item.tfm || item.typeCode || "-"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-foreground">
                    {item.building || "-"}
                  </td>
                  <td className="py-3 pr-4">
                    {item.system ? (
                      <Badge tone="info" className="text-xs">
                        {item.system}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-3 pr-4 text-foreground">
                    {item.productName || "-"}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {item.location || "-"}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {item.zone || "-"}
                  </td>
                  <td className="py-3">
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
