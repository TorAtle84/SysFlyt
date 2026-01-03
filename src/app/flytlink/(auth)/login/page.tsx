"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Construction } from "lucide-react";

export default function FlytLinkLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    return (
        <div className="flex flex-col gap-6">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Velkommen til</p>
                <h2 className="text-2xl font-semibold text-foreground">FlytLink</h2>
            </div>

            {/* Coming Soon Notice */}
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <Construction className="h-6 w-6 text-amber-500" />
                <div>
                    <p className="font-medium text-foreground">Under utvikling</p>
                    <p className="text-sm text-muted-foreground">
                        FlytLink er for øyeblikket under utvikling. Kom tilbake snart!
                    </p>
                </div>
            </div>

            <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
                <Input
                    label="E-post"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled
                />
                <Input
                    label="Passord"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled
                />
                <Button type="submit" disabled>
                    Logg inn
                </Button>
            </form>

            <Link
                href="/"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Tilbake til startsiden
            </Link>
        </div>
    );
}
