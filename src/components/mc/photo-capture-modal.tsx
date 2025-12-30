"use client";

import { useState, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Camera, Upload, Loader2, X, Image as ImageIcon } from "lucide-react";

interface PhotoCaptureModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemId?: string;
    projectId?: string;
    protocolId?: string;
    apiBase?: string;
    existingPhotos: Array<{ id: string; fileUrl: string; caption?: string | null }>;
    onPhotosChange: (photos: any[]) => void;
}

export function PhotoCaptureModal({
    open,
    onOpenChange,
    itemId,
    projectId,
    protocolId,
    apiBase,
    existingPhotos,
    onPhotosChange,
}: PhotoCaptureModalProps) {
    const [photos, setPhotos] = useState(existingPhotos || []);
    const [isUploading, setIsUploading] = useState(false);
    const [caption, setCaption] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const baseEndpoint =
        apiBase ||
        (projectId && protocolId && itemId
            ? `/api/projects/${projectId}/mc-protocols/${protocolId}/items/${itemId}/photos`
            : "");

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!baseEndpoint) {
            toast.error("Mangler endepunkt for bildeopplasting");
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("caption", caption);

        try {
            const res = await fetch(baseEndpoint, { method: "POST", body: formData });

            if (!res.ok) throw new Error("Opplasting feilet");

            const { photo } = await res.json();
            const newPhotos = [...photos, photo];
            setPhotos(newPhotos);
            onPhotosChange(newPhotos);
            setCaption("");
            toast.success("Bilde lastet opp");
        } catch (error) {
            toast.error("Kunne ikke laste opp bilde");
            console.error(error);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            if (cameraInputRef.current) cameraInputRef.current.value = "";
        }
    }

    async function deletePhoto(photoId: string) {
        try {
            if (!baseEndpoint) {
                toast.error("Mangler endepunkt for sletting");
                return;
            }
            const res = await fetch(`${baseEndpoint}?photoId=${photoId}`, { method: "DELETE" });

            if (!res.ok) throw new Error("Sletting feilet");

            const newPhotos = photos.filter((p: any) => p.id !== photoId);
            setPhotos(newPhotos);
            onPhotosChange(newPhotos);
            toast.success("Bilde slettet");
        } catch (error) {
            toast.error("Kunne ikke slette bilde");
            console.error(error);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Bilder</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Upload Controls */}
                    <div className="flex gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                        <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                        <Button
                            variant="outline"
                            onClick={() => cameraInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Camera className="h-4 w-4 mr-2" />
                            )}
                            Ta bilde
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            Last opp
                        </Button>
                    </div>

                    {/* Caption Input */}
                    <Input
                        placeholder="Bildetekst (valgfritt)"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                    />

                    {/* Photo Gallery */}
                    <div className="grid grid-cols-3 gap-3">
                        {photos.length === 0 ? (
                            <div className="col-span-3 flex flex-col items-center justify-center py-8 text-muted-foreground">
                                <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                                <p className="text-sm">Ingen bilder ennå</p>
                            </div>
                        ) : (
                            photos.map((photo: any) => (
                                <div key={photo.id} className="relative group">
                                    <img
                                        src={photo.fileUrl}
                                        alt={photo.caption || "Bilde"}
                                        className="w-full h-24 object-cover rounded-lg"
                                    />
                                    <button
                                        onClick={() => deletePhoto(photo.id)}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                    {photo.caption && (
                                        <p className="text-xs text-muted-foreground mt-1 truncate">
                                            {photo.caption}
                                        </p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={() => onOpenChange(false)}>
                            Lukk
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
