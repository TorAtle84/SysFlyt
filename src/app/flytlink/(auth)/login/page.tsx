"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, ArrowLeft } from "lucide-react";

export default function FlytLinkLoginPage() {
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

        try {
            const checkRes = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    totpCode: showTotp ? totpCode : undefined,
                }),
            });

            const checkData = await checkRes.json();

            if (checkData.requiresTotp) {
                setShowTotp(true);
                setLoading(false);
                return;
            }

            if (checkData.error) {
                setError(checkData.error);
                if (checkData.error.includes("verifiseringskode")) {
                    setTotpCode("");
                }
                setLoading(false);
                return;
            }

            if (checkData.success) {
                const res = await signIn("credentials", {
                    redirect: false,
                    email,
                    password,
                    totpCode: showTotp ? totpCode : undefined,
                });

                if (res?.error) {
                    setError("Innlogging feilet. Prøv igjen.");
                } else {
                    router.replace("/flytlink/dashboard");
                }
            }
        } catch (err) {
            console.error("Login error:", err);
            setError("Nettverksfeil - prøv igjen");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Velkommen til</p>
                <h2 className="text-2xl font-semibold text-foreground">FlytLink</h2>
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
