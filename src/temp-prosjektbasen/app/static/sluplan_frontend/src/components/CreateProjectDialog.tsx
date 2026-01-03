import { useCallback, useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "../config";
import type { BaseProjectOption, SluplanPlan } from "./types";
import { labels } from "../i18n";

interface Props {
  open: boolean;
  onClose(): void;
  onCreated(plan: SluplanPlan): void;
}

interface FormState {
  baseProjectId: number | null;
  name: string;
  orderNumber: string;
  startDate: string;
  endDate: string;
  systems: string;
}

function CreateProjectDialog({ open, onClose, onCreated }: Props) {
  const defaultStart = useMemo(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }, []);

  const defaultEnd = useMemo(() => {
    const later = new Date();
    later.setDate(later.getDate() + 30);
    return later.toISOString().slice(0, 10);
  }, []);

  const [baseProjects, setBaseProjects] = useState<BaseProjectOption[]>([]);
  const [baseSearch, setBaseSearch] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<FormState>({
    baseProjectId: null,
    name: "",
    orderNumber: "",
    startDate: defaultStart,
    endDate: defaultEnd,
    systems: "",
  });

  const loadBaseProjects = useCallback(async (search: string) => {
    setLoadingOptions(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`${apiBaseUrl}/projects/base?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const data = await response.json();
      setBaseProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch (err) {
      console.warn("Klarte ikke å hente prosjektliste", err);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadBaseProjects(baseSearch);
  }, [open, baseSearch, loadBaseProjects]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      setForm({
        baseProjectId: null,
        name: "",
        orderNumber: "",
        startDate: defaultStart,
        endDate: defaultEnd,
        systems: "",
      });
    }
  }, [open]);

  const handleBaseSelect = (value: string) => {
    const id = value ? Number(value) : null;
    const option = baseProjects.find((item) => item.id === id) ?? null;
    setForm((current) => ({
      ...current,
      baseProjectId: id,
      name: option ? option.project_name : current.name,
      orderNumber: option ? option.order_number : current.orderNumber,
    }));
  };

  const formIsValid = useMemo(() => {
    if (!form.name.trim()) return false;
    if (!form.startDate || !form.endDate) return false;
    if (form.endDate < form.startDate) return false;
    return true;
  }, [form.name, form.startDate, form.endDate]);

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError(labels.createProject.errors.name);
      return;
    }
    if (!form.startDate || !form.endDate) {
      setError(labels.createProject.errors.dates);
      return;
    }
    if (form.endDate < form.startDate) {
      setError(labels.createProject.errors.dateOrder);
      return;
    }

    const systems = form.systems
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          project_id: form.baseProjectId,
          name: form.name.trim(),
          order_number: form.orderNumber.trim() || undefined,
          start_date: form.startDate,
          end_date: form.endDate,
          systems,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error ?? labels.createProject.errors.name);
        return;
      }
      onCreated(payload as SluplanPlan);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Kunne ikke opprette prosjekt.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{labels.createProject.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{labels.createProject.description}</p>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm text-slate-700">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              {labels.createProject.fields.baseProject}
            </label>
            <input
              type="search"
              value={baseSearch}
              onChange={(event) => setBaseSearch(event.target.value)}
              placeholder={labels.createProject.fields.baseProjectPlaceholder}
              className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <select
              value={form.baseProjectId ?? ""}
              onChange={(event) => handleBaseSelect(event.target.value)}
              className="mt-2 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              disabled={loadingOptions}
            >
              <option value="">—</option>
              {baseProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_name} ({project.order_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              {labels.createProject.fields.name}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                {labels.createProject.fields.startDate}
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                {labels.createProject.fields.endDate}
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
                className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              {labels.createProject.fields.orderNumber}
            </label>
            <input
              type="text"
              value={form.orderNumber}
              onChange={(event) => setForm((current) => ({ ...current, orderNumber: event.target.value }))}
              className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              {labels.createProject.fields.systems}
            </label>
            <textarea
              value={form.systems}
              onChange={(event) => setForm((current) => ({ ...current, systems: event.target.value }))}
              className="mt-1 h-24 w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder={"System A\nSystem B"}
            />
          </div>

          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            disabled={submitting}
          >
            {labels.createProject.actions.cancel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60"
            disabled={submitting || !formIsValid}
          >
            {submitting ? labels.createProject.actions.creating : labels.createProject.actions.create}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateProjectDialog;
