"use client";

import { useState } from "react";
import { Key, Eye, EyeOff, Check, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PasswordChange() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    totpCode: "",
  });

  const passwordRequirements = [
    { label: "Minst 8 tegn", met: formData.newPassword.length >= 8 },
    { label: "Stor bokstav", met: /[A-Z]/.test(formData.newPassword) },
    { label: "Liten bokstav", met: /[a-z]/.test(formData.newPassword) },
    { label: "Tall", met: /\d/.test(formData.newPassword) },
    { label: "Spesialtegn", met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.newPassword) },
  ];

  const allRequirementsMet = passwordRequirements.every((req) => req.met);
  const passwordsMatch = formData.newPassword === formData.confirmPassword && formData.confirmPassword.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError(null);

    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setRequiresTotp(false);
        setFormData({ currentPassword: "", newPassword: "", confirmPassword: "", totpCode: "" });
        setTimeout(() => setSuccess(false), 5000);
      } else if (data.requiresTotp) {
        setRequiresTotp(true);
        setError(null);
      } else {
        setError(data.error || "Kunne ikke endre passord");
      }
    } catch (err) {
      console.error(err);
      setError("Nettverksfeil - prøv igjen");
    } finally {
      setLoading(false);
    }
  }

  function togglePasswordVisibility(field: "current" | "new" | "confirm") {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Key className="h-5 w-5" />
          Endre passord
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Input
              label="Nåværende passord"
              type={showPasswords.current ? "text" : "password"}
              value={formData.currentPassword}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, currentPassword: e.target.value }))
              }
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground"
              onClick={() => togglePasswordVisibility("current")}
              aria-label={showPasswords.current ? "Skjul passord" : "Vis passord"}
            >
              {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <Input
              label="Nytt passord"
              type={showPasswords.new ? "text" : "password"}
              value={formData.newPassword}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, newPassword: e.target.value }))
              }
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground"
              onClick={() => togglePasswordVisibility("new")}
              aria-label={showPasswords.new ? "Skjul passord" : "Vis passord"}
            >
              {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {formData.newPassword && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">Passordkrav:</p>
              {passwordRequirements.map((req, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div
                    className={`h-4 w-4 rounded-full flex items-center justify-center ${
                      req.met ? "bg-green-500 text-white" : "bg-muted-foreground/20"
                    }`}
                  >
                    {req.met && <Check size={10} />}
                  </div>
                  <span className={req.met ? "text-foreground" : "text-muted-foreground"}>
                    {req.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="relative">
            <Input
              label="Bekreft nytt passord"
              type={showPasswords.confirm ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))
              }
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground"
              onClick={() => togglePasswordVisibility("confirm")}
              aria-label={showPasswords.confirm ? "Skjul passord" : "Vis passord"}
            >
              {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {formData.confirmPassword && !passwordsMatch && (
            <p className="text-sm text-danger">Passordene stemmer ikke overens</p>
          )}

          {requiresTotp && (
            <div className="space-y-3 rounded-lg border border-primary/50 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Shield className="h-4 w-4 text-primary" />
                Tofaktor-verifisering påkrevd
              </div>
              <Input
                label="Verifiseringskode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={formData.totpCode}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, totpCode: e.target.value.replace(/\D/g, "") }))
                }
                placeholder="000000"
                hint="Skriv inn 6-sifret kode fra authenticator-appen"
                autoComplete="one-time-code"
              />
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          {success && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/50 p-3">
              <p className="text-sm text-green-500 font-medium">Passord oppdatert!</p>
            </div>
          )}

          <Button
            type="submit"
            loading={loading}
            disabled={!allRequirementsMet || !passwordsMatch || !formData.currentPassword || (requiresTotp && formData.totpCode.length !== 6)}
            className="w-full"
          >
            Endre passord
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
