"use client";

import { useState } from "react";
import { User, Mail, Building2, Briefcase, Phone, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    role: string;
    status: string;
  };
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone || "",
    company: user.company || "",
    title: user.title || "",
    discipline: user.discipline || "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Min profil</h1>
        <p className="text-muted-foreground">Administrer din kontoinformasjon</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profilinformasjon</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Fornavn"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                  required
                />
                <Input
                  label="Etternavn"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                  required
                />
              </div>

              <Input
                label="Telefon"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+47 XXX XX XXX"
              />

              <Input
                label="Firma"
                value={formData.company}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, company: e.target.value }))
                }
                placeholder="Ditt firma"
              />

              <Input
                label="Tittel"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Din tittel"
              />

              <Input
                label="Fagområde"
                value={formData.discipline}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, discipline: e.target.value }))
                }
                placeholder="F.eks. Elektro, VVS, Bygg"
              />

              <div className="flex items-center gap-3">
                <Button type="submit" loading={loading}>
                  <Save size={16} className="mr-1" />
                  Lagre endringer
                </Button>
                {success && (
                  <span className="text-sm text-green-500">
                    Profil oppdatert!
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Account Status */}
        <Card>
          <CardHeader>
            <CardTitle>Kontostatus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <Mail className="text-muted-foreground" size={18} />
              <div>
                <p className="text-xs text-muted-foreground">E-post</p>
                <p className="text-sm font-medium text-foreground">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <User className="text-muted-foreground" size={18} />
              <div>
                <p className="text-xs text-muted-foreground">Rolle</p>
                <Badge tone="info" className="mt-1">
                  {user.role}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  user.status === "ACTIVE" ? "bg-green-500" : "bg-yellow-500"
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
    </div>
  );
}
