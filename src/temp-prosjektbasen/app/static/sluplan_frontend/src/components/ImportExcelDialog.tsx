import { useCallback, useState } from "react";
import { apiBaseUrl } from "../config";
import { labels } from "../i18n";
import type { SluplanPlan } from "./types";

interface Props {
  open: boolean;
  onClose(): void;
  onImported(plan: SluplanPlan): void;
  projectId: number | null;
}

function ImportExcelDialog({ open, onClose, onImported, projectId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
  };

  const handleSubmit = useCallback(async () => {
    if (!file) {
      setError(labels.importDialog.selectPrompt);
      return;
    }
    if (!projectId) {
      setError(labels.importDialog.missingProject);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${apiBaseUrl}/import/excel?project_id=${projectId}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? labels.importDialog.importError);
        return;
      }
      if (!payload || !Array.isArray(payload.tasks)) {
        setError(labels.importDialog.unexpected);
        return;
      }
      onImported(payload as SluplanPlan);
      onClose();
      setFile(null);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(labels.importDialog.importError);
    } finally {
      setLoading(false);
    }
  }, [file, projectId, onClose, onImported]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-lg">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{labels.importDialog.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{labels.importDialog.description}</p>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm text-slate-700">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500">{labels.importDialog.label}</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm"
              disabled={loading}
            />
          </div>
          {file && (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {labels.importDialog.selectedFile} <strong>{file.name}</strong>
            </div>
          )}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            onClick={() => {
              setFile(null);
              setError(null);
              onClose();
            }}
            disabled={loading}
          >
            {labels.importDialog.cancel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60"
            disabled={loading}
          >
            {loading ? labels.importDialog.submitting : labels.importDialog.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportExcelDialog;
