"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface NotesModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemId: string;
    initialNotes: string;
    projectId: string;
    protocolId: string;
    onSave: (notes: string) => void;
}

export function NotesModal({
    open,
    onOpenChange,
    itemId,
    initialNotes,
    projectId,
    protocolId,
    onSave,
}: NotesModalProps) {
    const [notes, setNotes] = useState(initialNotes || "");
    const [isSaving, setIsSaving] = useState(false);

    async function handleSave() {
        setIsSaving(true);
        try {
            const res = await fetch(
                `/api/projects/${projectId}/mc-protocols/${protocolId}/items/${itemId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notes }),
                }
            );

            if (!res.ok) throw new Error("Kunne ikke lagre");

            onSave(notes);
            toast.success("Notat lagret");
            onOpenChange(false);
        } catch (error) {
            toast.error("Kunne ikke lagre notat");
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Notater</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Skriv notat her..."
                        rows={6}
                        className="resize-none"
                    />

                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Avbryt
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? "Lagrer..." : "Lagre"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
