"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  MessageSquare,
  Users,
  Search,
  ChevronRight,
  Hash,
  Bell,
  BellOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface ChatRoom {
  id: string;
  name: string;
  type: string;
  _count?: {
    messages: number;
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  members: { user: { firstName: string; lastName: string } }[];
  chatRooms?: ChatRoom[];
  _count?: {
    chatRooms: number;
  };
}

interface ChatProjectListProps {
  projects: Project[];
}

export function ChatProjectList({ projects }: ChatProjectListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const activeProjects = projects.filter((p) => p.status === "ACTIVE");

  const filteredProjects = activeProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/pratlink-logo.png"
            alt="PratLink"
            className="h-12 w-12 rounded-lg object-contain"
          />
          <div>
            <h2 className="text-xl font-semibold">Prosjektkorrespondanse</h2>
            <p className="text-sm text-muted-foreground">
              Velg et prosjekt for å åpne chat og korrespondanse
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Søk i prosjekter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Ingen prosjekter funnet</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "Prøv et annet søkeord"
                : "Du har ikke tilgang til noen aktive prosjekter ennå"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              href={`/pratlink/${project.id}`}
              className="group"
            >
              <Card className="h-full transition-all hover:border-primary/50 hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <h3 className="font-semibold leading-tight group-hover:text-primary">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {project.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-0.5 h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users size={14} />
                      <span>{project.members.length} medlemmer</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Hash size={14} />
                      <span>{project._count?.chatRooms || 0} rom</span>
                    </div>
                  </div>

                  {project.chatRooms && project.chatRooms.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {project.chatRooms.slice(0, 3).map((room) => (
                        <Badge key={room.id} tone="muted" className="text-xs">
                          # {room.name}
                        </Badge>
                      ))}
                      {project.chatRooms.length > 3 && (
                        <Badge tone="muted" className="text-xs">
                          +{project.chatRooms.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
