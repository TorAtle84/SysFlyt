"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function PendingPage() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-warning">Venter på godkjenning</p>
        <h2 className="mt-2 text-3xl font-semibold text-foreground">Kontakten din ser bra ut</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Vi har registrert kontoen din som <strong>PENDING</strong>. En administrator må godkjenne deg før du får full tilgang.
          Du får fortsatt logget inn, men vil se denne siden til status endres.
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="primary" onClick={() => router.refresh()}>
          Sjekk status på nytt
        </Button>
        <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/login" })}>
          Logg ut
        </Button>
      </div>
    </div>
  );
}
