"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Check } from "lucide-react";

interface Point {
  x: number;
  y: number;
}

interface SystemSelectionPopupProps {
  availableSystems: string[];
  polygonPoints: Point[];
  previewComponents?: Array<{ code: string; system: string | null }>;
  onConfirm: (systemCode: string) => void;
  onCancel: () => void;
}

/**
 * Modal for selecting system code after drawing polygon
 * Shows preview of components within polygon
 */
export default function SystemSelectionPopup({
  availableSystems,
  polygonPoints,
  previewComponents,
  onConfirm,
  onCancel,
}: SystemSelectionPopupProps) {
  const [selectedSystem, setSelectedSystem] = useState(
    availableSystems.length > 0 ? availableSystems[0] : ""
  );
  const [filterQuery, setFilterQuery] = useState("");

  // Filter available systems
  const filteredSystems = availableSystems.filter((sys) =>
    sys.toLowerCase().includes(filterQuery.toLowerCase())
  );

  // Count components that would be affected
  const affectedCount = previewComponents?.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Velg systemkode</h3>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X size={16} />
          </Button>
        </div>

        {/* Info */}
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="text-muted-foreground">
            Du har tegnet en polygon med <strong>{polygonPoints.length}</strong> punkter.
          </p>
          {affectedCount > 0 && (
            <p className="mt-1 text-primary">
              <strong>{affectedCount}</strong> komponenter funnet innenfor området.
            </p>
          )}
        </div>

        {/* System Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Systemkode</label>

          {/* Filter Input */}
          <Input
            type="text"
            placeholder="Filtrer systemer..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />

          {/* System List */}
          <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-md p-2">
            {filteredSystems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Ingen systemer funnet
              </p>
            ) : (
              filteredSystems.map((system) => (
                <button
                  key={system}
                  onClick={() => setSelectedSystem(system)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedSystem === system
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {system}
                  {selectedSystem === system && (
                    <Check size={16} className="inline ml-2" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Custom System Input */}
          <div className="pt-2 border-t border-border">
            <label className="text-xs text-muted-foreground">
              Eller skriv inn manuelt:
            </label>
            <Input
              type="text"
              placeholder="f.eks. 360.001"
              value={selectedSystem}
              onChange={(e) => setSelectedSystem(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* Preview Components */}
        {previewComponents && previewComponents.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Komponenter i området ({previewComponents.length})
            </label>
            <div className="max-h-32 overflow-y-auto space-y-1 border border-border rounded-md p-2">
              {previewComponents.slice(0, 10).map((comp, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm px-2 py-1 rounded bg-muted"
                >
                  <span className="font-mono">{comp.code}</span>
                  <Badge variant="outline" className="text-xs">
                    {comp.system || "Ingen system"}
                  </Badge>
                </div>
              ))}
              {previewComponents.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  ...og {previewComponents.length - 10} flere
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Avbryt
          </Button>
          <Button
            onClick={() => onConfirm(selectedSystem)}
            disabled={!selectedSystem.trim()}
            className="flex-1"
          >
            Lagre systemgrense
          </Button>
        </div>
      </Card>
    </div>
  );
}
