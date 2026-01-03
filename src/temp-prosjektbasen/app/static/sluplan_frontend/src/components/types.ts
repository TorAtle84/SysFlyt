import { labels } from "../i18n";

export type TaskStatus = "planlagt" | "pågår" | "ferdig" | "mangler";

export interface TaskComment {
  id: string;
  text: string;
  author?: string | null;
  created_at?: string;
  mentions?: string[];
}

export interface TaskFile {
  id: string;
  filename: string;
  size: number;
  uploaded_at?: string;
  content_type?: string | null;
}

export interface SluplanTask {
  id: string;
  title?: string;
  name?: string;
  start: string; // ISO-date (local)
  end: string;   // ISO-date (local)
  assignee?: string | null;
  status?: TaskStatus;
  kind?: "task" | "system" | "subtask" | "milestone";
  children?: SluplanTask[] | null;
  comments?: TaskComment[] | null;
  files?: TaskFile[] | null;
}

export interface SluplanDependency {
  id: string;
  fromId: string;
  toId: string;
  type: "FS";
}

export interface SluplanProject {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  order_number?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  location?: string | null;
}

export interface BaseProjectOption {
  id: number;
  project_name: string;
  order_number: string;
  location?: string | null;
}

export interface ResourceUser {
  id: number;
  name: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  fag?: string | null;
  role?: string | null;
  location?: string | null;
}

export interface ResourceDiscipline {
  id: number;
  name: string;
}

export interface ResourceCatalog {
  users: ResourceUser[];
  disciplines: ResourceDiscipline[];
}

export interface SluplanPlan {
  project: SluplanProject;
  tasks: SluplanTask[];
  dependencies: SluplanDependency[];
}

export interface SluplanAlert {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  assignee?: string | null;
  status?: string;
  kind?: string;
  days_until_due?: number;
}

export interface SluplanAlertsResponse {
  generated_at?: string;
  reference_date?: string;
  upcoming: SluplanAlert[];
  today: SluplanAlert[];
  overdue: SluplanAlert[];
}

export interface DisciplineReportItem {
  discipline: string;
  taskCount: number;
  planned: number;
  inProgress: number;
  completed: number;
  totalDurationDays: number;
  averageDurationDays: number;
}

export interface UserReportItem {
  user: string;
  taskCount: number;
  planned: number;
  inProgress: number;
  completed: number;
  totalDurationDays: number;
  averageDurationDays: number;
}

export interface TimeReportTask {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  assignee?: string | null;
  status?: string;
  discipline?: string;
  durationDays: number;
}

export interface TimeReport {
  from: string;
  to: string;
  generatedAt?: string;
  totalTasks: number;
  planned: number;
  inProgress: number;
  completed: number;
  totalDurationDays: number;
  tasks: TimeReportTask[];
}

const fallbackId = () => Math.random().toString(36).slice(2);

export function normalizeTask(task: SluplanTask): SluplanTask {
  if (typeof task !== "object" || task === null) throw new Error("Ugyldig oppgaveobjekt");
  const name = task.title ?? task.name ?? labels.rightPanel.task.label;
  const children = (task.children ?? []).map(normalizeTask);
  const comments = (task.comments ?? []).map((comment) => ({
    id: comment?.id ? String(comment.id) : fallbackId(),
    text: String(comment?.text ?? ""),
    author: comment?.author ?? null,
    created_at: comment?.created_at ?? undefined,
    mentions: Array.isArray(comment?.mentions) ? comment.mentions.map(String) : [],
  }));
  const files = (task.files ?? []).map((file) => ({
    id: file?.id ? String(file.id) : fallbackId(),
    filename: String(file?.filename ?? "vedlegg"),
    size: Number.isFinite(file?.size) ? Number(file.size) : 0,
    uploaded_at: file?.uploaded_at ?? undefined,
    content_type: file?.content_type ?? null,
  }));
  return { ...task, title: name, name, children, comments, files };
}

export function normalizeTasks(tasks: SluplanTask[]): SluplanTask[] {
  return tasks.map(normalizeTask);
}

export function normalizeDependency(dependency: SluplanDependency): SluplanDependency {
  if (typeof dependency !== "object" || dependency === null) {
    throw new Error("Ugyldig dependency-objekt");
  }
  return {
    id: dependency.id ? String(dependency.id) : fallbackId(),
    fromId: String(dependency.fromId ?? ""),
    toId: String(dependency.toId ?? ""),
    type: dependency.type === "FS" ? "FS" : "FS",
  };
}

export function normalizeDependencies(dependencies: SluplanDependency[] | undefined | null): SluplanDependency[] {
  if (!Array.isArray(dependencies)) return [];
  return dependencies
    .map((dependency) => {
      try {
        return normalizeDependency(dependency);
      } catch (error) {
        console.warn("Ignorerer ugyldig dependency", dependency, error);
        return null;
      }
    })
    .filter((dependency): dependency is SluplanDependency => dependency !== null);
}

export function flattenTasks(tasks: SluplanTask[]): SluplanTask[] {
  const result: SluplanTask[] = [];
  const visit = (list: SluplanTask[]) => {
    list.forEach((task) => {
      result.push(task);
      if (task.children?.length) visit(task.children);
    });
  };
  visit(tasks);
  return result;
}
