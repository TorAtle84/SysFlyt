"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import Link from "next/link";

type VerificationState = "loading" | "success" | "already-verified" | "error" | "no-token";

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [state, setState] = useState<VerificationState>("loading");
    const [errorMessage, setErrorMessage] = useState<string>("");

    useEffect(() => {
        if (!token) {
            setState("no-token");
            return;
        }

        async function verifyEmail() {
            try {
                const response = await fetch(`/api/auth/verify-email?token=${token}`);
                const data = await response.json();

                if (response.ok) {
                    if (data.alreadyVerified) {
                        setState("already-verified");
                    } else {
                        setState("success");
                    }
                } else {
                    setState("error");
                    setErrorMessage(data.error || "Kunne ikke verifisere e-post");
                }
            } catch {
                setState("error");
                setErrorMessage("En uventet feil oppstod");
            }
        }

        verifyEmail();
    }, [token]);

    return (
        <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-10 text-center">
                    <div className="flex justify-center mb-4">
                        {state === "loading" && (
                            <Loader2 className="h-16 w-16 text-white animate-spin" />
                        )}
                        {state === "success" && (
                            <CheckCircle className="h-16 w-16 text-white" />
                        )}
                        {state === "already-verified" && (
                            <CheckCircle className="h-16 w-16 text-white" />
                        )}
                        {state === "error" && (
                            <XCircle className="h-16 w-16 text-white" />
                        )}
                        {state === "no-token" && (
                            <Mail className="h-16 w-16 text-white" />
                        )}
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        {state === "loading" && "Verifiserer..."}
                        {state === "success" && "E-post verifisert!"}
                        {state === "already-verified" && "Allerede verifisert"}
                        {state === "error" && "Verifisering feilet"}
                        {state === "no-token" && "Verifisering"}
                    </h1>
                </div>

                <div className="px-8 py-8">
                    {state === "loading" && (
                        <p className="text-center text-gray-600">
                            Vennligst vent mens vi verifiserer e-postadressen din...
                        </p>
                    )}

                    {state === "success" && (
                        <div className="space-y-4">
                            <p className="text-center text-gray-600">
                                Takk for at du verifiserte e-postadressen din! 🎉
                            </p>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h3 className="font-semibold text-blue-800 mb-2">Hva skjer nå?</h3>
                                <ul className="text-sm text-blue-700 space-y-1">
                                    <li>✓ En administrator har blitt varslet</li>
                                    <li>✓ Kontoen din vil bli gjennomgått</li>
                                    <li>✓ Du mottar en e-post når kontoen er aktivert</li>
                                </ul>
                            </div>
                            <p className="text-center text-sm text-gray-500">
                                Du vil kunne logge inn så snart en administrator har aktivert kontoen din.
                            </p>
                        </div>
                    )}

                    {state === "already-verified" && (
                        <div className="space-y-4">
                            <p className="text-center text-gray-600">
                                E-postadressen din er allerede verifisert.
                            </p>
                            <p className="text-center text-sm text-gray-500">
                                Hvis kontoen din er aktivert, kan du logge inn nå.
                            </p>
                        </div>
                    )}

                    {state === "error" && (
                        <div className="space-y-4">
                            <p className="text-center text-red-600">
                                {errorMessage}
                            </p>
                            <p className="text-center text-sm text-gray-500">
                                Verifiseringslenken kan ha utløpt. Du kan be om en ny lenke ved å logge inn
                                og følge instruksjonene.
                            </p>
                        </div>
                    )}

                    {state === "no-token" && (
                        <div className="space-y-4">
                            <p className="text-center text-gray-600">
                                Ingen verifiseringstoken funnet.
                            </p>
                            <p className="text-center text-sm text-gray-500">
                                Klikk på lenken i verifiserings-e-posten du mottok.
                            </p>
                        </div>
                    )}

                    <div className="mt-8 flex justify-center">
                        <Link
                            href="/login"
                            className="px-6 py-3 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors"
                        >
                            Gå til innlogging
                        </Link>
                    </div>
                </div>

                <div className="bg-gray-50 px-8 py-4 text-center">
                    <p className="text-xs text-gray-400">
                        © {new Date().getFullYear()} FlytLink. Alle rettigheter forbeholdt.
                    </p>
                </div>
            </div>
        </div>
    );
}

function LoadingFallback() {
    return (
        <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-10 text-center">
                    <div className="flex justify-center mb-4">
                        <Loader2 className="h-16 w-16 text-white animate-spin" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Laster...</h1>
                </div>
                <div className="px-8 py-8">
                    <p className="text-center text-gray-600">Vennligst vent...</p>
                </div>
            </div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <Suspense fallback={<LoadingFallback />}>
                <VerifyEmailContent />
            </Suspense>
        </div>
    );
}
