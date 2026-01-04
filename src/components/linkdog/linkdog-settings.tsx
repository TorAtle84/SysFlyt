"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Trash2, Check, ChevronDown, ChevronRight } from "lucide-react";
import { LinkDogStats } from "./linkdog-stats";

interface LinkDogSettingsData {
    enabled: boolean;
    provider: 'gemini' | 'claude' | 'openai';
    keys: {
        gemini: { configured: boolean; masked: string | null };
        claude: { configured: boolean; masked: string | null };
        openai: { configured: boolean; masked: string | null };
    };
}

export function LinkDogSettings() {
    const [settings, setSettings] = useState<LinkDogSettingsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [showGeminiInput, setShowGeminiInput] = useState(false);
    const [showClaudeInput, setShowClaudeInput] = useState(false);
    const [showOpenaiInput, setShowOpenaiInput] = useState(false);
    const [geminiKey, setGeminiKey] = useState("");
    const [claudeKey, setClaudeKey] = useState("");
    const [openaiKey, setOpenaiKey] = useState("");
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [showClaudeKey, setShowClaudeKey] = useState(false);
    const [showOpenaiKey, setShowOpenaiKey] = useState(false);
    const [showStats, setShowStats] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    async function fetchSettings() {
        try {
            const res = await fetch('/api/linkdog/settings');
            if (!res.ok) throw new Error();
            const data = await res.json();
            setSettings(data);
        } catch (error) {
            toast.error("Kunne ikke laste LinkDog-innstillinger");
        } finally {
            setLoading(false);
        }
    }

    async function updateSettings(updates: Partial<{ enabled: boolean; provider: string; geminiApiKey: string; claudeApiKey: string; openaiApiKey: string }>) {
        setSaving(true);
        try {
            const res = await fetch('/api/linkdog/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }

            toast.success("Innstillinger oppdatert");
            await fetchSettings();

            // Reset input states
            setShowGeminiInput(false);
            setShowClaudeInput(false);
            setShowOpenaiInput(false);
            setGeminiKey("");
            setClaudeKey("");
            setOpenaiKey("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Kunne ikke oppdatere");
        } finally {
            setSaving(false);
        }
    }

    async function deleteKey(provider: 'gemini' | 'claude' | 'openai') {
        setSaving(true);
        try {
            const res = await fetch(`/api/linkdog/settings?provider=${provider}`, {
                method: 'DELETE',
            });

            if (!res.ok) throw new Error();

            toast.success("API-nøkkel fjernet");
            await fetchSettings();
        } catch (error) {
            toast.error("Kunne ikke fjerne nøkkel");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                </CardContent>
            </Card>
        );
    }

    if (!settings) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">🐕</span>
                    API og LinkDog-innstillinger
                </CardTitle>
                <CardDescription>
                    Din AI-assistent som hjelper deg med å navigere i applikasjonen
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Enable/Disable */}
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="linkdog-enabled">Aktiver LinkDog</Label>
                        <p className="text-sm text-muted-foreground">
                            Vis LinkDog-ikonet i nedre høyre hjørne
                        </p>
                    </div>
                    <Switch
                        id="linkdog-enabled"
                        checked={settings.enabled}
                        onCheckedChange={(checked) => updateSettings({ enabled: checked })}
                        disabled={saving}
                    />
                </div>

                {/* Stats Collapsible - Only show if enabled */}
                {settings.enabled && (
                    <div className="border rounded-lg p-2 bg-muted/30 mt-2">
                        <button
                            onClick={() => setShowStats(!showStats)}
                            className="flex items-center gap-2 text-sm font-medium w-full text-left p-2 hover:bg-muted/50 rounded transition-colors"
                        >
                            {showStats ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            Vis forbruk og kostnader
                        </button>

                        {showStats && (
                            <div className="mt-2 pt-2 border-t">
                                <LinkDogStats />
                            </div>
                        )}
                    </div>
                )}

                <hr />

                {/* AI Provider */}
                <div className="space-y-3">
                    <Label>AI-leverandør</Label>
                    <RadioGroup
                        value={settings.provider}
                        onValueChange={(value) => updateSettings({ provider: value })}
                        disabled={saving}
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="gemini" id="gemini" />
                            <Label htmlFor="gemini" className="font-normal cursor-pointer">
                                Google Gemini
                            </Label>
                            {settings.keys.gemini.configured && (
                                <Check className="h-4 w-4 text-green-500" />
                            )}
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="claude" id="claude" />
                            <Label htmlFor="claude" className="font-normal cursor-pointer">
                                Anthropic Claude
                            </Label>
                            {settings.keys.claude.configured && (
                                <Check className="h-4 w-4 text-green-500" />
                            )}
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="openai" id="openai" />
                            <Label htmlFor="openai" className="font-normal cursor-pointer">
                                OpenAI
                            </Label>
                            {settings.keys.openai.configured && (
                                <Check className="h-4 w-4 text-green-500" />
                            )}
                        </div>
                    </RadioGroup>
                </div>

                <hr />

                {/* API Keys */}
                <div className="space-y-4">
                    <Label>API-nøkler</Label>

                    {/* Gemini Key */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Gemini API-nøkkel</span>
                            {settings.keys.gemini.configured && !showGeminiInput && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground font-mono">
                                        {settings.keys.gemini.masked}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => deleteKey('gemini')}
                                        disabled={saving}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {!settings.keys.gemini.configured || showGeminiInput ? (
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        type={showGeminiKey ? "text" : "password"}
                                        value={geminiKey}
                                        onChange={(e) => setGeminiKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                        disabled={saving}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full"
                                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                                    >
                                        {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <Button
                                    onClick={() => updateSettings({ geminiApiKey: geminiKey })}
                                    disabled={!geminiKey || saving}
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
                                </Button>
                                {showGeminiInput && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowGeminiInput(false);
                                            setGeminiKey("");
                                        }}
                                    >
                                        Avbryt
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowGeminiInput(true)}
                            >
                                Endre nøkkel
                            </Button>
                        )}
                    </div>

                    {/* Claude Key */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Claude API-nøkkel</span>
                            {settings.keys.claude.configured && !showClaudeInput && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground font-mono">
                                        {settings.keys.claude.masked}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => deleteKey('claude')}
                                        disabled={saving}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {!settings.keys.claude.configured || showClaudeInput ? (
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        type={showClaudeKey ? "text" : "password"}
                                        value={claudeKey}
                                        onChange={(e) => setClaudeKey(e.target.value)}
                                        placeholder="sk-ant-..."
                                        disabled={saving}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full"
                                        onClick={() => setShowClaudeKey(!showClaudeKey)}
                                    >
                                        {showClaudeKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <Button
                                    onClick={() => updateSettings({ claudeApiKey: claudeKey })}
                                    disabled={!claudeKey || saving}
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
                                </Button>
                                {showClaudeInput && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowClaudeInput(false);
                                            setClaudeKey("");
                                        }}
                                    >
                                        Avbryt
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowClaudeInput(true)}
                            >
                                Endre nøkkel
                            </Button>
                        )}
                    </div>

                    {/* OpenAI Key */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">OpenAI API-nøkkel</span>
                            {settings.keys.openai.configured && !showOpenaiInput && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground font-mono">
                                        {settings.keys.openai.masked}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => deleteKey('openai')}
                                        disabled={saving}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {!settings.keys.openai.configured || showOpenaiInput ? (
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        type={showOpenaiKey ? "text" : "password"}
                                        value={openaiKey}
                                        onChange={(e) => setOpenaiKey(e.target.value)}
                                        placeholder="sk-..."
                                        disabled={saving}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full"
                                        onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                    >
                                        {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <Button
                                    onClick={() => updateSettings({ openaiApiKey: openaiKey })}
                                    disabled={!openaiKey || saving}
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
                                </Button>
                                {showOpenaiInput && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowOpenaiInput(false);
                                            setOpenaiKey("");
                                        }}
                                    >
                                        Avbryt
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowOpenaiInput(true)}
                            >
                                Endre nøkkel
                            </Button>
                        )}
                    </div>
                </div>

                <p className="text-xs text-muted-foreground">
                    API-nøkler lagres kryptert og brukes kun for å kommunisere med AI-tjenesten.
                    Få nøkler fra{" "}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Google AI Studio
                    </a>,{" "}
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Anthropic Console
                    </a>, eller{" "}
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        OpenAI Platform
                    </a>.
                </p>

                <hr />


            </CardContent>
        </Card>
    );
}
