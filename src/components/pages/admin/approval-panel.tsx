"use client";

import { useState } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Check, X, User, Mail, Building2, Clock, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PendingUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  title: string | null;
  createdAt: Date;
  role: string;
}

interface ApprovalPanelProps {
  initialUsers: PendingUser[];
}

export function ApprovalPanel({ initialUsers }: ApprovalPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});

  async function handleApprove(userId: string) {
    setLoading(userId);
    try {
      const role = selectedRoles[userId] || "USER";
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "approve", role }),
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  }

  async function handleReject(userId: string) {
    setLoading(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "reject" }),
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Godkjenninger</h1>
        <p className="text-muted-foreground">
          Administrer ventende brukerforespørsler
        </p>
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="mx-auto mb-4 text-green-500" size={48} />
            <p className="font-medium text-foreground">Alt er i orden!</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ingen ventende brukerforespørsler
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="text-warning" size={18} />
                Ventende brukere
                <Badge tone="warning">{users.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-xl border border-border p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
                            {user.firstName[0]}
                            {user.lastName[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail size={12} />
                              {user.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                          {user.company && (
                            <span className="flex items-center gap-1">
                              <Building2 size={12} />
                              {user.company}
                            </span>
                          )}
                          {user.title && (
                            <span className="flex items-center gap-1">
                              <User size={12} />
                              {user.title}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            Registrert{" "}
                            {format(new Date(user.createdAt), "d. MMM yyyy", {
                              locale: nb,
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedRoles[user.id] || "USER"}
                          onValueChange={(value) =>
                            setSelectedRoles((prev) => ({
                              ...prev,
                              [user.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Velg rolle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USER">Bruker</SelectItem>
                            <SelectItem value="PROJECT_LEADER">
                              Prosjektleder
                            </SelectItem>
                            <SelectItem value="READER">Leser</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          size="sm"
                          onClick={() => handleApprove(user.id)}
                          disabled={loading === user.id}
                          className="gap-1"
                        >
                          <Check size={14} />
                          Godkjenn
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(user.id)}
                          disabled={loading === user.id}
                          className="gap-1"
                        >
                          <X size={14} />
                          Avvis
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
