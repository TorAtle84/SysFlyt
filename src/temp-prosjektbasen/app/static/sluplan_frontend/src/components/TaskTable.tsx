import type { SluplanTask } from "./types";
import { labels } from "../i18n";

interface Props {
  tasks: SluplanTask[];
  selectedTaskId: string | null;
  onTaskSelect(id: string): void;
}

function TaskTable({ tasks, selectedTaskId, onTaskSelect }: Props) {
  const renderRows = (list: SluplanTask[], depth = 0): JSX.Element[] =>
    list.flatMap((task) => {
      const isSelected = task.id === selectedTaskId;
      const currentRow = (
        <tr
          key={task.id}
          className={`cursor-pointer text-sm transition-colors ${
            isSelected ? "bg-primary/10 text-primary" : "hover:bg-slate-100"
          }`}
          onClick={() => onTaskSelect(task.id)}
        >
          <td className="px-3 py-2 align-middle">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary/60" />
              <span className="font-medium text-slate-700" style={{ marginLeft: depth * 12 }}>
                {task.name ?? task.title}
              </span>
            </div>
          </td>
          <td className="px-3 py-2 align-middle text-slate-600">{task.start}</td>
          <td className="px-3 py-2 align-middle text-slate-600">{task.end}</td>
          <td className="px-3 py-2 align-middle text-slate-600">{task.assignee ?? labels.taskTable.notAssigned}</td>
          <td className="px-3 py-2 align-middle text-slate-600">{task.status ?? labels.common.statusPlanned}</td>
        </tr>
      );
      const childRows = task.children ? renderRows(task.children, depth + 1) : [];
      return [currentRow, ...childRows];
    });

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-800">{labels.taskTable.heading}</h2>
        <input
          type="search"
          placeholder={labels.taskTable.searchPlaceholder}
          className="rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          disabled
        />
      </div>
      <table className="min-w-full divide-y divide-slate-100 text-left">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">{labels.taskTable.columns.name}</th>
            <th className="px-3 py-2">{labels.taskTable.columns.start}</th>
            <th className="px-3 py-2">{labels.taskTable.columns.end}</th>
            <th className="px-3 py-2">{labels.taskTable.columns.assignee}</th>
            <th className="px-3 py-2">{labels.taskTable.columns.status}</th>
          </tr>
        </thead>
        <tbody>{renderRows(tasks)}</tbody>
      </table>
    </div>
  );
}

export default TaskTable;
