"use client";

import { useState, useEffect, useMemo } from "react";
import { User, Mail, Building2, Briefcase, Phone, Save, Undo2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDraftPersistence } from "@/hooks/use-draft-persistence";
import { DISCIPLINES } from "@/lib/constants";

interface ProfileFormProps {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    company: string | null;
    title: string | null;
    discipline: string | null;
    reportsAsProjectLeaderEnabled: boolean;
    reportsAsMemberEnabled: boolean;
    role: string;
    status: string;
  };
}

interface FormData {
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  title: string;
  discipline: string;
  reportsAsProjectLeaderEnabled: boolean;
  reportsAsMemberEnabled: boolean;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialData = useMemo(() => ({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone || "",
    company: user.company || "",
    title: user.title || "",
    discipline: user.discipline || "",
    reportsAsProjectLeaderEnabled: user.reportsAsProjectLeaderEnabled ?? true,
    reportsAsMemberEnabled: user.reportsAsMemberEnabled ?? true,
  }), [user]);

  const {
    data: formData,
    updateField,
    isDirty,
    hasRecoveredDraft,
    clearDraft,
    discardDraft,
    resetToServer,
  } = useDraftPersistence<FormData>({
    key: `profile_${user.id}`,
    initialData,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const updated = await res.json();
        resetToServer({
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone || "",
          company: updated.company || "",
          title: updated.title || "",
          discipline: updated.discipline || "",
          reportsAsProjectLeaderEnabled: updated.reportsAsProjectLeaderEnabled ?? true,
          reportsAsMemberEnabled: updated.reportsAsMemberEnabled ?? true,
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Kunne ikke lagre endringer");
      }
    } catch (err) {
      console.error(err);
      setError("Nettverksfeil - prøv igjen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Min profil</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Administrer din kontoinformasjon</p>
      </div>

      {hasRecoveredDraft && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 sm:p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Ulagrede endringer funnet
            </p>
            <p className="text-xs text-muted-foreground">
              Vi gjenopprettet endringene du hadde før siden ble lastet på nytt.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={discardDraft}
            className="shrink-0"
          >
            <Undo2 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Forkast</span>
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Profilinformasjon</CardTitle>
          </CardHeader>
          <CardContent className="pb-0">
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Fornavn"
                  value={formData.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  required
                  autoComplete="given-name"
                  className="text-base"
                />
                <Input
                  label="Etternavn"
                  value={formData.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  required
                  autoComplete="family-name"
                  className="text-base"
                />
              </div>

              <Input
                label="Telefon"
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="+47 XXX XX XXX"
                autoComplete="tel"
                className="text-base"
              />

              <Input
                label="Firma"
                value={formData.company}
                onChange={(e) => updateField("company", e.target.value)}
                placeholder="Ditt firma"
                autoComplete="organization"
                className="text-base"
              />

              <Input
                label="Tittel"
                value={formData.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="Din tittel"
                autoComplete="organization-title"
                className="text-base"
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Fagområde</label>
                <Select
                  value={formData.discipline}
                  onValueChange={(value) => updateField("discipline", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Velg fagområde..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCIPLINES.map((discipline) => (
                      <SelectItem key={discipline.value} value={discipline.value}>
                        {discipline.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <p className="text-sm text-danger">{error}</p>
              )}

              <div className="sticky bottom-0 -mx-6 mt-6 border-t border-border bg-card px-6 py-4 sm:relative sm:mx-0 sm:mt-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="submit"
                    loading={loading}
                    disabled={!isDirty && !loading}
                    className="w-full sm:w-auto min-h-[44px] text-base"
                  >
                    <Save size={18} className="mr-2" />
                    Lagre endringer
                  </Button>

                  {isDirty && !loading && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={discardDraft}
                      className="w-full sm:w-auto min-h-[44px]"
                    >
                      <Undo2 size={18} className="mr-2" />
                      Forkast endringer
                    </Button>
                  )}

                  {success && (
                    <span className="text-sm text-green-500 text-center sm:text-left">
                      Profil oppdatert!
                    </span>
                  )}
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Kontostatus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <Mail className="text-muted-foreground shrink-0" size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">E-post</p>
                <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <User className="text-muted-foreground shrink-0" size={18} />
              <div>
                <p className="text-xs text-muted-foreground">Rolle</p>
                <Badge tone="info" className="mt-1">
                  {user.role}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <div
                className={`h-3 w-3 shrink-0 rounded-full ${user.status === "ACTIVE" ? "bg-green-500" : "bg-yellow-500"
                  }`}
              />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge
                  tone={user.status === "ACTIVE" ? "success" : "warning"}
                  className="mt-1"
                >
                  {user.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Rapportering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="reports-as-leader"
              checked={formData.reportsAsProjectLeaderEnabled}
              onCheckedChange={(value) =>
                updateField("reportsAsProjectLeaderEnabled", value === true)
              }
            />
            <div className="space-y-1">
              <label htmlFor="reports-as-leader" className="text-sm font-medium text-foreground">
                Motta daglige rapporter som prosjektleder
              </label>
              <p className="text-xs text-muted-foreground">
                Gjelder prosjekter du har opprettet.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="reports-as-member"
              checked={formData.reportsAsMemberEnabled}
              onCheckedChange={(value) =>
                updateField("reportsAsMemberEnabled", value === true)
              }
            />
            <div className="space-y-1">
              <label htmlFor="reports-as-member" className="text-sm font-medium text-foreground">
                Motta daglige rapporter som medlem
              </label>
              <p className="text-xs text-muted-foreground">
                Gjelder prosjekter du er invitert i.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
