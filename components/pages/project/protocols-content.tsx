"use client";

import { useState } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  ClipboardCheck,
  Plus,
  Search,
  FileDown,
  Building2,
  Cpu,
  MapPin,
} from "lucide-react";
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

interface MassListItem {
  id: string;
  tfm?: string | null;
  building?: string | null;
  system?: string | null;
  component?: string | null;
  typeCode?: string | null;
  productName?: string | null;
  location?: string | null;
  zone?: string | null;
  createdAt: Date;
}

interface ProtocolsContentProps {
  project: { id: string; name: string };
  massListItems: MassListItem[];
  canCreate: boolean;
}

export function ProtocolsContent({
  project,
  massListItems,
  canCreate,
}: ProtocolsContentProps) {
  const [search, setSearch] = useState("");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const systems = [...new Set(massListItems.map((item) => item.system).filter(Boolean))];

  const filteredItems = massListItems.filter((item) => {
    const matchesSearch =
      !search ||
      item.tfm?.toLowerCase().includes(search.toLowerCase()) ||
      item.productName?.toLowerCase().includes(search.toLowerCase()) ||
      item.location?.toLowerCase().includes(search.toLowerCase());

    const matchesSystem =
      systemFilter === "all" || item.system === systemFilter;

    return matchesSearch && matchesSystem;
  });

  function toggleItem(id: string) {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  }

  function selectAll() {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  }

  async function generateProtocol() {
    if (selectedItems.size === 0) return;

    try {
      const res = await fetch(`/api/projects/${project.id}/protocols`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          massListItemIds: Array.from(selectedItems),
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `protokoll-${format(new Date(), "yyyy-MM-dd")}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setSelectedItems(new Set());
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Protokoller MC</h1>
          <p className="text-muted-foreground">
            Generer mekanisk komplettering protokoller fra masselisten
          </p>
        </div>
        {canCreate && selectedItems.size > 0 && (
          <Button onClick={generateProtocol}>
            <FileDown size={16} className="mr-2" />
            Generer protokoll ({selectedItems.size})
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Søk etter TFM, produkt eller plassering..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={systemFilter} onValueChange={setSystemFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Alle systemer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle systemer</SelectItem>
            {systems.map((sys) => (
              <SelectItem key={sys} value={sys!}>
                {sys}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardCheck size={48} className="mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground">
              Ingen komponenter
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || systemFilter !== "all"
                ? "Ingen komponenter matcher filteret"
                : "Importer masseliste for å generere protokoller"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={selectedItems.size === filteredItems.length}
                onChange={selectAll}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm text-muted-foreground">
                Velg alle ({filteredItems.length})
              </span>
            </label>
            {selectedItems.size > 0 && (
              <span className="text-sm text-primary">
                {selectedItems.size} valgt
              </span>
            )}
          </div>

          <div className="grid gap-3">
            {filteredItems.map((item) => (
              <Card
                key={item.id}
                className={`cursor-pointer transition-colors ${
                  selectedItems.has(item.id)
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50"
                }`}
                onClick={() => toggleItem(item.id)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-border"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {item.tfm || "—"}
                      </span>
                      {item.system && (
                        <Badge variant="outline" className="text-xs">
                          <Cpu size={10} className="mr-1" />
                          {item.system}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.productName || "Ukjent produkt"}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {item.building && (
                        <span className="flex items-center gap-1">
                          <Building2 size={12} />
                          Bygg {item.building}
                        </span>
                      )}
                      {item.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {item.location}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
