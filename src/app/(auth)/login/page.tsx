"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { redirect: false, email, password });
    setLoading(false);
    if (res?.error) {
      setError("Feil e-post eller passord");
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
        <Input label="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Passord"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          hint="Minimum 8 tegn"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={loading}>
          Logg inn
        </Button>
      </form>
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
    </div>
  );
}
