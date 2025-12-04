"use client";

import { useState } from "react";
import Link from "next/link";
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
      createdAt: Date;
      tags: { systemTag: { name: string; color: string } }[];
    }[];
    massList: { id: string; typeCode: string; description: string }[];
    comments: {
      id: string;
      content: string;
      createdAt: Date;
      author: { firstName: string; lastName: string };
    }[];
  };
  canEdit: boolean;
}

export function ProjectContentSwitcher({
  project,
  canEdit,
}: ProjectContentSwitcherProps) {
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
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="text-primary" size={18} />
            Dokumenter
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
          {project.documents.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2" size={32} />
              <p>Ingen dokumenter enda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {project.documents.map((doc) => (
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
                        {format(new Date(doc.createdAt), "d. MMM yyyy", {
                          locale: nb,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.tags.slice(0, 2).map((tag, idx) => (
                      <Badge key={idx} tone="muted" className="text-xs">
                        {tag.systemTag.name}
                      </Badge>
                    ))}
                    <Eye size={16} className="text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mass List Preview */}
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
                  <span className="font-mono text-primary">{item.typeCode}</span>
                  <span className="text-muted-foreground line-clamp-1">
                    {item.description}
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

      {/* Recent Comments */}
      <Card className="lg:col-span-2">
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
