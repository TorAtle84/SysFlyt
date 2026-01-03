"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function ResetPageContent() {
    const search = useSearchParams();
    const token = search.get("token");
    const mode = token ? "confirm" : "request";

    return mode === "request" ? <RequestForm /> : <ConfirmForm token={token!} />;
}

export default function FlytLinkResetPage() {
    return (
        <Suspense fallback={<div>Laster...</div>}>
            <ResetPageContent />
        </Suspense>
    );
}

function RequestForm() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        const res = await fetch("/api/auth/reset/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        const json = await res.json();
        setLoading(false);
        setMessage(res.ok ? "Sjekk e-post for reset-lenke" : json.error || "Kunne ikke sende e-post");
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Glemt passord</p>
                <h2 className="text-2xl font-semibold text-foreground">Send reset-lenke</h2>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input label="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                {message && <p className="text-sm text-info">{message}</p>}
                <Button type="submit" loading={loading}>
                    Send lenke
                </Button>
            </form>
            <Link
                href="/flytlink/login"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Tilbake til innlogging
            </Link>
        </div>
    );
}

function ConfirmForm({ token }: { token: string }) {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password !== confirm) {
            setMessage("Passordene matcher ikke");
            return;
        }
        setLoading(true);
        setMessage(null);
        const res = await fetch("/api/auth/reset/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
        });
        const json = await res.json();
        setLoading(false);
        if (res.ok) {
            setMessage("Passord oppdatert. Du kan nå logge inn.");
            setTimeout(() => router.replace("/flytlink/login"), 1200);
        } else {
            setMessage(json.error || "Kunne ikke oppdatere passord");
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Tilbakestill passord</p>
                <h2 className="text-2xl font-semibold text-foreground">Sett nytt passord</h2>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                    label="Nytt passord"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <Input
                    label="Gjenta passord"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                />
                {message && <p className="text-sm text-info">{message}</p>}
                <Button type="submit" loading={loading}>
                    Oppdater passord
                </Button>
            </form>
        </div>
    );
}
