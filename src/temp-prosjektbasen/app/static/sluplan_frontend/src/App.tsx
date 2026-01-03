import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GanttView from "./components/GanttView";
import TaskTable from "./components/TaskTable";
import RightTaskPanel from "./components/RightTaskPanel";
import Reports from "./components/Reports";
import ImportExcelDialog from "./components/ImportExcelDialog";
import CreateProjectDialog from "./components/CreateProjectDialog";
import {
  flattenTasks,
  normalizeDependencies,
  normalizeTask,
  normalizeTasks,
  ResourceCatalog,
  SluplanAlertsResponse,
  SluplanDependency,
  SluplanPlan,
  SluplanProject,
  SluplanTask,
} from "./components/types";
import { apiBaseUrl } from "./config";
import { describeDue, formatDate, formatDateTime, labels } from "./i18n";

type FetchResult<T> = { data: T | null; error: string | null };

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<FetchResult<T>> => {
  try {
    const response = await fetch(url, { credentials: "include", ...init });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { data: null, error: payload?.error ?? "Uventet feil" };
    }
    return { data: payload as T, error: null };
  } catch (error) {
    console.warn("Fetch-feil", error);
    return { data: null, error: (error as Error).message };
  }
};

function App() {
  const [projects, setProjects] = useState<SluplanProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [plan, setPlan] = useState<SluplanPlan | null>(null);
  const [tasks, setTasks] = useState<SluplanTask[]>([]);
  const [dependencies, setDependencies] = useState<SluplanDependency[]>([]);
  const [resourceCatalog, setResourceCatalog] = useState<ResourceCatalog | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(true);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isImportOpen, setImportOpen] = useState(false);
  const [isCreateProjectOpen, setCreateProjectOpen] = useState(false);

  const [alerts, setAlerts] = useState<SluplanAlertsResponse | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const alertsContainerRef = useRef<HTMLDivElement | null>(null);

  const [reportsRefreshKey, setReportsRefreshKey] = useState(0);

  const loadResourceCatalog = useCallback(async () => {
    const { data } = await fetchJson<ResourceCatalog>(`${apiBaseUrl}/resources`);
    if (data) {
      setResourceCatalog(data);
    }
  }, []);

  const loadAlerts = useCallback(
    async (projectId?: number) => {
      const pid = projectId ?? selectedProjectId;
      if (!pid) {
        setAlerts(null);
        return;
      }
      setAlertsLoading(true);
      setAlertsError(null);
      const { data, error } = await fetchJson<SluplanAlertsResponse>(`${apiBaseUrl}/alerts?project_id=${pid}`);
      if (error || !data) {
        setAlertsError(error ?? labels.app.alerts.errorFallback);
        setAlerts(null);
      } else {
        setAlerts({
          generated_at: data.generated_at,
          reference_date: data.reference_date,
          upcoming: data.upcoming ?? [],
          today: data.today ?? [],
          overdue: data.overdue ?? [],
        });
      }
      setAlertsLoading(false);
    },
    [selectedProjectId]
  );

  const loadPlan = useCallback(
    async (projectId: number) => {
      const { data, error } = await fetchJson<SluplanPlan>(`${apiBaseUrl}/tasks?project_id=${projectId}`);
      if (error || !data) {
        console.warn("Klarte ikke å hente plan", error);
        return;
      }
      setPlan(data);
      setTasks(normalizeTasks(data.tasks ?? []));
      setDependencies(normalizeDependencies(data.dependencies));
      setSelectedProjectId(data.project?.id ?? projectId);
      setSelectedTaskId(null);
      setReportsRefreshKey((value) => value + 1);
      void loadAlerts(data.project?.id ?? projectId);
    },
    [loadAlerts]
  );

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    const { data } = await fetchJson<{ projects: SluplanProject[] }>(`${apiBaseUrl}/projects`);
    if (data?.projects) {
      setProjects(data.projects);
      const preferredId = data.projects.find((project) => project.id === selectedProjectId)?.id ?? data.projects[0]?.id ?? null;
      if (preferredId) {
        void loadPlan(preferredId);
      } else {
        setPlan(null);
        setTasks([]);
        setDependencies([]);
        setSelectedProjectId(null);
      }
    }
    setProjectsLoading(false);
  }, [loadPlan, selectedProjectId]);

  useEffect(() => {
    void loadResourceCatalog();
  }, [loadResourceCatalog]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!alertsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!alertsContainerRef.current) return;
      if (!alertsContainerRef.current.contains(event.target as Node)) {
        setAlertsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [alertsOpen]);

  const totalAlerts = useMemo(() => {
    if (!alerts) return 0;
    return alerts.upcoming.length + alerts.today.length + alerts.overdue.length;
  }, [alerts]);

  const selectedTask = useMemo(
    () => tasks && selectedTaskId ? findTaskById(tasks, selectedTaskId) : null,
    [tasks, selectedTaskId]
  );

  const availableResources = useMemo(() => {
    if (resourceCatalog?.users?.length) {
      return resourceCatalog.users.map((user) => user.name).filter(Boolean).sort();
    }
    const set = new Set<string>();
    flattenTasks(tasks).forEach((task) => {
      if (task.assignee) set.add(task.assignee);
    });
    return Array.from(set).sort();
  }, [resourceCatalog?.users, tasks]);

  const alertCategories = useMemo(
    () => [
      {
        key: "upcoming",
        title: labels.app.alerts.categories.upcoming,
        tone: "text-blue-600",
        items: alerts?.upcoming ?? [],
      },
      {
        key: "today",
        title: labels.app.alerts.categories.today,
        tone: "text-orange-600",
        items: alerts?.today ?? [],
      },
      {
        key: "overdue",
        title: labels.app.alerts.categories.overdue,
        tone: "text-red-600",
        items: alerts?.overdue ?? [],
      },
    ],
    [alerts]
  );

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId((current) => (current === taskId ? null : taskId));
  };

  const handleTaskChange = useCallback((taskId: string, changes: Partial<SluplanTask>) => {
    setTasks((current) => {
      const next = applyTaskChanges(current, taskId, changes);
      return next === current ? current : normalizeTasks(next);
    });
  }, []);

  const handleTaskUpdated = useCallback(
    (updated: SluplanTask) => {
      const normalized = normalizeTask(updated);
      setTasks((current) => normalizeTasks(current.map((task) => (task.id === normalized.id ? normalized : task))));
      setReportsRefreshKey((value) => value + 1);
      void loadAlerts(selectedProjectId ?? undefined);
    },
    [loadAlerts, selectedProjectId]
  );

  const replacePlan = useCallback(
    (nextPlan: SluplanPlan) => {
      setPlan(nextPlan);
      setTasks(normalizeTasks(nextPlan.tasks ?? []));
      setDependencies(normalizeDependencies(nextPlan.dependencies));
      setSelectedProjectId(nextPlan.project?.id ?? null);
      setReportsRefreshKey((value) => value + 1);
      void loadAlerts(nextPlan.project?.id ?? undefined);
    },
    [loadAlerts]
  );

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const searchLower = projectSearch.trim().toLowerCase();
    return projects.filter((project) =>
      project.name.toLowerCase().includes(searchLower) ||
      (project.order_number ?? "").toLowerCase().includes(searchLower)
    );
  }, [projects, projectSearch]);

  const selectedProject = useMemo(
    () => (selectedProjectId ? projects.find((project) => project.id === selectedProjectId) ?? null : null),
    [projects, selectedProjectId]
  );

  const handleProjectSelect = (projectId: number | null) => {
    if (!projectId) {
      return;
    }
    setSelectedProjectId(projectId);
    void loadPlan(projectId);
  };

  const handleProjectCreated = (newPlan: SluplanPlan) => {
    replacePlan(newPlan);
    void loadProjects();
  };

  const handleRefreshProjects = () => {
    void loadProjects();
  };

  const alertsBadge = totalAlerts > 0 && (
    <span className="ml-1 rounded-full bg-primary px-2 py-[2px] text-xs font-semibold text-white">
      {totalAlerts}
    </span>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-primary">{labels.app.title}</h1>
            <p className="text-sm text-slate-600">{labels.app.subtitle}</p>
            {selectedProject && (
              <p className="text-xs text-slate-500">
                {labels.app.projectSelector.dateRange(formatDate(selectedProject.start_date), formatDate(selectedProject.end_date))}
                {selectedProject.order_number ? ` · ${labels.app.projectSelector.orderNumber(selectedProject.order_number)}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase text-slate-500" htmlFor="project-search">
                {labels.app.projectSelector.label}
              </label>
              <input
                id="project-search"
                type="search"
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder={labels.app.projectSelector.searchPlaceholder}
                className="w-48 rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <select
                value={selectedProjectId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  handleProjectSelect(value ? Number(value) : null);
                }}
                className="w-56 rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                disabled={projectsLoading || filteredProjects.length === 0}
              >
                {filteredProjects.length === 0 ? (
                  <option value="">{labels.app.projectSelector.empty}</option>
                ) : (
                  filteredProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.order_number ? ` (${project.order_number})` : ""}
                      {project.location ? ` – ${project.location}` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setCreateProjectOpen(true)}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {labels.app.projectSelector.newButton}
            </button>
            <button
              type="button"
              onClick={handleRefreshProjects}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              ↻
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-dark"
              disabled={!selectedProjectId}
            >
              {labels.app.importButton}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedProjectId) return;
                fetch(`${apiBaseUrl}/tasks/reset`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ project_id: selectedProjectId }),
                })
                  .then((response) => response.json())
                  .then((payload) => {
                    replacePlan(payload as SluplanPlan);
                  })
                  .catch((error) => console.error("Kunne ikke tilbakestille plan", error));
              }}
              className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              disabled={!selectedProjectId}
            >
              {labels.app.resetButton}
            </button>
            <div className="relative" ref={alertsContainerRef}>
              <button
                type="button"
                onClick={() => setAlertsOpen((current) => !current)}
                className="flex items-center gap-2 rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                <span role="img" aria-hidden="true">
                  🔔
                </span>
                <span>{labels.app.alertsButton}</span>
                {alertsBadge}
              </button>
              {alertsOpen && (
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-semibold text-slate-700">{labels.app.alerts.heading}</p>
                    <button
                      type="button"
                      onClick={() => void loadAlerts()}
                      className="text-xs text-primary underline-offset-2 hover:underline disabled:text-slate-400"
                      disabled={alertsLoading}
                    >
                      {alertsLoading ? labels.app.alerts.loading : labels.app.alerts.refresh}
                    </button>
                  </div>
                  {alertsError && (
                    <div className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-600">
                      {alertsError}
                    </div>
                  )}
                  {!alertsError &&
                    alertCategories.map(({ key, title, tone, items }) => (
                      <div key={key} className="mb-3 last:mb-0">
                        <p className={`text-xs font-semibold uppercase ${tone}`}>{title}</p>
                        {items.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-500">{labels.app.alerts.empty}</p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {items.map((item, index) => (
                              <li key={`${item.id ?? key}-${index}`} className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                                <p className="text-sm font-medium">{item.title ?? labels.common.unknown}</p>
                                <p className="text-xs text-slate-500">
                                  {(item.end ?? item.start) ?? labels.common.unknownDate} · {item.assignee ?? labels.common.unassigned}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">{describeDue(item.days_until_due)}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  {alerts?.generated_at && (
                    <p className="mt-3 text-[11px] text-slate-400">
                      {labels.app.alerts.updatedPrefix} {formatDateTime(alerts.generated_at)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col lg:flex-row">
        <section className="flex-1 border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col lg:flex-row">
            <div className="h-1/2 min-h-[280px] border-b border-slate-200 lg:h-auto lg:min-h-full lg:w-[34%] lg:border-b-0 lg:border-r">
              <TaskTable tasks={tasks} selectedTaskId={selectedTaskId} onTaskSelect={handleTaskClick} />
            </div>
            <div className="h-1/2 min-h-[280px] lg:h-auto lg:flex-1">
              <GanttView
                tasks={tasks}
                dependencies={dependencies}
                selectedTaskId={selectedTaskId}
                onTaskSelect={handleTaskClick}
                onTaskChange={handleTaskChange}
              />
            </div>
          </div>
        </section>

        <aside className="relative lg:w-[28%]">
          <RightTaskPanel
            task={selectedTask}
            resources={availableResources}
            resourceCatalog={resourceCatalog}
            projectId={selectedProjectId}
            onClose={() => setSelectedTaskId(null)}
            onTaskUpdated={handleTaskUpdated}
          />
        </aside>
      </main>

      <footer className="border-t border-slate-200 bg-white p-4">
        <Reports refreshToken={reportsRefreshKey} projectId={selectedProjectId} />
      </footer>

      <ImportExcelDialog
        open={isImportOpen}
        onClose={() => setImportOpen(false)}
        onImported={(nextPlan) => replacePlan(nextPlan)}
        projectId={selectedProjectId}
      />

      <CreateProjectDialog
        open={isCreateProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}

function applyTaskChanges(list: SluplanTask[], taskId: string, changes: Partial<SluplanTask>): SluplanTask[] {
  let mutated = false;

  const updateList = (items: SluplanTask[]): SluplanTask[] =>
    items.map((task) => {
      let updatedTask = task;
      let changedHere = false;

      if (task.id === taskId) {
        updatedTask = { ...task, ...changes };
        changedHere = true;
      }

      if (task.children) {
        const nextChildren = updateList(task.children);
        if (nextChildren !== task.children) {
          updatedTask = changedHere ? { ...updatedTask, children: nextChildren } : { ...task, children: nextChildren };
          changedHere = true;
        }
      }

      if (changedHere) {
        mutated = true;
        return updatedTask;
      }
      return task;
    });

  const result = updateList(list);
  return mutated ? result : list;
}

function findTaskById(list: SluplanTask[], id: string | null): SluplanTask | null {
  if (!id) return null;
  for (const task of list) {
    if (task.id === id) return task;
    if (task.children) {
      const childHit = findTaskById(task.children, id);
      if (childHit) return childHit;
    }
  }
  return null;
}

export default App;
