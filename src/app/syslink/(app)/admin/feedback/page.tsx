"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCircle,
  ClipboardList,
  Loader2,
  Search,
  Sparkles,
  TriangleAlert,
  UserCircle2,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

type FeedbackAttachment = {
  name: string;
  size: number;
  type: string;
  path: string;
  url: string;
};

type FeedbackUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type FeedbackItem = {
  id: string;
  category: string;
  message: string;
  attachments: FeedbackAttachment[] | null;
  priority: string;
  status: string;
  assignedToId: string | null;
  warningMessage: string | null;
  warningSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: FeedbackUser;
  assignedTo: FeedbackUser | null;
};

const STATUS_TABS = [
  { value: "all", label: "Alle" },
  { value: "REGISTERED", label: "Registrert" },
  { value: "IN_PROGRESS", label: "Pågår" },
  { value: "FIXED", label: "Utbedret" },
  { value: "REJECTED", label: "Avvist" },
];

const STATUS_LABELS: Record<string, string> = {
  REGISTERED: "Registrert",
  IN_PROGRESS: "Pågår",
  FIXED: "Utbedret",
  REJECTED: "Avvist",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Lav",
  MEDIUM: "Normal",
  HIGH: "Høy",
  CRITICAL: "Kritisk",
};

const CATEGORY_LABELS: Record<string, string> = {
  BUG: "Bug",
  SUGGESTION: "Forslag",
  UI: "UI/UX",
  PERFORMANCE: "Ytelse",
  OTHER: "Annet",
};

type FeedbackPlan = {
  summary: string;
  probableArea: string;
  suggestedFiles: { path: string; reason: string }[];
  steps: string[];
  questions: string[];
};

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [updating, setUpdating] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState<FeedbackPlan | null>(null);
  const [planRaw, setPlanRaw] = useState<string | null>(null);
  const [adminUsers, setAdminUsers] = useState<FeedbackUser[]>([]);

  const [detailForm, setDetailForm] = useState({
    status: "REGISTERED",
    priority: "MEDIUM",
    assignedToId: "UNASSIGNED",
  });

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feedback");
      if (!res.ok) throw new Error("Kunne ikke hente tilbakemeldinger");
      const data = await res.json();
      setFeedback(data.feedback || []);
    } catch (error) {
      toast.error("Kunne ikke hente tilbakemeldinger");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAdmins = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users?all=true");
      if (!res.ok) return;
      const data = await res.json();
      const admins = (data || [])
        .filter((user: any) => user.role === "ADMIN")
        .map((user: any) => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        }));
      setAdminUsers(admins);
    } catch (error) {
      console.error("Failed to fetch admins:", error);
    }
  }, []);

  useEffect(() => {
    fetchFeedback();
    fetchAdmins();
  }, [fetchFeedback, fetchAdmins]);

  useEffect(() => {
    if (selected) {
      setDetailForm({
        status: selected.status,
        priority: selected.priority,
        assignedToId: selected.assignedToId || "UNASSIGNED",
      });
      setPlan(null);
      setPlanRaw(null);
      setWarningMessage("");
    }
  }, [selected]);

  const filteredFeedback = useMemo(() => {
    return feedback.filter((item) => {
      if (activeTab !== "all" && item.status !== activeTab) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        return (
          item.message.toLowerCase().includes(query) ||
          item.user.email.toLowerCase().includes(query) ||
          item.user.firstName.toLowerCase().includes(query) ||
          item.user.lastName.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [feedback, activeTab, searchQuery]);

  const counts = useMemo(() => {
    return feedback.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );
  }, [feedback]);

  function getStatusBadge(status: string) {
    switch (status) {
      case "REGISTERED":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30">
            <ClipboardList className="h-3 w-3 mr-1" />
            Registrert
          </Badge>
        );
      case "IN_PROGRESS":
        return (
            <Badge className="bg-blue-500/20 text-blue-600 hover:bg-blue-500/30">
              <Loader2 className="h-3 w-3 mr-1" />
            Pågår
            </Badge>
          );
      case "FIXED":
        return (
          <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Utbedret
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge className="bg-red-500/20 text-red-600 hover:bg-red-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Avvist
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function openDetails(item: FeedbackItem) {
    setSelected(item);
    setDetailOpen(true);
  }

  async function handleUpdate() {
    if (!selected) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/feedback/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: detailForm.status,
          priority: detailForm.priority,
          assignedToId: detailForm.assignedToId === "UNASSIGNED" ? "" : detailForm.assignedToId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Oppdatering feilet");
      }

      toast.success("Tilbakemelding oppdatert");
      setDetailOpen(false);
      setSelected(null);
      fetchFeedback();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Oppdatering feilet");
    } finally {
      setUpdating(false);
    }
  }

  async function handleSendWarning() {
    if (!selected) return;
    if (!warningMessage.trim()) {
      toast.error("Skriv en advarselstekst");
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/feedback/${selected.id}/warn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: warningMessage.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunne ikke sende advarsel");
      }

      toast.success("Advarsel sendt");
      setWarningOpen(false);
      setDetailOpen(false);
      setSelected(null);
      fetchFeedback();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunne ikke sende advarsel");
    } finally {
      setUpdating(false);
    }
  }

  async function handleGeneratePlan() {
    if (!selected) return;
    setPlanLoading(true);
    try {
      const res = await fetch(`/api/admin/feedback/${selected.id}/plan`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kunne ikke generere tiltaksplan");
      }
      const data = await res.json();
      setPlan(data.plan || null);
      setPlanRaw(data.raw || null);
      toast.success("Tiltaksplan generert");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunne ikke generere tiltaksplan");
    } finally {
      setPlanLoading(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TriangleAlert className="h-6 w-6" />
              Tilbakemeldinger
            </h1>
            <p className="text-muted-foreground">
              Oversikt over innmeldte feil og forbedringer
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList>
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label} (
                  {tab.value === "all"
                    ? counts.total
                    : counts[tab.value] || 0}
                  )
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Søk i tilbakemeldinger..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Innmelder</TableHead>
                  <TableHead>Tilbakemelding</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioritet</TableHead>
                  <TableHead>Oppdatert</TableHead>
                  <TableHead className="w-[90px]">Handlinger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFeedback.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Ingen tilbakemeldinger funnet
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFeedback.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {item.user.firstName} {item.user.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">{item.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm text-foreground line-clamp-2">{item.message}</p>
                        {item.attachments?.length ? (
                          <p className="text-xs text-muted-foreground">
                            {item.attachments.length} vedlegg
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {PRIORITY_LABELS[item.priority] || item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(item.updatedAt), "d. MMM yyyy", { locale: nb })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetails(item)}
                        >
                          Se
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Tilbakemelding</DialogTitle>
            <DialogDescription>
              {selected ? `Opprettet ${format(new Date(selected.createdAt), "d. MMM yyyy HH:mm", { locale: nb })}` : null}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Innmelder</p>
                  <div className="mt-2 flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {selected.user.firstName} {selected.user.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{selected.user.email}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Kategori</p>
                  <p className="mt-2 text-sm font-medium">
                    {CATEGORY_LABELS[selected.category] || selected.category}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-2">{getStatusBadge(selected.status)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Beskrivelse</Label>
                <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm whitespace-pre-line">
                  {selected.message}
                </div>
                {selected.warningMessage ? (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                    <p className="font-medium">Advarsel sendt</p>
                    <p>{selected.warningMessage}</p>
                  </div>
                ) : null}
              </div>

              {selected.attachments?.length ? (
                <div className="space-y-2">
                  <Label>Vedlegg</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {selected.attachments.map((attachment) => (
                      <a
                        key={attachment.path}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative rounded-lg border border-border bg-muted/20 p-2"
                      >
                        <img
                          src={attachment.url}
                          alt={attachment.name}
                          className="h-24 w-full rounded-md object-cover"
                        />
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-1">
                          {attachment.name}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={detailForm.status}
                    onValueChange={(value) =>
                      setDetailForm((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioritet</Label>
                  <Select
                    value={detailForm.priority}
                    onValueChange={(value) =>
                      setDetailForm((prev) => ({ ...prev, priority: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ansvarlig</Label>
                  <Select
                    value={detailForm.assignedToId}
                    onValueChange={(value) =>
                      setDetailForm((prev) => ({ ...prev, assignedToId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ikke tildelt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNASSIGNED">Ikke tildelt</SelectItem>
                      {adminUsers.map((admin) => (
                        <SelectItem key={admin.id} value={admin.id}>
                          {admin.firstName} {admin.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">AI Tiltaksplan</p>
                    <p className="text-sm text-muted-foreground">
                      Bruk Gemini Pro for forslag til filer og tiltak.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleGeneratePlan}
                    disabled={planLoading}
                  >
                    {planLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generer tiltaksplan
                  </Button>
                </div>
                {plan ? (
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="font-medium">Oppsummering</p>
                      <p className="text-muted-foreground">{plan.summary}</p>
                    </div>
                    <div>
                      <p className="font-medium">Sannsynlig område</p>
                      <p className="text-muted-foreground">{plan.probableArea}</p>
                    </div>
                    {plan.suggestedFiles?.length ? (
                      <div>
                        <p className="font-medium">Foreslåtte filer</p>
                        <ul className="list-disc pl-5 text-muted-foreground">
                          {plan.suggestedFiles.map((file, index) => (
                            <li key={`${file.path}-${index}`}>
                              <span className="font-medium text-foreground">{file.path}</span> - {file.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {plan.steps?.length ? (
                      <div>
                        <p className="font-medium">Tiltak</p>
                        <ol className="list-decimal pl-5 text-muted-foreground">
                          {plan.steps.map((step, index) => (
                            <li key={`${step}-${index}`}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {plan.questions?.length ? (
                      <div>
                        <p className="font-medium">Avklaringer</p>
                        <ul className="list-disc pl-5 text-muted-foreground">
                          {plan.questions.map((question, index) => (
                            <li key={`${question}-${index}`}>{question}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : planRaw ? (
                  <p className="text-muted-foreground whitespace-pre-line">{planRaw}</p>
                ) : null}
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setWarningOpen(true)}
              disabled={!selected || updating}
            >
              Send advarsel
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDetailOpen(false)}>
                Lukk
              </Button>
              <Button onClick={handleUpdate} disabled={updating}>
                {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Lagre endringer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send advarsel</DialogTitle>
            <DialogDescription>
              Bruk dette når tilbakemeldingen avvises.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Advarselstekst</Label>
            <Textarea
              value={warningMessage}
              onChange={(event) => setWarningMessage(event.target.value)}
              placeholder="Forklar hvorfor tilbakemeldingen avvises..."
              className="min-h-[140px]"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWarningOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSendWarning} disabled={updating}>
              {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send advarsel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
