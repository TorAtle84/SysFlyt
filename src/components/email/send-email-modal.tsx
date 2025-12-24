"use client";

import { useState, useEffect, useMemo } from "react";
import { Mail, Search, Users, AtSign, Loader2, Check, AlertCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ProjectMember {
    id: string;
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    };
}

interface SendEmailModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    itemType: "MC_PROTOCOL" | "FUNCTION_TEST";
    itemId: string;
    itemName: string;
}

interface EmailValidation {
    valid: boolean;
    hint?: string;
}

function validateEmail(email: string): EmailValidation {
    if (!email.trim()) {
        return { valid: false, hint: "Skriv inn en e-postadresse" };
    }
    if (!email.includes("@")) {
        return { valid: false, hint: "Mangler @-tegn (f.eks. navn@firma.no)" };
    }
    const [localPart, domain] = email.split("@");
    if (!localPart) {
        return { valid: false, hint: "Mangler navn før @" };
    }
    if (!domain) {
        return { valid: false, hint: "Mangler domene etter @ (f.eks. firma.no)" };
    }
    if (!domain.includes(".")) {
        return { valid: false, hint: "Mangler domene-endelse (f.eks. .no, .com)" };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, hint: "Ugyldig e-postformat" };
    }
    return { valid: true };
}

export function SendEmailModal({
    open,
    onOpenChange,
    projectId,
    itemType,
    itemId,
    itemName,
}: SendEmailModalProps) {
    const [activeTab, setActiveTab] = useState<"project" | "email">("project");
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [memberFilter, setMemberFilter] = useState("");
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [customEmail, setCustomEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch project members
    useEffect(() => {
        if (open && activeTab === "project") {
            fetchMembers();
        }
    }, [open, activeTab, projectId]);

    async function fetchMembers() {
        setLoadingMembers(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/members`);
            if (res.ok) {
                const data = await res.json();
                setMembers(data);
            }
        } catch (err) {
            console.error("Error fetching members:", err);
        } finally {
            setLoadingMembers(false);
        }
    }

    // Filter members
    const filteredMembers = useMemo(() => {
        if (!memberFilter.trim()) return members;
        const query = memberFilter.toLowerCase();
        return members.filter(
            (m) =>
                m.user.firstName.toLowerCase().includes(query) ||
                m.user.lastName.toLowerCase().includes(query) ||
                m.user.email.toLowerCase().includes(query)
        );
    }, [members, memberFilter]);

    // Email validation
    const emailValidation = useMemo(() => validateEmail(customEmail), [customEmail]);

    // Can send?
    const canSend =
        (activeTab === "project" && selectedMemberId) ||
        (activeTab === "email" && emailValidation.valid);

    // Reset state when modal closes
    useEffect(() => {
        if (!open) {
            setSelectedMemberId(null);
            setCustomEmail("");
            setMemberFilter("");
            setSent(false);
            setError(null);
        }
    }, [open]);

    async function handleSend() {
        setSending(true);
        setError(null);

        try {
            const recipientEmail =
                activeTab === "email"
                    ? customEmail
                    : members.find((m) => m.user.id === selectedMemberId)?.user.email;

            const res = await fetch(`/api/projects/${projectId}/send-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemType,
                    itemId,
                    recipientEmail,
                    recipientUserId: activeTab === "project" ? selectedMemberId : null,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Kunne ikke sende e-post");
            }

            setSent(true);
            setTimeout(() => {
                onOpenChange(false);
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Noe gikk galt");
        } finally {
            setSending(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Send til e-post
                    </DialogTitle>
                    <DialogDescription>
                        Send {itemType === "MC_PROTOCOL" ? "MC Protokoll" : "Funksjonstest"}: {itemName}
                    </DialogDescription>
                </DialogHeader>

                {sent ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                            <Check className="h-6 w-6 text-green-600" />
                        </div>
                        <p className="text-green-600 font-medium">E-post sendt!</p>
                    </div>
                ) : (
                    <>
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "project" | "email")}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="project" className="flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Prosjekt
                                </TabsTrigger>
                                <TabsTrigger value="email" className="flex items-center gap-2">
                                    <AtSign className="h-4 w-4" />
                                    E-post
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="project" className="mt-4 space-y-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Søk etter prosjektmedlem..."
                                        value={memberFilter}
                                        onChange={(e) => setMemberFilter(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>

                                <div className="max-h-48 overflow-y-auto border rounded-lg">
                                    {loadingMembers ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : filteredMembers.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground text-sm">
                                            {memberFilter ? "Ingen treff" : "Ingen prosjektmedlemmer"}
                                        </div>
                                    ) : (
                                        filteredMembers.map((member) => (
                                            <button
                                                key={member.user.id}
                                                type="button"
                                                onClick={() => setSelectedMemberId(member.user.id)}
                                                className={cn(
                                                    "w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b last:border-b-0",
                                                    selectedMemberId === member.user.id && "bg-primary/10"
                                                )}
                                            >
                                                <div className="font-medium text-sm">
                                                    {member.user.firstName} {member.user.lastName}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {member.user.email}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="email" className="mt-4 space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email">E-postadresse</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="navn@firma.no"
                                        value={customEmail}
                                        onChange={(e) => setCustomEmail(e.target.value)}
                                        className={cn(
                                            customEmail && !emailValidation.valid && "border-red-300 focus-visible:ring-red-300"
                                        )}
                                    />
                                    {customEmail && !emailValidation.valid && (
                                        <p className="text-xs text-red-500 flex items-center gap-1">
                                            <AlertCircle className="h-3 w-3" />
                                            {emailValidation.hint}
                                        </p>
                                    )}
                                    {customEmail && emailValidation.valid && (
                                        <p className="text-xs text-green-600 flex items-center gap-1">
                                            <Check className="h-3 w-3" />
                                            Gyldig e-postadresse
                                        </p>
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>

                        {error && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                                {error}
                            </div>
                        )}

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                                Avbryt
                            </Button>
                            <Button
                                onClick={handleSend}
                                disabled={!canSend || sending}
                                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-200"
                            >
                                {sending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Sender...
                                    </>
                                ) : (
                                    <>
                                        <Mail className="h-4 w-4 mr-2" />
                                        Send
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
