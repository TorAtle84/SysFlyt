import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SluplanDependency, SluplanTask } from "./types";
import { labels, locale } from "../i18n";

const DAY_IN_MS = 86_400_000;
const LABEL_COLUMN_WIDTH = 240;
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 40;

type ZoomLevel = "day" | "week" | "month";
type InteractionMode = "move" | "resize-start" | "resize-end";

const ZOOM_PIXEL_PER_DAY: Record<ZoomLevel, number> = {
  day: 64,
  week: 32,
  month: 18,
};

interface Props {
  tasks: SluplanTask[];
  dependencies: SluplanDependency[];
  selectedTaskId: string | null;
  onTaskSelect(id: string): void;
  onTaskChange(id: string, changes: Partial<SluplanTask>): void;
}

interface FlatTask {
  task: SluplanTask;
  depth: number;
}

interface InteractionState {
  taskId: string;
  mode: InteractionMode;
  originX: number;
  originScrollLeft: number;
  originalStart: Date;
  originalEnd: Date;
  lastDelta: number;
}

interface RowInfo {
  task: SluplanTask;
  depth: number;
  left: number;
  barWidth: number;
  isMilestone: boolean;
  milestoneSize: number;
  rowTop: number;
  rowCenter: number;
  labelIndent: number;
  anchorStart: number;
  anchorEnd: number;
}

interface DependencyRenderLine {
  id: string;
  path: string;
  broken: boolean;
  toX: number;
  toY: number;
}

function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number): Date {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + amount);
  return clone;
}

function diffInDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_IN_MS);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function flattenTasks(tasks: SluplanTask[], depth = 0): FlatTask[] {
  return tasks.flatMap((task) => {
    const current: FlatTask = { task, depth };
    const children = task.children ? flattenTasks(task.children, depth + 1) : [];
    return [current, ...children];
  });
}

function GanttView({ tasks, dependencies, selectedTaskId, onTaskSelect, onTaskChange }: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const { flatTasks, timelineStart, timelineEnd } = useMemo(() => {
    const flattened = flattenTasks(tasks);
    if (!flattened.length) {
      const today = startOfDay(new Date());
      return {
        flatTasks: [] as FlatTask[],
        timelineStart: addDays(today, -3),
        timelineEnd: addDays(today, 7),
      };
    }

    let minStart = parseISODate(flattened[0].task.start);
    let maxEnd = parseISODate(flattened[0].task.end);

    flattened.forEach(({ task }) => {
      const startDate = parseISODate(task.start);
      const endDate = parseISODate(task.end);
      if (startDate < minStart) minStart = startDate;
      if (endDate > maxEnd) maxEnd = endDate;
    });

    return {
      flatTasks: flattened,
      timelineStart: addDays(minStart, -2),
      timelineEnd: addDays(maxEnd, 6),
    };
  }, [tasks]);

  const pxPerDay = ZOOM_PIXEL_PER_DAY[zoom];
  const totalDays = Math.max(1, diffInDays(timelineStart, timelineEnd) + 1);
  const timelineWidth = totalDays * pxPerDay;

  const dayColumns = useMemo(() => {
    const columns: Date[] = [];
    for (let offset = 0; offset < totalDays; offset += 1) {
      columns.push(addDays(timelineStart, offset));
    }
    return columns;
  }, [timelineStart, totalDays]);

  const today = startOfDay(new Date());
  const showTodayLine = today >= timelineStart && today <= timelineEnd;
  const todayOffset = diffInDays(timelineStart, today) * pxPerDay;

  const upcomingDate = useMemo(() => {
    const futureDates = flatTasks
      .map(({ task }) => parseISODate(task.start))
      .filter((date) => date > today)
      .sort((a, b) => a.getTime() - b.getTime());
    return futureDates[0] ?? null;
  }, [flatTasks, today]);

  const showUpcomingLine = upcomingDate ? upcomingDate >= timelineStart && upcomingDate <= timelineEnd : false;
  const upcomingOffset = upcomingDate ? diffInDays(timelineStart, upcomingDate) * pxPerDay : 0;

  const rows = useMemo<RowInfo[]>(() => {
    return flatTasks.map(({ task, depth }, index) => {
      const startDate = parseISODate(task.start);
      const endDate = parseISODate(task.end);
      const durationDays = Math.max(0, diffInDays(startDate, endDate));
      const left = Math.max(0, diffInDays(timelineStart, startDate)) * pxPerDay;
      const labelIndent = depth * 16;
      const isMilestone = durationDays === 0;
      const barWidth = isMilestone
        ? Math.max(pxPerDay * 0.75, 16)
        : Math.max(pxPerDay * (durationDays + 1) - 6, pxPerDay * 0.75);
      const milestoneSize = Math.max(16, pxPerDay * 0.9);
      const rowTop = index * ROW_HEIGHT;
      const rowCenter = rowTop + ROW_HEIGHT / 2;
      const anchorStart = isMilestone ? left + pxPerDay / 2 : left;
      const anchorEnd = isMilestone ? left + pxPerDay / 2 : left + pxPerDay * (durationDays + 1);
      return {
        task,
        depth,
        left,
        barWidth,
        isMilestone,
        milestoneSize,
        rowTop,
        rowCenter,
        labelIndent,
        anchorStart,
        anchorEnd,
      };
    });
  }, [flatTasks, pxPerDay, timelineStart]);

  const timelineHeight = Math.max(rows.length * ROW_HEIGHT, ROW_HEIGHT);

  const taskRowMap = useMemo(() => {
    const map = new Map<string, RowInfo>();
    rows.forEach((row) => {
      map.set(row.task.id, row);
    });
    return map;
  }, [rows]);

  const dependenciesByTarget = useMemo(() => {
    const map = new Map<string, SluplanDependency[]>();
    dependencies.forEach((dependency) => {
      if (!taskRowMap.has(dependency.toId) || !taskRowMap.has(dependency.fromId)) {
        return;
      }
      const existing = map.get(dependency.toId);
      if (existing) {
        existing.push(dependency);
      } else {
        map.set(dependency.toId, [dependency]);
      }
    });
    return map;
  }, [dependencies, taskRowMap]);

  const dependencyAnalysis = useMemo(() => {
    const lines: DependencyRenderLine[] = [];
    const brokenTargets = new Set<string>();

    dependencies.forEach((dependency) => {
      const fromRow = taskRowMap.get(dependency.fromId);
      const toRow = taskRowMap.get(dependency.toId);
      if (!fromRow || !toRow) return;

      const fromEnd = parseISODate(fromRow.task.end);
      const toStart = parseISODate(toRow.task.start);
      const broken = toStart < fromEnd;
      if (broken) {
        brokenTargets.add(dependency.toId);
      }

      const fromX = Math.min(Math.max(fromRow.anchorEnd, 0), timelineWidth);
      const toX = Math.min(Math.max(toRow.anchorStart, 0), timelineWidth);
      const fromY = fromRow.rowCenter;
      const toY = toRow.rowCenter;
      const diffX = toX - fromX;
      const control = Math.max(24, Math.min(Math.abs(diffX) / 2, 120));
      const cp1x = Math.min(Math.max(fromX + control, 0), timelineWidth);
      const cp2x = Math.min(Math.max(toX - control, 0), timelineWidth);

      const path = `M ${fromX} ${fromY} C ${cp1x} ${fromY}, ${cp2x} ${toY}, ${toX} ${toY}`;
      lines.push({
        id: dependency.id,
        path,
        broken,
        toX,
        toY,
      });
    });

    return { lines, brokenTargets };
  }, [dependencies, taskRowMap, timelineWidth]);

  useEffect(() => {
    if (!warning) return undefined;
    const timeout = window.setTimeout(() => setWarning(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [warning]);

  useEffect(() => {
    if (!interaction) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const scroller = scrollerRef.current;
      const currentScroll = scroller?.scrollLeft ?? 0;
      const deltaPx = event.clientX - interaction.originX + (currentScroll - interaction.originScrollLeft);
      const deltaDays = Math.round(deltaPx / pxPerDay);
      if (deltaDays === interaction.lastDelta) return;

      let nextStart = interaction.originalStart;
      let nextEnd = interaction.originalEnd;

      if (interaction.mode === "move") {
        nextStart = addDays(interaction.originalStart, deltaDays);
        nextEnd = addDays(interaction.originalEnd, deltaDays);
      } else if (interaction.mode === "resize-start") {
        nextStart = addDays(interaction.originalStart, deltaDays);
        if (nextStart > interaction.originalEnd) {
          nextStart = interaction.originalEnd;
        }
      } else if (interaction.mode === "resize-end") {
        nextEnd = addDays(interaction.originalEnd, deltaDays);
        if (nextEnd < interaction.originalStart) {
          nextEnd = interaction.originalStart;
        }
      }

      if (interaction.mode === "resize-start" && nextStart > nextEnd) {
        nextStart = nextEnd;
      }
      if (interaction.mode === "resize-end" && nextEnd < nextStart) {
        nextEnd = nextStart;
      }

      const payload: Partial<SluplanTask> = {};
      if (interaction.mode === "move" || interaction.mode === "resize-start") {
        payload.start = formatISODate(nextStart);
      }
      if (interaction.mode === "move" || interaction.mode === "resize-end") {
        payload.end = formatISODate(nextEnd);
      }

      if (payload.start) {
        const blocking = dependenciesByTarget.get(interaction.taskId) ?? [];
        const violates = blocking.some((dependency) => {
          const fromRow = taskRowMap.get(dependency.fromId);
          if (!fromRow) return false;
          const predecessorEnd = parseISODate(fromRow.task.end);
          return nextStart < predecessorEnd;
        });
        if (violates) {
          setWarning(labels.gantt.validation.predecessor);
          return;
        }
      }

      if (!payload.start && !payload.end) return;

      onTaskChange(interaction.taskId, payload);
      setWarning(null);
      setInteraction((prev) => (prev ? { ...prev, lastDelta: deltaDays } : prev));
    };

    const finishInteraction = () => setInteraction(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishInteraction, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishInteraction);
    };
  }, [interaction, onTaskChange, pxPerDay, dependenciesByTarget, taskRowMap]);

  const startInteraction = (event: ReactPointerEvent<HTMLElement>, task: SluplanTask, mode: InteractionMode) => {
    event.stopPropagation();
    event.preventDefault();
    const scroller = scrollerRef.current;
    setWarning(null);
    setInteraction({
      taskId: task.id,
      mode,
      originX: event.clientX,
      originScrollLeft: scroller?.scrollLeft ?? 0,
      originalStart: parseISODate(task.start),
      originalEnd: parseISODate(task.end),
      lastDelta: 0,
    });
  };

  const renderTaskRow = (row: RowInfo) => {
    const { task, depth, left, barWidth, isMilestone, milestoneSize, labelIndent } = row;
    const isSelected = task.id === selectedTaskId;
    const hasDependencyIssue = dependencyAnalysis.brokenTargets.has(task.id);

    return (
      <div
        key={task.id}
        className={`grid border-b transition-colors ${
          isSelected ? "bg-primary/5" : hasDependencyIssue ? "bg-red-50" : "hover:bg-slate-50"
        }`}
        style={{ gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px ${timelineWidth}px`, height: ROW_HEIGHT }}
        onClick={() => onTaskSelect(task.id)}
      >
        <div className="flex h-full items-center gap-2 px-3">
          <div
            className={`h-2 w-2 rounded-full ${
              hasDependencyIssue ? "bg-red-500" : isSelected ? "bg-primary" : "bg-slate-400"
            }`}
            style={{ marginLeft: labelIndent }}
          />
          <div>
            <p className="text-sm font-semibold text-slate-800">{task.name}</p>
            <p className="text-xs text-slate-500">
              {task.assignee ?? labels.gantt.unassigned} · {task.start} → {task.end}
            </p>
          </div>
        </div>

        <div
          className="relative h-full"
          style={{
            backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.15) 0, rgba(148,163,184,0.15) 1px, transparent 1px, transparent ${pxPerDay}px)`,
          }}
        >
          {showTodayLine && (
            <div
              className="pointer-events-none absolute inset-y-1 w-px bg-red-500/80"
              style={{ left: todayOffset }}
            />
          )}
          {showUpcomingLine && (
            <div
              className="pointer-events-none absolute inset-y-1 w-px border-r-2 border-dashed border-primary"
              style={{ left: upcomingOffset }}
            />
          )}

          {isMilestone ? (
            <button
              type="button"
              className="absolute top-1/2 -translate-y-1/2 rounded-full outline-none"
              style={{ left: left + pxPerDay / 2 - milestoneSize / 2 }}
              onPointerDown={(event) => startInteraction(event, task, "move")}
            >
              <span
                className={`block rotate-45 shadow-md transition-transform ${
                  isSelected ? "scale-110 bg-primary" : hasDependencyIssue ? "bg-red-400" : "bg-primary/80"
                }`}
                style={{ width: milestoneSize, height: milestoneSize }}
              />
            </button>
          ) : (
            <div
              className="absolute top-1/2 flex -translate-y-1/2 items-center"
              style={{ left, width: barWidth }}
            >
              <button
                type="button"
                className={`relative h-8 flex-1 rounded text-left text-xs font-medium text-white shadow-md transition ${
                  hasDependencyIssue
                    ? "bg-red-400"
                    : isSelected
                    ? "bg-primary"
                    : "bg-primary/80 hover:bg-primary"
                }`}
                onPointerDown={(event) => startInteraction(event, task, "move")}
              >
                <span className="absolute inset-y-0 left-2 flex items-center text-[11px] opacity-90">
                  {task.assignee ?? labels.gantt.unassigned}
                </span>
              </button>
              <span
                className="absolute left-0 top-1/2 -ml-2 -translate-y-1/2 cursor-col-resize rounded border border-primary/30 bg-white/80 px-1 py-3 shadow"
                onPointerDown={(event) => startInteraction(event, task, "resize-start")}
              />
              <span
                className="absolute right-0 top-1/2 -mr-2 -translate-y-1/2 cursor-col-resize rounded border border-primary/30 bg-white/80 px-1 py-3 shadow"
                onPointerDown={(event) => startInteraction(event, task, "resize-end")}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const headerRow = (
    <div
      className="grid border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"
      style={{ gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px ${timelineWidth}px`, height: HEADER_HEIGHT }}
    >
      <div className="flex items-center px-3">{labels.gantt.taskColumn}</div>
      <div className="flex items-center">
        <div className="flex h-full w-full">
          {dayColumns.map((date) => {
            const label =
              zoom === "month"
                ? date.getDate() === 1
                  ? date.toLocaleDateString(locale, { month: "short" })
                  : ""
                : date.toLocaleDateString(locale, { day: "2-digit", month: zoom === "day" ? "short" : "2-digit" });
            return (
              <div
                key={date.toISOString()}
                className="flex shrink-0 items-center justify-center border-r border-slate-200"
                style={{ width: pxPerDay }}
              >
                <span className="text-[11px] font-medium text-slate-500">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full flex-col bg-white">
      {warning && (
        <div className="pointer-events-none absolute right-4 top-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 shadow-sm">
          {warning}
        </div>
      )}

      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-800">{labels.gantt.heading}</h2>
        <div className="flex items-center gap-2">
          {(["day", "week", "month"] as ZoomLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              className={`rounded border px-3 py-1 text-sm capitalize transition ${
                zoom === level
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => setZoom(level)}
            >
              {level === "day"
                ? labels.gantt.zoom.day
                : level === "week"
                ? labels.gantt.zoom.week
                : labels.gantt.zoom.month}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto" ref={scrollerRef}>
        <div className="min-w-fit" style={{ width: LABEL_COLUMN_WIDTH + timelineWidth }}>
          {headerRow}
          <div className="relative">
            {dependencyAnalysis.lines.length > 0 && rows.length > 0 && (
              <svg
                className="pointer-events-none absolute top-0"
                style={{ left: LABEL_COLUMN_WIDTH }}
                width={timelineWidth}
                height={timelineHeight}
              >
                {dependencyAnalysis.lines.map((line) => (
                  <g key={line.id}>
                    <path
                      d={line.path}
                      fill="none"
                      stroke={line.broken ? "#ef4444" : "#94a3b8"}
                      strokeWidth={line.broken ? 2.5 : 1.5}
                      strokeDasharray={line.broken ? "6 4" : undefined}
                    />
                    <circle
                      cx={line.toX}
                      cy={line.toY}
                      r={3}
                      fill={line.broken ? "#ef4444" : "#64748b"}
                    />
                  </g>
                ))}
              </svg>
            )}

            {rows.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                {labels.gantt.noTasks}
              </div>
            ) : (
              rows.map(renderTaskRow)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GanttView;
