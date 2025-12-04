"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SaveAndCloseButtonProps {
  projectId: string;
  documentId: string;
  systemTags: string[];
}

export default function SaveAndCloseButton({
  projectId,
  documentId,
  systemTags,
}: SaveAndCloseButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSaveAndClose() {
    setSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      router.push(`/projects/${projectId}`);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  }

  function handleBack() {
    router.push(`/projects/${projectId}`);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-2">
        {systemTags.slice(0, 3).map((tag, idx) => (
          <Badge key={idx} tone="info">
            {tag}
          </Badge>
        ))}
      </div>

      <Button variant="outline" onClick={handleBack}>
        <ArrowLeft size={16} className="mr-1" />
        Tilbake
      </Button>

      <Button onClick={handleSaveAndClose} disabled={saving}>
        {saving ? (
          <>
            <Loader2 size={16} className="mr-1 animate-spin" />
            Lagrer...
          </>
        ) : (
          <>
            <Save size={16} className="mr-1" />
            Lagre og lukk
          </>
        )}
      </Button>
    </div>
  );
}
