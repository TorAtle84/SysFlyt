"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  FileText,
  Upload,
  List,
  MessageSquare,
  Plus,
  Eye,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  TrendingUp,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ProjectContentSwitcherProps {
  project: {
    id: string;
    documents: {
      id: string;
      title: string;
      url: string;
      type: string;
      createdAt: Date;
      updatedAt: Date;
      tags: { systemTag: { code: string; description: string | null } }[];
      annotations?: { id: string; status: string }[];
    }[];
    massList: { id: string; tfm: string | null; productName: string | null; building: string | null; system: string | null }[];
    comments: {
      id: string;
      content: string;
      createdAt: Date;
      author: { firstName: string; lastName: string };
    }[];
    members: { user: { firstName: string; lastName: string } }[];
  };
  canEdit: boolean;
}

export function ProjectContentSwitcher({
  project,
  canEdit,
}: ProjectContentSwitcherProps) {
  const router = useRouter();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);

      const res = await fetch(`/api/projects/${project.id}/documents`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setUploadDialogOpen(false);
        setTitle("");
        setFile(null);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  const totalAnnotations = project.documents.reduce(
    (acc, doc) => acc + (doc.annotations?.length || 0),
    0
  );
  const closedAnnotations = project.documents.reduce(
    (acc, doc) =>
      acc + (doc.annotations?.filter((a) => a.status === "CLOSED").length || 0),
    0
  );
  const openAnnotations = totalAnnotations - closedAnnotations;

  const progressPercent =
    totalAnnotations > 0
      ? Math.round((closedAnnotations / totalAnnotations) * 100)
      : 0;

  const recentDocuments = [...project.documents]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressCard
          title="Utførte"
          value={closedAnnotations}
          icon={CheckCircle2}
          color="text-green-500"
          bgColor="bg-green-500/10"
        />
        <ProgressCard
          title="Avvik"
          value={openAnnotations}
          icon={AlertTriangle}
          color="text-orange-500"
          bgColor="bg-orange-500/10"
        />
        <ProgressCard
          title="Dokumenter"
          value={project.documents.length}
          icon={FileText}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <ProgressCard
          title="Masseliste"
          value={project.massList.length}
          icon={List}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="text-primary" size={18} />
              Fremdrift
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="relative h-32 w-32 flex-shrink-0">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-muted/30"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${progressPercent * 2.51} 251`}
                    className="text-primary transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-foreground">
                    {progressPercent}%
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fullført</span>
                  <span className="font-medium text-green-500">{closedAnnotations}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full bg-green-500 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gjenstående</span>
                  <span className="font-medium text-orange-500">{openAnnotations}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${100 - progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="text-primary" size={18} />
              Siste aktivitet
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.comments.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Ingen aktivitet enda
              </div>
            ) : (
              <div className="space-y-3">
                {project.comments.slice(0, 4).map((comment) => (
                  <div key={comment.id} className="flex gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                      {comment.author.firstName[0]}
                      {comment.author.lastName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {comment.author.firstName} kommenterte
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(comment.createdAt), "d. MMM HH:mm", {
                          locale: nb,
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="text-primary" size={18} />
              Nylige dokumenter
            </CardTitle>
            {canEdit && (
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus size={14} className="mr-1" />
                    Last opp
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Last opp dokument</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleUpload} className="space-y-4">
                    <Input
                      label="Tittel"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="F.eks. Plantegning etasje 1"
                      required
                    />
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-foreground">
                        PDF-fil
                      </label>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setUploadDialogOpen(false)}
                      >
                        Avbryt
                      </Button>
                      <Button type="submit" loading={uploading}>
                        Last opp
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {recentDocuments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <FileText className="mx-auto mb-2" size={32} />
                <p>Ingen dokumenter enda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentDocuments.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/projects/${project.id}/documents/${doc.id}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="text-red-500" size={20} />
                      <div>
                        <p className="font-medium text-foreground">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(doc.updatedAt), "d. MMM yyyy", {
                            locale: nb,
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.annotations && doc.annotations.length > 0 && (
                        <Badge tone="muted" className="text-xs">
                          {doc.annotations.length} pins
                        </Badge>
                      )}
                      <Eye size={16} className="text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <List className="text-primary" size={18} />
              Masseliste
            </CardTitle>
            <Link href={`/projects/${project.id}/mass-list`}>
              <Button size="sm" variant="outline">
                Se alle
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {project.massList.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <List className="mx-auto mb-2" size={32} />
                <p>Ingen oppføringer i masselisten</p>
              </div>
            ) : (
              <div className="space-y-2">
                {project.massList.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-primary">
                      {item.tfm || `${item.building || ""}-${item.system || ""}`}
                    </span>
                    <span className="text-muted-foreground line-clamp-1">
                      {item.productName || "-"}
                    </span>
                  </div>
                ))}
                {project.massList.length > 5 && (
                  <p className="text-center text-sm text-muted-foreground">
                    + {project.massList.length - 5} flere...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="text-primary" size={18} />
            Siste kommentarer
          </CardTitle>
        </CardHeader>
        <CardContent>
          {project.comments.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <MessageSquare className="mx-auto mb-2" size={32} />
              <p>Ingen kommentarer enda</p>
            </div>
          ) : (
            <div className="space-y-4">
              {project.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                    {comment.author.firstName[0]}
                    {comment.author.lastName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {comment.author.firstName} {comment.author.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(comment.createdAt), "d. MMM yyyy HH:mm", {
                          locale: nb,
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {comment.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProgressCard({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  bgColor: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-xl p-3 ${bgColor}`}>
          <Icon size={24} className={color} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
