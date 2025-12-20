"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

interface ColumnMapping {
  tfm: string;
  productName: string;
  supplierName: string;
  location: string;
  zone: string;
}

interface MassListUploadProps {
  projectId: string;
  onUploadComplete: () => void;
}

export function MassListUpload({ projectId, onUploadComplete }: MassListUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    tfm: "",
    productName: "",
    supplierName: "",
    location: "",
    zone: "",
  });
  const [notApplicable, setNotApplicable] = useState({
    productName: false,
    supplierName: false,
    location: false,
    zone: false,
  });
  const [step, setStep] = useState<"upload" | "mapping">("upload");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Kun Excel-filer (.xlsx, .xls) er tillatt");
      return;
    }

    setError(null);
    setSelectedFile(file);

    try {
      // Read file and detect columns
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Scan columns A-Z (0-25) for data in rows 1-100
      const cols = [];
      const maxCol = 25; // Z = 25 (0-indexed)
      const maxRow = 100;

      for (let colIdx = 0; colIdx <= maxCol; colIdx++) {
        const colLetter = XLSX.utils.encode_col(colIdx);
        let hasData = false;

        // Check rows 1-100 for data in this column
        for (let rowIdx = 1; rowIdx <= maxRow; rowIdx++) {
          const cellAddress = `${colLetter}${rowIdx}`;
          const cell = worksheet[cellAddress];

          if (cell && cell.v !== null && cell.v !== undefined && cell.v.toString().trim() !== "") {
            hasData = true;
            break;
          }
        }

        if (hasData) {
          cols.push(colLetter);
        }
      }

      if (cols.length === 0) {
        setError("Ingen kolonner med data funnet i rad 1-100");
        setSelectedFile(null);
        return;
      }

      setColumns(cols);
      setStep("mapping");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Kunne ikke lese Excel-filen";
      setError(message);
      setSelectedFile(null);
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  }

  async function handleUpload() {
    if (!selectedFile || !mapping.tfm) {
      setError("TFM-kolonne er påkrevd");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("mapping", JSON.stringify({
        ...mapping,
        productName: notApplicable.productName ? null : mapping.productName,
        supplierName: notApplicable.supplierName ? null : mapping.supplierName,
        location: notApplicable.location ? null : mapping.location,
        zone: notApplicable.zone ? null : mapping.zone,
      }));

      const res = await fetch(`/api/projects/${projectId}/mass-list`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Opplasting feilet");
      }

      // Reset form
      setSelectedFile(null);
      setStep("upload");
      setMapping({
        tfm: "",
        productName: "",
        supplierName: "",
        location: "",
        zone: "",
      });
      setNotApplicable({
        productName: false,
        supplierName: false,
        location: false,
        zone: false,
      });
      setColumns([]);

      onUploadComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "En feil oppstod under opplasting";
      setError(message);
    } finally {
      setUploading(false);
    }
  }

  function handleCancel() {
    setSelectedFile(null);
    setStep("upload");
    setMapping({
      tfm: "",
      productName: "",
      supplierName: "",
      location: "",
      zone: "",
    });
    setNotApplicable({
      productName: false,
      supplierName: false,
      location: false,
      zone: false,
    });
    setColumns([]);
    setError(null);
  }

  if (step === "mapping") {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileSpreadsheet className="text-primary" size={20} />
                Kolonnemapping
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Velg hvilke kolonner som inneholder hvilke data
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium text-foreground">Valgt fil:</p>
              <p className="text-muted-foreground mt-1">{selectedFile?.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Kolonner funnet: {columns.join(", ")}
              </p>
            </div>

            <div className="space-y-4">
              {/* TFM - Påkrevd */}
              <div className="space-y-2">
                <Label htmlFor="tfm" className="flex items-center gap-2">
                  TFM-kode <span className="text-red-500">*</span>
                </Label>
                <Select value={mapping.tfm} onValueChange={(val) => setMapping({ ...mapping, tfm: val })}>
                  <SelectTrigger id="tfm">
                    <SelectValue placeholder="Velg kolonne..." />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        Kolonne {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Format: +256=360.0001-RTA4001%RTA0001
                </p>
              </div>

              {/* Leverandør - Valgfri */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="supplierName">Leverandør</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="supplierName-na"
                      checked={notApplicable.supplierName}
                      onCheckedChange={(checked) =>
                        setNotApplicable({ ...notApplicable, supplierName: checked as boolean })
                      }
                    />
                    <Label htmlFor="supplierName-na" className="text-sm font-normal cursor-pointer">
                      Ikke aktuelt
                    </Label>
                  </div>
                </div>
                <Select
                  value={mapping.supplierName}
                  onValueChange={(val) => setMapping({ ...mapping, supplierName: val })}
                  disabled={notApplicable.supplierName}
                >
                  <SelectTrigger id="supplierName">
                    <SelectValue placeholder="Velg kolonne..." />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        Kolonne {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Produktnavn - Valgfri */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="productName">Produktnavn</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="productName-na"
                      checked={notApplicable.productName}
                      onCheckedChange={(checked) =>
                        setNotApplicable({ ...notApplicable, productName: checked as boolean })
                      }
                    />
                    <Label htmlFor="productName-na" className="text-sm font-normal cursor-pointer">
                      Ikke aktuelt
                    </Label>
                  </div>
                </div>
                <Select
                  value={mapping.productName}
                  onValueChange={(val) => setMapping({ ...mapping, productName: val })}
                  disabled={notApplicable.productName}
                >
                  <SelectTrigger id="productName">
                    <SelectValue placeholder="Velg kolonne..." />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        Kolonne {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Plassering - Valgfri */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="location">Plassering</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="location-na"
                      checked={notApplicable.location}
                      onCheckedChange={(checked) =>
                        setNotApplicable({ ...notApplicable, location: checked as boolean })
                      }
                    />
                    <Label htmlFor="location-na" className="text-sm font-normal cursor-pointer">
                      Ikke aktuelt
                    </Label>
                  </div>
                </div>
                <Select
                  value={mapping.location}
                  onValueChange={(val) => setMapping({ ...mapping, location: val })}
                  disabled={notApplicable.location}
                >
                  <SelectTrigger id="location">
                    <SelectValue placeholder="Velg kolonne..." />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        Kolonne {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sone/Del - Valgfri */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="zone">Sone/Del</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="zone-na"
                      checked={notApplicable.zone}
                      onCheckedChange={(checked) =>
                        setNotApplicable({ ...notApplicable, zone: checked as boolean })
                      }
                    />
                    <Label htmlFor="zone-na" className="text-sm font-normal cursor-pointer">
                      Ikke aktuelt
                    </Label>
                  </div>
                </div>
                <Select
                  value={mapping.zone}
                  onValueChange={(val) => setMapping({ ...mapping, zone: val })}
                  disabled={notApplicable.zone}
                >
                  <SelectTrigger id="zone">
                    <SelectValue placeholder="Velg kolonne..." />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        Kolonne {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <p className="text-center text-sm text-red-500">{error}</p>
            )}

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={handleCancel} className="flex-1" disabled={uploading}>
                Avbryt
              </Button>
              <Button onClick={handleUpload} className="flex-1" disabled={uploading || !mapping.tfm}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 animate-spin" size={16} />
                    Laster opp...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2" size={16} />
                    Last opp og parse
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div
          className={`relative rounded-xl border-2 border-dashed transition-colors ${dragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
            }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleChange}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <div className="flex flex-col items-center justify-center py-10">
            <FileSpreadsheet className="mb-4 text-primary" size={48} />
            <p className="mb-2 font-medium text-foreground">
              Dra og slipp Excel-fil her
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              eller klikk for å velge fil
            </p>
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={16} className="mr-2" />
              Velg fil
            </Button>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-red-500">{error}</p>
        )}

        <div className="mt-4 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Forventet format:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>TFM-kode (påkrevd): +256=360.0001-RTA4001%RTA0001</li>
            <li>Leverandør (valgfritt): Systemair</li>
            <li>Produktnavn (valgfritt): Ventilasjonsaggregat</li>
            <li>Plassering (valgfritt): 1. etasje</li>
            <li>Sone/Del (valgfritt): Sone A</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
