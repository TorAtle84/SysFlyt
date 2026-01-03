"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Key, Eye, EyeOff, Check, AlertCircle } from "lucide-react";

interface ApiKeysFormProps {
    hasGeminiKey: boolean;
    hasOpenaiKey: boolean;
}

export function ApiKeysForm({ hasGeminiKey, hasOpenaiKey }: ApiKeysFormProps) {
    const [geminiKey, setGeminiKey] = useState("");
    const [openaiKey, setOpenaiKey] = useState("");
    const [showGemini, setShowGemini] = useState(false);
    const [showOpenai, setShowOpenai] = useState(false);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        setSaving(true);
        try {
            const res = await fetch("/api/flytlink/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    geminiApiKey: geminiKey || undefined,
                    openaiApiKey: openaiKey || undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Kunne ikke lagre API-nøkler");
            }

            toast.success("API-nøkler lagret!");
            setGeminiKey("");
            setOpenaiKey("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "En feil oppstod");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-primary" />
                    <CardTitle>API-nøkler</CardTitle>
                </div>
                <CardDescription>
                    Konfigurer API-nøkler for AI-tjenester brukt i Kravsporing
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Gemini API Key */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="gemini-key">Google Gemini API-nøkkel</Label>
                        {hasGeminiKey ? (
                            <span className="flex items-center gap-1 text-xs text-green-500">
                                <Check className="h-3 w-3" /> Konfigurert
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <AlertCircle className="h-3 w-3" /> Ikke konfigurert
                            </span>
                        )}
                    </div>
                    <div className="relative">
                        <Input
                            id="gemini-key"
                            type={showGemini ? "text" : "password"}
                            placeholder={hasGeminiKey ? "••••••••••••••••" : "AIza..."}
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            className="pr-10"
                        />
                        <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowGemini(!showGemini)}
                        >
                            {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Hentes fra <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google AI Studio</a>
                    </p>
                </div>

                {/* OpenAI API Key */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="openai-key">OpenAI API-nøkkel (valgfri)</Label>
                        {hasOpenaiKey ? (
                            <span className="flex items-center gap-1 text-xs text-green-500">
                                <Check className="h-3 w-3" /> Konfigurert
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <AlertCircle className="h-3 w-3" /> Ikke konfigurert
                            </span>
                        )}
                    </div>
                    <div className="relative">
                        <Input
                            id="openai-key"
                            type={showOpenai ? "text" : "password"}
                            placeholder={hasOpenaiKey ? "••••••••••••••••" : "sk-..."}
                            value={openaiKey}
                            onChange={(e) => setOpenaiKey(e.target.value)}
                            className="pr-10"
                        />
                        <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowOpenai(!showOpenai)}
                        >
                            {showOpenai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Hentes fra <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">OpenAI Platform</a>
                    </p>
                </div>

                <Button onClick={handleSave} disabled={saving || (!geminiKey && !openaiKey)}>
                    {saving ? "Lagrer..." : "Lagre API-nøkler"}
                </Button>
            </CardContent>
        </Card>
    );
}
