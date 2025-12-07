"use client";

import { useState } from "react";
import { Database, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackupTrigger() {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);

  async function handleBackup() {
    setStatus("running");
    setProgress(0);

    // Simulate backup progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      setProgress(i);
    }

    setStatus("done");
    setTimeout(() => {
      setStatus("idle");
      setProgress(0);
    }, 3000);
  }

  return (
    <div className="flex items-center gap-4">
      <Button
        onClick={handleBackup}
        disabled={status === "running"}
        variant="outline"
        className="gap-2"
      >
        {status === "running" ? (
          <>
            <Loader2 className="animate-spin" size={16} />
            Kjører backup... {progress}%
          </>
        ) : status === "done" ? (
          <>
            <CheckCircle className="text-green-500" size={16} />
            Backup fullført!
          </>
        ) : (
          <>
            <Database size={16} />
            Trigger backup
          </>
        )}
      </Button>
      {status === "running" && (
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
