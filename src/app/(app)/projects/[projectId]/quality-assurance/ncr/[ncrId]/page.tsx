"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommentThread } from "@/components/pages/project/comment-thread";
import { PhotoCaptureModal } from "@/components/mc/photo-capture-modal";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Loader2, Trash2 } from "lucide-react";

type Member = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; firstName: string; lastName: string };
};

type NcrDetails = {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  severity: string;
  status: string;
  reportedBy: { id: string; firstName: string; lastName: string };
  assignee?: { id: string; firstName: string; lastName: string } | null;
  linkedItem?: {
    id: string;
    massList?: { tfm?: string | null; system?: string | null; component?: string | null } | null;
  } | null;
  rootCause?: string | null;
  corrective?: string | null;
  createdAt: string;
  closedAt?: string | null;
  photos: Array<{ id: string; fileUrl: string; caption?: string | null }>;
};

const STATUS_OPTIONS = [
  { value: "IN_PROGRESS", label: "P\u00e5g\u00e5r" },
  { value: "DEVIATION", label: "Avvik" },
  { value: "CANCELED", label: "Avlyst" },
  { value: "REMEDIATED", label: "Utbedret" },
  { value: "COMPLETED", label: "Fullf\u00f8rt" },
];

const CATEGORY_OPTIONS = [
  { value: "INSTALLATION", label: "Installasjon" },
  { value: "DOCUMENTATION", label: "Dokumentasjon" },
  { value: "EQUIPMENT", label: "Utstyr" },
  { value: "SAFETY", label: "Sikkerhet" },
  { value: "OTHER", label: "Annet" },
];

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Lav" },
  { value: "MEDIUM", label: "Middels" },
  { value: "HIGH", label: "H\u00f8y" },
  { value: "CRITICAL", label: "Kritisk" },
];

const STATUS_TONES: Record<string, "success" | "danger" | "warning" | "muted" | "default"> = {
  COMPLETED: "success",
  DEVIATION: "danger",
  REMEDIATED: "warning",
  CANCELED: "muted",
};

export default function NcrDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const projectId = params.projectId as string;
  const ncrId = params.ncrId as string;

  const [ncr, setNcr] = useState<NcrDetails | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("INSTALLATION");
  const [severity, setSeverity] = useState("MEDIUM");
  const [status, setStatus] = useState("DEVIATION");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [rootCause, setRootCause] = useState("");
  const [corrective, setCorrective] = useState("");

  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/members`);
      if (!response.ok) {
        throw new Error("Kunne ikke hente medlemmer");
      }
      const payload = (await response.json()) as Member[];
      setMembers(payload);
    } catch (error) {
      console.error(error);
      toast.error("Kunne ikke hente prosjektmedlemmer");
    }
  }, [projectId]);

  const fetchNcr = useCallback(async () => {
    if (!projectId || !ncrId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/ncr/${ncrId}`);
      if (!response.ok) {
        throw new Error("Kunne ikke hente avvik");
      }
      const payload = await response.json();
      setNcr(payload.ncr);
      setTitle(payload.ncr.title || "");
      setDescription(payload.ncr.description || "");
      setCategory(payload.ncr.category || "INSTALLATION");
      setSeverity(payload.ncr.severity || "MEDIUM");
      setStatus(payload.ncr.status || "DEVIATION");
      setAssignedTo(payload.ncr.assignee?.id || "unassigned");
      setRootCause(payload.ncr.rootCause || "");
      setCorrective(payload.ncr.corrective || "");
    } catch (error) {
      console.error(error);
      toast.error("Kunne ikke hente avvik");
      setNcr(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, ncrId]);

  useEffect(() => {
    fetchMembers();
    fetchNcr();
  }, [fetchMembers, fetchNcr]);

  const canSetCompleted = useMemo(() => {
    if (session?.user?.role === "ADMIN" || session?.user?.role === "PROJECT_LEADER") {
      return true;
    }
    const memberRole = members.find((m) => m.userId === session?.user?.id)?.role;
    return memberRole === "PROJECT_LEADER";
  }, [members, session?.user?.id, session?.user?.role]);

  const availableStatusOptions = STATUS_OPTIONS.filter((option) => {
    if (option.value !== "COMPLETED") return true;
    if (canSetCompleted) return true;
    return status === "COMPLETED";
  });

  const handleSave = async () => {
    if (!ncr) return;
    if (!title.trim()) {
      toast.error("Tittel er p\u00e5krevd");
      return;
    }
    if (status === "COMPLETED" && canSetCompleted && !corrective.trim()) {
      toast.error("Korrigerende tiltak er p\u00e5krevd f\u00f8r fullf\u00f8ring");
      return;
    }

    setIsSaving(true);
    try {
      const payloadStatus =
        canSetCompleted || status !== "COMPLETED" ? status : undefined;
      const response = await fetch(`/api/projects/${projectId}/ncr/${ncrId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          severity,
          status: payloadStatus,
          assignedTo: assignedTo === "unassigned" ? null : assignedTo,
          rootCause: rootCause.trim(),
          corrective: corrective.trim(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Kunne ikke oppdatere avvik");
      }

      const payload = await response.json();
      setNcr(payload.ncr);
      toast.success("Avvik oppdatert");
    } catch (error: any) {
      toast.error(error.message || "Kunne ikke oppdatere avvik");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!ncr) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/ncr/${ncrId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Kunne ikke slette avvik");
      }
      toast.success("Avvik slettet");
      router.push(`/projects/${projectId}/quality-assurance/ncr`);
    } catch (error: any) {
      toast.error(error.message || "Kunne ikke slette avvik");
    }
  };

  const linkedLabel =
    ncr?.linkedItem?.massList?.tfm ||
    [ncr?.linkedItem?.massList?.system, ncr?.linkedItem?.massList?.component]
      .filter(Boolean)
      .join("-") ||
    null;

  const initialCommentId = searchParams.get("comment") || undefined;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/projects/${projectId}/quality-assurance/ncr`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Avvik</h1>
            {ncr && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>ID: {ncr.id}</span>
                <Badge tone={STATUS_TONES[ncr.status] || "default"}>
                  {STATUS_OPTIONS.find((option) => option.value === ncr.status)?.label || ncr.status}
                </Badge>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              window.open(`/api/projects/${projectId}/ncr/${ncrId}/export`, "_blank");
            }}
            disabled={!ncr}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Eksporter PDF
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!ncr}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Slett
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !ncr ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Avviket finnes ikke eller er slettet.
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Grunninfo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Tittel</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Velg status" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStatusOptions.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          disabled={option.value === "COMPLETED" && !canSetCompleted}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Kategori</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Velg kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="severity">Alvorlighet</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger id="severity">
                      <SelectValue placeholder="Velg alvorlighet" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assignee">Tildelt</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger id="assignee">
                      <SelectValue placeholder="Velg ansvarlig" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Ingen</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.user.firstName} {member.user.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {linkedLabel && (
                  <div className="space-y-2">
                    <Label>Koblet MC-linje</Label>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      {linkedLabel}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Beskrivelse</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="min-h-[120px]"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analyse og tiltak</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rootCause">Rot\u00e5rsak</Label>
                <Textarea
                  id="rootCause"
                  value={rootCause}
                  onChange={(event) => setRootCause(event.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="corrective">Korrigerende tiltak</Label>
                <Textarea
                  id="corrective"
                  value={corrective}
                  onChange={(event) => setCorrective(event.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setPhotosOpen(true)}>
              H\u00e5ndter bilder
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Lagre endringer
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Kommentarer</CardTitle>
            </CardHeader>
            <CardContent>
              <CommentThread
                projectId={projectId}
                members={members.map((member) => member.user)}
                apiBase={`/api/projects/${projectId}/ncr/${ncrId}/comments`}
                initialCommentId={initialCommentId}
              />
            </CardContent>
          </Card>
        </>
      )}

      {ncr && (
        <PhotoCaptureModal
          open={photosOpen}
          onOpenChange={setPhotosOpen}
          apiBase={`/api/projects/${projectId}/ncr/${ncrId}/photos`}
          existingPhotos={ncr.photos || []}
          onPhotosChange={(photos) => {
            setNcr((prev) => (prev ? { ...prev, photos } : prev));
          }}
        />
      )}

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Slette avvik?</DialogTitle>
            <DialogDescription>
              Dette vil slette avviket permanent. Handlingen kan ikke angres.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Slett avvik
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
