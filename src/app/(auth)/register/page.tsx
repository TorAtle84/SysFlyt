"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  discipline: string;
  password: string;
  confirmPassword: string;
};

const initialState: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
  title: "",
  discipline: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const update = (key: keyof FormState, value: string) => setForm((s) => ({ ...s, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError("Passordene matcher ikke");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Kunne ikke registrere bruker");
      setLoading(false);
      return;
    }
    await signIn("credentials", { redirect: false, email: form.email, password: form.password });
    setLoading(false);
    router.replace("/pending");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Opprett konto</p>
        <h2 className="text-2xl font-semibold text-foreground">Velkommen til SysLink</h2>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input label="Fornavn" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required />
        <Input label="Etternavn" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required />
        <Input
          label="E-post"
          type="email"
          className="md:col-span-2"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          required
        />
        <Input label="Telefon" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        <Input label="Firma" value={form.company} onChange={(e) => update("company", e.target.value)} />
        <Input label="Tittel" value={form.title} onChange={(e) => update("title", e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Fag</label>
          <select
            value={form.discipline}
            onChange={(e) => update("discipline", e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-info focus:ring-1 focus:ring-info"
          >
            <option value="">Velg fag...</option>
            <option value="Elektro">Elektro</option>
            <option value="Ventilasjon">Ventilasjon</option>
            <option value="Kulde">Kulde</option>
            <option value="Byggautomasjon">Byggautomasjon</option>
            <option value="Rørlegger">Rørlegger</option>
            <option value="Administrasjon">Administrasjon</option>
            <option value="Totalentreprenør">Totalentreprenør</option>
            <option value="Byggherre">Byggherre</option>
            <option value="Annet">Annet</option>
          </select>
        </div>
        <Input
          label="Passord"
          type="password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          required
          hint="Minst 8 tegn. Admin-e-poster aktiveres automatisk."
        />
        <Input
          label="Gjenta passord"
          type="password"
          value={form.confirmPassword}
          onChange={(e) => update("confirmPassword", e.target.value)}
          required
        />
        {error && <p className="md:col-span-2 text-sm text-danger">{error}</p>}
        <div className="md:col-span-2 flex flex-col gap-3">
          <Button type="submit" loading={loading}>
            Opprett og logg inn
          </Button>
          <p className="text-sm text-muted-foreground">
            Har du allerede konto?{" "}
            <Link href="/login" className="font-semibold text-info underline-offset-4 hover:underline">
              Logg inn
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
