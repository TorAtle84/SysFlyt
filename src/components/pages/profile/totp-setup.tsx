"use client";

import { useState, useEffect } from "react";
import { Shield, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TotpSetupProps {
  totpEnabled: boolean;
}

export function TotpSetup({ totpEnabled: initialEnabled }: TotpSetupProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "setup" | "verify" | "disable">("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function startSetup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/totp/setup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setStep("setup");
      } else {
        setError(data.error || "Kunne ikke starte oppsett");
      }
    } catch {
      setError("Nettverksfeil");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (code.length !== 6) {
      setError("Koden må være 6 siffer");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) {
        setEnabled(true);
        setStep("idle");
        setSuccess("Tofaktor-autentisering er nå aktivert!");
        setCode("");
        setQrCode(null);
        setSecret(null);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Verifisering feilet");
        setCode("");
      }
    } catch {
      setError("Nettverksfeil");
    } finally {
      setLoading(false);
    }
  }

  async function disableTotp() {
    if (code.length !== 6) {
      setError("Koden må være 6 siffer");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) {
        setEnabled(false);
        setStep("idle");
        setSuccess("Tofaktor-autentisering er nå deaktivert");
        setCode("");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Deaktivering feilet");
        setCode("");
      }
    } catch {
      setError("Nettverksfeil");
    } finally {
      setLoading(false);
    }
  }

  function cancel() {
    setStep("idle");
    setCode("");
    setError(null);
    setQrCode(null);
    setSecret(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Tofaktor-autentisering
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "idle" && (
          <>
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
              {enabled ? (
                <ShieldCheck className="h-8 w-8 text-green-500" />
              ) : (
                <ShieldOff className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-foreground">
                  {enabled ? "Aktivert" : "Ikke aktivert"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {enabled
                    ? "Din konto er beskyttet med tofaktor-autentisering"
                    : "Legg til et ekstra lag med sikkerhet"}
                </p>
              </div>
              <Badge
                tone={enabled ? "success" : "muted"}
                className="ml-auto"
              >
                {enabled ? "Aktiv" : "Av"}
              </Badge>
            </div>

            {success && (
              <p className="text-sm text-green-500">{success}</p>
            )}

            {enabled ? (
              <Button
                variant="outline"
                onClick={() => setStep("disable")}
                className="w-full"
              >
                <ShieldOff className="mr-2 h-4 w-4" />
                Deaktiver tofaktor
              </Button>
            ) : (
              <div className="space-y-4">
                <Button onClick={startSetup} loading={loading} className="w-full">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Aktiver tofaktor
                </Button>

                <div className="pt-2 border-t text-center space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Trenger du en authenticator-app?</p>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <a
                      href="https://support.microsoft.com/nb-no/account-billing/laste-ned-og-installere-microsoft-authenticator-appen-351498fc-850a-45da-b7b6-27e523b8702a"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground hover:underline transition-colors"
                    >
                      Veiledning for Microsoft Authenticator
                    </a>
                    <a
                      href="https://support.google.com/accounts/answer/1066447?hl=no"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground hover:underline transition-colors"
                    >
                      Veiledning for Google Authenticator
                    </a>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {step === "setup" && qrCode && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Scan denne QR-koden med din authenticator-app (Google Authenticator, Microsoft Authenticator, etc.)
              </p>
              <img
                src={qrCode}
                alt="TOTP QR Code"
                className="mx-auto rounded-lg border bg-white p-2"
                width={200}
                height={200}
              />
            </div>

            {secret && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">
                  Kan ikke scanne? Skriv inn denne koden manuelt:
                </p>
                <code className="text-sm font-mono break-all">{secret}</code>
              </div>
            )}

            <Input
              label="Verifiseringskode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              hint="Skriv inn 6-sifret kode fra appen"
              autoComplete="one-time-code"
            />

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={cancel} className="flex-1 order-2 sm:order-1">
                Avbryt
              </Button>
              <Button onClick={verifyCode} loading={loading} className="flex-1 order-1 sm:order-2">
                Verifiser og aktiver
              </Button>
            </div>
          </div>
        )}

        {step === "disable" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For å deaktivere tofaktor-autentisering, skriv inn en kode fra din authenticator-app.
            </p>

            <Input
              label="Verifiseringskode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoComplete="one-time-code"
            />

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={cancel} className="flex-1 order-2 sm:order-1">
                Avbryt
              </Button>
              <Button
                variant="destructive"
                onClick={disableTotp}
                loading={loading}
                className="flex-1 order-1 sm:order-2"
              >
                Deaktiver
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
