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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

type Member = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; firstName: string; lastName: string };
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

export default function NcrCreatePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { data: session } = useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const linkedItemId = searchParams.get("linkedItemId") || null;

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
    setIsLoadingMembers(true);
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
    } finally {
      setIsLoadingMembers(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const canSetCompleted = useMemo(() => {
    if (session?.user?.role === "ADMIN" || session?.user?.role === "PROJECT_LEADER") {
      return true;
    }
    const memberRole = members.find((m) => m.userId === session?.user?.id)?.role;
    return memberRole === "PROJECT_LEADER";
  }, [members, session?.user?.id, session?.user?.role]);

  const availableStatusOptions = canSetCompleted
    ? STATUS_OPTIONS
    : STATUS_OPTIONS.filter((option) => option.value !== "COMPLETED");

  useEffect(() => {
    if (!canSetCompleted && status === "COMPLETED") {
      setStatus("DEVIATION");
    }
  }, [canSetCompleted, status]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Tittel er p\u00e5krevd");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/ncr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          severity,
          status,
          assignedTo: assignedTo === "unassigned" ? null : assignedTo,
          linkedItemId,
          rootCause: rootCause.trim(),
          corrective: corrective.trim(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Kunne ikke opprette avvik");
      }

      const payload = await response.json();
      toast.success("Avvik opprettet");
      router.push(`/projects/${projectId}/quality-assurance/ncr/${payload.ncr.id}`);
    } catch (error: any) {
      toast.error(error.message || "Kunne ikke opprette avvik");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/projects/${projectId}/quality-assurance/ncr`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nytt avvik</h1>
          <p className="text-muted-foreground">
            Opprett et nytt avvik med kategori og alvorlighet
          </p>
        </div>
      </div>

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
                placeholder="Kort oppsummering av avviket"
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
                    <SelectItem key={option.value} value={option.value}>
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
            {linkedItemId && (
              <div className="space-y-2">
                <Label>Koblet MC-linje</Label>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {linkedItemId}
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
              placeholder="Detaljer rundt avviket"
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
              placeholder="Hva er \u00e5rsaken til avviket?"
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="corrective">Korrigerende tiltak</Label>
            <Textarea
              id="corrective"
              value={corrective}
              onChange={(event) => setCorrective(event.target.value)}
              placeholder="Tiltak som l\u00f8ser avviket"
              className="min-h-[100px]"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild>
          <Link href={`/projects/${projectId}/quality-assurance/ncr`}>Avbryt</Link>
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || isLoadingMembers}>
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Opprett avvik
        </Button>
      </div>
    </div>
  );
}
