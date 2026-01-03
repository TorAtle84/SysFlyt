"use client";

import { useState } from "react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Check, X, User, Mail, Building2, Clock, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Application {
  id: string;
  code: string;
  name: string;
}

interface UserAppAccess {
  status: string;
  application: {
    code: string;
    name: string;
  };
}

interface PendingUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  title: string | null;
  createdAt: Date;
  role: string;
  appAccess: UserAppAccess[];
}

interface ApprovalPanelProps {
  initialUsers: PendingUser[];
  applications: Application[];
}

export function ApprovalPanel({ initialUsers, applications }: ApprovalPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});

  // Initialize selected apps based on user's current requests
  const [selectedApps, setSelectedApps] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    initialUsers.forEach((u) => {
      initial[u.id] = u.appAccess.map((access) => access.application.code);
    });
    return initial;
  });

  const toggleApp = (userId: string, appCode: string) => {
    setSelectedApps((prev) => {
      const current = prev[userId] || [];
      if (current.includes(appCode)) {
        return { ...prev, [userId]: current.filter((c) => c !== appCode) };
      } else {
        return { ...prev, [userId]: [...current, appCode] };
      }
    });
  };

  async function handleApprove(userId: string) {
    setLoading(userId);
    try {
      const role = selectedRoles[userId] || "USER";
      const apps = selectedApps[userId] || [];

      // Send status: 'ACTIVE' to match API expectation
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          status: "ACTIVE",
          role,
          apps
        }),
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
      // Send status: 'SUSPENDED' or keep logic if API handled 'action: reject'
      // Based on API review, it expects 'status'.
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status: "SUSPENDED" }),
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
                <Badge className="bg-yellow-500 hover:bg-yellow-600">{users.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-xl border border-border p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                      {/* User Info */}
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                            {user.firstName[0]}
                            {user.lastName[0]}
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-foreground">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail size={12} />
                              {user.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          {user.company && (
                            <span className="flex items-center gap-1.5">
                              <Building2 size={14} />
                              {user.company}
                            </span>
                          )}
                          {user.title && (
                            <span className="flex items-center gap-1.5">
                              <User size={14} />
                              {user.title}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Clock size={14} />
                            Registrert{" "}
                            {format(new Date(user.createdAt), "d. MMM yyyy", {
                              locale: nb,
                            })}
                          </span>
                        </div>

                        {/* App Selection */}
                        <div className="mt-4 pt-4 border-t border-border">
                          <p className="text-sm font-medium mb-3 text-foreground">Tilgang til applikasjoner:</p>
                          <div className="flex flex-wrap gap-4">
                            {applications.map(app => {
                              const isChecked = (selectedApps[user.id] || []).includes(app.code);
                              return (
                                <div key={app.code} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${user.id}-${app.code}`}
                                    checked={isChecked}
                                    onCheckedChange={() => toggleApp(user.id, app.code)}
                                  />
                                  <Label
                                    htmlFor={`${user.id}-${app.code}`}
                                    className="text-sm font-normal cursor-pointer"
                                  >
                                    {app.name}
                                  </Label>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col items-end gap-3 min-w-[200px]">
                        <div className="w-full">
                          <Label className="text-xs text-muted-foreground mb-1 block">Rolle</Label>
                          <Select
                            value={selectedRoles[user.id] || "USER"}
                            onValueChange={(value) =>
                              setSelectedRoles((prev) => ({
                                ...prev,
                                [user.id]: value,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
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
                        </div>

                        <div className="flex gap-2 w-full">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(user.id)}
                            disabled={loading === user.id}
                            className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                          >
                            <X size={14} className="mr-1" />
                            Avvis
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(user.id)}
                            disabled={loading === user.id || (selectedApps[user.id] || []).length === 0}
                            className="flex-1 gap-1"
                          >
                            <Check size={14} />
                            Godkjenn
                          </Button>
                        </div>
                        {(selectedApps[user.id] || []).length === 0 && (
                          <p className="text-xs text-destructive text-right">
                            Må velge minst én app
                          </p>
                        )}
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
