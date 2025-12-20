"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type BimModelComponent = {
  id: string;
  fullTag?: string | null;
  systemCode?: string | null;
  componentTag?: string | null;
  ifcType?: string | null;
  name?: string | null;
  ifcGuid?: string | null;
};

interface ModelComponentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  modelId: string | null;
  modelName: string | null;
  onOpenViewer?: (fullTag: string) => void;
}

export function ModelComponentsModal({
  open,
  onOpenChange,
  projectId,
  modelId,
  modelName,
  onOpenViewer,
}: ModelComponentsModalProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [components, setComponents] = useState<BimModelComponent[]>([]);

  const debounceRef = useRef<number | null>(null);

  const title = useMemo(() => {
    if (!modelName) return "Komponentliste";
    return `Komponentliste – ${modelName}`;
  }, [modelName]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setComponents([]);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !modelId) return;

    const fetchComponents = async () => {
      setLoading(true);
      try {
        const q = query.trim();
        const url = new URL(
          `/api/projects/${projectId}/models/${modelId}/components`,
          window.location.origin
        );
        url.searchParams.set("limit", "1000");
        if (q) url.searchParams.set("q", q);

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Kunne ikke hente komponenter");
        }
        const data = (await res.json()) as BimModelComponent[];
        setComponents(data);
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Kunne ikke hente komponenter");
      } finally {
        setLoading(false);
      }
    };

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchComponents();
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    };
  }, [open, modelId, projectId, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Søk på fullTag (f.eks. 360.0001-RBA0073). Klikk på en rad for å åpne i viewer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Søk komponent..."
              className="w-full sm:w-[360px]"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {loading ? "Laster..." : `${components.length} treff`}
          </div>
        </div>

        <ScrollArea className="h-[60vh] sm:h-[420px] rounded-lg border border-border">
          <div className="md:hidden p-3 space-y-2">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Laster komponenter...
                </span>
              </div>
            ) : components.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Ingen treff.</div>
            ) : (
              components.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "rounded-lg border border-border bg-card p-3",
                    onOpenViewer && c.fullTag ? "cursor-pointer hover:bg-muted/30" : ""
                  )}
                  onClick={() => {
                    if (!onOpenViewer || !c.fullTag) return;
                    onOpenViewer(c.fullTag);
                  }}
                >
                  <p className="font-mono text-sm font-semibold truncate">
                    {c.fullTag ? c.fullTag : "Ukjent"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {c.systemCode ? (
                      <Badge variant="secondary">{c.systemCode}</Badge>
                    ) : (
                      <Badge tone="muted">System -</Badge>
                    )}
                    {c.ifcType ? (
                      <span className="text-xs text-muted-foreground truncate">{c.ifcType}</span>
                    ) : null}
                  </div>
                  {c.name ? (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.name}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Tag</TableHead>
                  <TableHead className="w-[160px]">System</TableHead>
                  <TableHead className="w-[180px]">IFC-type</TableHead>
                  <TableHead>Navn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Laster komponenter...
                      </span>
                    </TableCell>
                  </TableRow>
                ) : components.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      Ingen treff.
                    </TableCell>
                  </TableRow>
                ) : (
                  components.map((c) => (
                    <TableRow
                      key={c.id}
                      className={onOpenViewer && c.fullTag ? "cursor-pointer" : undefined}
                      onClick={() => {
                        if (!onOpenViewer || !c.fullTag) return;
                        onOpenViewer(c.fullTag);
                      }}
                    >
                      <TableCell className="font-medium">
                        {c.fullTag ? c.fullTag : <span className="text-muted-foreground">Ukjent</span>}
                      </TableCell>
                      <TableCell>
                        {c.systemCode ? <Badge variant="secondary">{c.systemCode}</Badge> : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.ifcType || ""}</TableCell>
                      <TableCell className="text-muted-foreground">{c.name || ""}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Lukk
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
