import { useCallback, useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "../config";
import { formatDate, formatDateTime, formatDurationDays, labels, locale } from "../i18n";
import type {
  DisciplineReportItem,
  TimeReport,
  TimeReportTask,
  UserReportItem,
} from "./types";

interface Props {
  refreshToken: number;
  projectId: number | null;
}

type TimeFilterKey = "upcoming14" | "upcoming30" | "previous30";

interface TimeFilterOption {
  key: TimeFilterKey;
  label: string;
  computeRange(): { from: string; to: string };
}

const numberFormatter = new Intl.NumberFormat(locale);

const timeFilterOptions: TimeFilterOption[] = [
  {
    key: "upcoming14",
    label: labels.reports.filters.upcoming14,
    computeRange: () => {
      const today = new Date();
      return { from: toISO(today), to: toISO(addDays(today, 14)) };
    },
  },
  {
    key: "upcoming30",
    label: labels.reports.filters.upcoming30,
    computeRange: () => {
      const today = new Date();
      return { from: toISO(today), to: toISO(addDays(today, 30)) };
    },
  },
  {
    key: "previous30",
    label: labels.reports.filters.previous30,
    computeRange: () => {
      const today = new Date();
      return { from: toISO(addDays(today, -30)), to: toISO(today) };
    },
  },
];

function addDays(input: Date, amount: number): Date {
  const next = new Date(input);
  next.setDate(next.getDate() + amount);
  return next;
}

function toISO(input: Date): string {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, "0");
  const day = `${input.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDisciplineItems(items: any[]): DisciplineReportItem[] {
  return items.map((item) => ({
    discipline: String(item?.discipline ?? "Annet"),
    taskCount: Number(item?.task_count ?? item?.taskCount ?? 0),
    planned: Number(item?.planned ?? 0),
    inProgress: Number(item?.in_progress ?? item?.inProgress ?? 0),
    completed: Number(item?.completed ?? 0),
    totalDurationDays: Number(item?.total_duration_days ?? item?.totalDurationDays ?? 0),
    averageDurationDays: Number(item?.average_duration_days ?? item?.averageDurationDays ?? 0),
  }));
}

function normalizeUserItems(items: any[]): UserReportItem[] {
  return items.map((item) => ({
    user: String(item?.user ?? "Ikke tildelt"),
    taskCount: Number(item?.task_count ?? item?.taskCount ?? 0),
    planned: Number(item?.planned ?? 0),
    inProgress: Number(item?.in_progress ?? item?.inProgress ?? 0),
    completed: Number(item?.completed ?? 0),
    totalDurationDays: Number(item?.total_duration_days ?? item?.totalDurationDays ?? 0),
    averageDurationDays: Number(item?.average_duration_days ?? item?.averageDurationDays ?? 0),
  }));
}

function normalizeTimeReport(payload: any): TimeReport | null {
  if (!payload) return null;
  const tasks: TimeReportTask[] = Array.isArray(payload.tasks)
    ? payload.tasks.map((task: any) => ({
        id: task?.id ? String(task.id) : undefined,
        title: task?.title ?? labels.rightPanel.task.label,
        start: task?.start ?? undefined,
        end: task?.end ?? undefined,
        assignee: task?.assignee ?? undefined,
        status: task?.status ?? undefined,
        discipline: task?.discipline ?? undefined,
        durationDays: Number(task?.duration_days ?? task?.durationDays ?? 0),
      }))
    : [];

  return {
    from: payload.from ?? "",
    to: payload.to ?? "",
    generatedAt: payload.generated_at ?? payload.generatedAt ?? undefined,
    totalTasks: Number(payload.total_tasks ?? payload.totalTasks ?? tasks.length),
    planned: Number(payload.planned ?? 0),
    inProgress: Number(payload.in_progress ?? payload.inProgress ?? 0),
    completed: Number(payload.completed ?? 0),
    totalDurationDays: Number(payload.total_duration_days ?? payload.totalDurationDays ?? 0),
    tasks,
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url, { credentials: "include" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? "Uventet feil ved henting av rapport.");
  }
  return payload;
}

function Reports({ refreshToken, projectId }: Props) {
  const [timeFilter, setTimeFilter] = useState<TimeFilterKey>("upcoming30");
  const [disciplineReport, setDisciplineReport] = useState<DisciplineReportItem[]>([]);
  const [userReport, setUserReport] = useState<UserReportItem[]>([]);
  const [timeReport, setTimeReport] = useState<TimeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTimeFilter = useMemo(
    () => timeFilterOptions.find((option) => option.key === timeFilter) ?? timeFilterOptions[0],
    [timeFilter]
  );

  const refreshReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = currentTimeFilter.computeRange();
      const disciplineParams = new URLSearchParams();
      const userParams = new URLSearchParams();
      const timeParams = new URLSearchParams();
      if (projectId) {
        disciplineParams.set("project_id", String(projectId));
        userParams.set("project_id", String(projectId));
        timeParams.set("project_id", String(projectId));
      }
      timeParams.set("from", from);
      timeParams.set("to", to);
      const [disciplinePayload, userPayload, timePayload] = await Promise.all([
        fetchJson(`${apiBaseUrl}/reports/by-discipline${disciplineParams.toString() ? `?${disciplineParams.toString()}` : ""}`),
        fetchJson(`${apiBaseUrl}/reports/by-user${userParams.toString() ? `?${userParams.toString()}` : ""}`),
        fetchJson(`${apiBaseUrl}/reports/time?${timeParams.toString()}`),
      ]);
      setDisciplineReport(normalizeDisciplineItems(disciplinePayload?.items ?? []));
      setUserReport(normalizeUserItems(userPayload?.items ?? []));
      setTimeReport(normalizeTimeReport(timePayload));
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.reports.error);
    } finally {
      setLoading(false);
    }
  }, [currentTimeFilter, projectId]);

  useEffect(() => {
    void refreshReports();
  }, [refreshReports, refreshToken]);

  const lastUpdated = useMemo(() => {
    const timestamps = [
      timeReport?.generatedAt,
    ];
    const latest = timestamps.filter(Boolean).sort().pop();
    return latest ? formatDateTime(latest) : null;
  }, [timeReport]);

  const totalDurationByDiscipline = useMemo(
    () => disciplineReport.reduce((sum, item) => sum + item.totalDurationDays, 0),
    [disciplineReport]
  );

  const totalDurationByUser = useMemo(
    () => userReport.reduce((sum, item) => sum + item.totalDurationDays, 0),
    [userReport]
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">{labels.reports.heading}</h3>
          <p className="text-xs text-slate-500">{labels.reports.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={timeFilter}
            onChange={(event) => setTimeFilter(event.target.value as TimeFilterKey)}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
            aria-label={labels.reports.filterLabel}
          >
            {timeFilterOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void refreshReports()}
            className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={loading}
          >
            {loading ? labels.reports.loading : labels.reports.refresh}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold uppercase text-slate-500">{labels.reports.perDiscipline.title}</h4>
          <p className="mt-1 text-xs text-slate-500">
            {labels.reports.perDiscipline.summary(
              disciplineReport.length,
              formatDurationDays(totalDurationByDiscipline)
            )}
          </p>
          {disciplineReport.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{labels.reports.perDiscipline.noData}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{labels.reports.perDiscipline.headers.discipline}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perDiscipline.headers.tasks}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perDiscipline.headers.planned}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perDiscipline.headers.inProgress}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perDiscipline.headers.completed}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perDiscipline.headers.avgDuration}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {disciplineReport.map((item) => (
                    <tr key={item.discipline} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700">{item.discipline}</td>
                      <td className="px-3 py-2 text-right">{numberFormatter.format(item.taskCount)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{numberFormatter.format(item.planned)}</td>
                      <td className="px-3 py-2 text-right text-blue-600">{numberFormatter.format(item.inProgress)}</td>
                      <td className="px-3 py-2 text-right text-green-600">{numberFormatter.format(item.completed)}</td>
                      <td className="px-3 py-2 text-right">{formatDurationDays(item.averageDurationDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold uppercase text-slate-500">{labels.reports.perUser.title}</h4>
          <p className="mt-1 text-xs text-slate-500">
            {labels.reports.perUser.summary(userReport.length, formatDurationDays(totalDurationByUser))}
          </p>
          {userReport.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{labels.reports.perUser.noData}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{labels.reports.perUser.headers.user}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perUser.headers.tasks}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perUser.headers.planned}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perUser.headers.inProgress}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perUser.headers.completed}</th>
                    <th className="px-3 py-2 text-right">{labels.reports.perUser.headers.avgDuration}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userReport.map((item) => (
                    <tr key={item.user} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700">{item.user}</td>
                      <td className="px-3 py-2 text-right">{numberFormatter.format(item.taskCount)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{numberFormatter.format(item.planned)}</td>
                      <td className="px-3 py-2 text-right text-blue-600">{numberFormatter.format(item.inProgress)}</td>
                      <td className="px-3 py-2 text-right text-green-600">{numberFormatter.format(item.completed)}</td>
                      <td className="px-3 py-2 text-right">{formatDurationDays(item.averageDurationDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold uppercase text-slate-500">{labels.reports.time.title}</h4>
            <p className="text-xs text-slate-500">
              {formatDate(timeReport?.from)} – {formatDate(timeReport?.to)}
            </p>
          </div>
          <div className="flex gap-3 text-xs text-slate-600">
            <span>{labels.reports.time.summary.planned}: <strong>{numberFormatter.format(timeReport?.planned ?? 0)}</strong></span>
            <span>{labels.reports.time.summary.inProgress}: <strong className="text-blue-600">{numberFormatter.format(timeReport?.inProgress ?? 0)}</strong></span>
            <span>{labels.reports.time.summary.completed}: <strong className="text-green-600">{numberFormatter.format(timeReport?.completed ?? 0)}</strong></span>
            <span>{labels.reports.time.summary.total}: <strong>{numberFormatter.format(timeReport?.totalTasks ?? 0)}</strong></span>
          </div>
        </div>

        {timeReport?.tasks?.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{labels.reports.time.headers.task}</th>
                  <th className="px-3 py-2">{labels.reports.time.headers.discipline}</th>
                  <th className="px-3 py-2">{labels.reports.time.headers.assignee}</th>
                  <th className="px-3 py-2">{labels.reports.time.headers.status}</th>
                  <th className="px-3 py-2">{labels.reports.time.headers.start}</th>
                  <th className="px-3 py-2">{labels.reports.time.headers.end}</th>
                  <th className="px-3 py-2 text-right">{labels.reports.time.headers.duration}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {timeReport.tasks.slice(0, 10).map((task) => (
                  <tr key={task.id ?? `${task.title}-${task.start}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-700">{task.title}</td>
                    <td className="px-3 py-2 text-slate-500">{task.discipline ?? labels.common.unknown}</td>
                    <td className="px-3 py-2 text-slate-500">{task.assignee ?? labels.common.unassigned}</td>
                    <td className="px-3 py-2 text-slate-500">{task.status ?? labels.common.statusPlanned}</td>
                    <td className="px-3 py-2 text-slate-500">{formatDate(task.start)}</td>
                    <td className="px-3 py-2 text-slate-500">{formatDate(task.end)}</td>
                    <td className="px-3 py-2 text-right">{formatDurationDays(task.durationDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {timeReport.tasks.length > 10 && (
              <p className="mt-2 text-xs text-slate-500">
                {labels.reports.time.showing(
                  Math.min(10, timeReport.tasks.length),
                  timeReport.tasks.length
                )}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{labels.reports.time.noData}</p>
        )}
      </section>

      {lastUpdated && (
        <p className="text-right text-[11px] text-slate-400">
          {labels.reports.lastUpdated(lastUpdated)}
        </p>
      )}
    </div>
  );
}

export default Reports;
