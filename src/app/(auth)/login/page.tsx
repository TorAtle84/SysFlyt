"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const res = await signIn("credentials", { 
      redirect: false, 
      email, 
      password,
      totpCode: showTotp ? totpCode : undefined,
    });
    
    setLoading(false);
    
    if (res?.error) {
      if (res.error === "TOTP_REQUIRED") {
        setShowTotp(true);
        setError(null);
      } else if (res.error === "Ugyldig verifiseringskode") {
        setError("Ugyldig verifiseringskode. Prøv igjen.");
        setTotpCode("");
      } else if (res.error.includes("For mange feilede forsøk")) {
        setError(res.error);
        setTotpCode("");
      } else if (res.error.includes("suspendert") || res.error.includes("venter på godkjenning") || res.error.includes("ikke aktiv")) {
        setError(res.error);
      } else {
        setError("Feil e-post eller passord");
      }
    } else {
      router.replace("/dashboard");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Velkommen tilbake</p>
        <h2 className="text-2xl font-semibold text-foreground">Logg inn</h2>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!showTotp ? (
          <>
            <Input 
              label="E-post" 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
            <Input
              label="Passord"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              hint="Minimum 8 tegn"
            />
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
              <Shield className="h-6 w-6 text-info" />
              <div>
                <p className="font-medium text-foreground">Tofaktor-autentisering</p>
                <p className="text-sm text-muted-foreground">
                  Skriv inn koden fra din authenticator-app
                </p>
              </div>
            </div>
            <Input
              label="Verifiseringskode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                setShowTotp(false);
                setTotpCode("");
                setError(null);
              }}
              className="text-sm text-info hover:underline"
            >
              Tilbake til innlogging
            </button>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={loading}>
          {showTotp ? "Verifiser" : "Logg inn"}
        </Button>
      </form>
      {!showTotp && (
        <p className="text-sm text-muted-foreground">
          Har du ikke bruker?{" "}
          <Link href="/register" className="font-semibold text-info underline-offset-4 hover:underline">
            Opprett konto
          </Link>
          {" • "}
          <Link href="/reset" className="font-semibold text-info underline-offset-4 hover:underline">
            Glemt passord?
          </Link>
        </p>
      )}
    </div>
  );
}
