"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function FlytLinkPendingPage() {
    const router = useRouter();
    return (
        <div className="flex flex-col items-start gap-6">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground my-2">Velkommen til</p>
                <h2 className="text-3xl font-bold text-foreground mb-8">FlytLink</h2>

                <div className="rounded-xl border border-border bg-card p-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted/20 flex items-center justify-center">
                            <div className="h-5 w-5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full" />
                        </div>
                        <div>
                            <h3 className="font-medium text-foreground">Robust sikkerhet</h3>
                            <p className="text-sm text-muted-foreground">RBAC, godkjenning og audit-traces bygget inn fra start.</p>
                        </div>
                    </div>
                </div>

                <p className="text-xs uppercase tracking-[0.3em] text-warning">Venter på godkjenning</p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">Kontakten din ser bra ut</h2>
                <p className="mt-3 max-w-xl text-muted-foreground">
                    Vi har registrert kontoen din som <strong>PENDING</strong>. En administrator må godkjenne deg før du får full tilgang.
                    Du får fortsatt logget inn, men vil se denne siden til status endres.
                </p>
            </div>
            <div className="flex gap-3">
                <Button variant="default" onClick={() => router.refresh()}>
                    Sjekk status på nytt
                </Button>
                <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/" })}>
                    Logg ut
                </Button>
            </div>
        </div>
    );
}
