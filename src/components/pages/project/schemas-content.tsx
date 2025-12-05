"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Network,
  Upload,
  Search,
  Eye,
  Tag,
  CheckCircle2,
  Plus,
  X,
  Filter,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SystemAnnotation {
  id: string;
  systemCode?: string | null;
  createdBy?: { firstName: string; lastName: string } | null;
}

interface SystemTag {
  id: string;
  code: string;
  description?: string | null;
}

interface Document {
  id: string;
  title: string;
  url: string;
  createdAt: Date;
  systemAnnotations: SystemAnnotation[];
  tags: { systemTag: SystemTag }[];
}

interface SchemasContentProps {
  project: { id: string; name: string };
  documents: Document[];
  systemTags: SystemTag[];
  canUpload: boolean;
}

export function SchemasContent({
  project,
  documents,
  systemTags,
  canUpload,
}: SchemasContentProps) {
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [newTagCode, setNewTagCode] = useState("");
  const [newTagDescription, setNewTagDescription] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  const allTags = [...new Set(documents.flatMap((doc) => doc.tags.map((t) => t.systemTag.code)))];

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.tags.some((t) =>
        t.systemTag.code.toLowerCase().includes(search.toLowerCase())
      );

    const matchesTag =
      selectedTag === "all" ||
      doc.tags.some((t) => t.systemTag.code === selectedTag);

    return matchesSearch && matchesTag;
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("type", "SCHEMA");

      const res = await fetch(`/api/projects/${project.id}/documents`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateTag() {
    if (!newTagCode.trim()) return;

    setCreatingTag(true);
    try {
      const res = await fetch(`/api/system-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newTagCode.toUpperCase(),
          description: newTagDescription || null,
        }),
      });

      if (res.ok) {
        setNewTagCode("");
        setNewTagDescription("");
        setShowTagDialog(false);
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingTag(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Systemskjema</h1>
          <p className="text-muted-foreground">
            Tekniske skjemaer med systemkoding og boksing
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpload && (
            <>
              <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Tag size={16} className="mr-2" />
                    Ny systemkode
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Opprett ny systemkode</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Systemkode</label>
                      <Input
                        placeholder="F.eks. 360, VVS, EL"
                        value={newTagCode}
                        onChange={(e) => setNewTagCode(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Beskrivelse (valgfritt)</label>
                      <Input
                        placeholder="F.eks. Ventilasjon, Sanitær, Elektro"
                        value={newTagDescription}
                        onChange={(e) => setNewTagDescription(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowTagDialog(false)}>
                        Avbryt
                      </Button>
                      <Button onClick={handleCreateTag} disabled={creatingTag || !newTagCode.trim()}>
                        {creatingTag ? "Oppretter..." : "Opprett"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <input
                type="file"
                id="schema-upload"
                accept=".pdf"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button
                type="button"
                disabled={uploading}
                onClick={() => document.getElementById("schema-upload")?.click()}
              >
                <Upload size={16} className="mr-2" />
                {uploading ? "Laster opp..." : "Last opp skjema"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Søk etter skjema eller systemkode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedTag} onValueChange={setSelectedTag}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter size={16} className="mr-2" />
            <SelectValue placeholder="Alle systemer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle systemer</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {systemTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">Systemkoder:</span>
          {systemTags.slice(0, 10).map((tag) => (
            <Badge
              key={tag.id}
              variant={selectedTag === tag.code ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedTag(selectedTag === tag.code ? "all" : tag.code)}
            >
              {tag.code}
              {tag.description && (
                <span className="ml-1 text-xs opacity-70">({tag.description})</span>
              )}
            </Badge>
          ))}
          {systemTags.length > 10 && (
            <Badge variant="outline">+{systemTags.length - 10} flere</Badge>
          )}
        </div>
      )}

      {filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Network size={48} className="mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground">
              Ingen systemskjema
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || selectedTag !== "all"
                ? "Ingen skjema matcher filteret"
                : "Last opp systemskjema for å komme i gang"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((doc) => {
            const totalBoxed = doc.systemAnnotations.filter(
              (a) => a.systemCode
            ).length;

            return (
              <Card key={doc.id} className="group hover:border-primary/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base line-clamp-2">
                      {doc.title}
                    </CardTitle>
                    <Link href={`/projects/${project.id}/documents/${doc.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Eye size={16} />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {doc.tags.slice(0, 3).map((tag, i) => (
                        <Badge key={i} variant="outline" className="gap-1 text-xs">
                          <Tag size={10} />
                          {tag.systemTag.code}
                        </Badge>
                      ))}
                      {doc.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{doc.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {format(new Date(doc.createdAt), "d. MMM yyyy", {
                        locale: nb,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {totalBoxed > 0 ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 size={12} />
                        {totalBoxed} bokset
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Ingen boksing
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
