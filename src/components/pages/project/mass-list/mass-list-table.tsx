"use client";

import { useState } from "react";
import { Trash2, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MassListItem {
  id: string;
  typeCode: string;
  description: string;
  quantity?: number;
  unit?: string;
  location?: string;
  status?: string;
}

interface MassListTableProps {
  data: MassListItem[];
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
}

export function MassListTable({ data, onDelete, onDeleteAll }: MassListTableProps) {
  const [search, setSearch] = useState("");

  const filtered = data.filter(
    (item) =>
      item.typeCode.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase())
  );

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
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Masseliste</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.length} oppføringer totalt
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={onDeleteAll}>
          <Trash2 size={14} className="mr-1" />
          Slett alle
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input
              placeholder="Søk etter TFM-kode eller beskrivelse..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-sm text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">TFM-kode</th>
                <th className="pb-3 pr-4 font-medium">Beskrivelse</th>
                <th className="pb-3 pr-4 font-medium">Mengde</th>
                <th className="pb-3 pr-4 font-medium">Enhet</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
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
                      {item.typeCode}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-foreground">
                    {item.description}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {item.quantity || "-"}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {item.unit || "-"}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={item.status === "completed" ? "success" : "muted"}>
                      {item.status || "pending"}
                    </Badge>
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

        {filtered.length === 0 && search && (
          <div className="py-8 text-center text-muted-foreground">
            <p>Ingen resultater for &quot;{search}&quot;</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
