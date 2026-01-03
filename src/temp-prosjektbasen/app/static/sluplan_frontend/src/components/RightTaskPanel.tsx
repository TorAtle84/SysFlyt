import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { apiBaseUrl } from "../config";
import { labels, formatDateTime } from "../i18n";
import { normalizeTask, ResourceCatalog, SluplanTask, TaskComment, TaskFile } from "./types";

interface Props {
  task: SluplanTask | null;
  resources: string[];
  resourceCatalog: ResourceCatalog | null;
  projectId: number | null;
  onClose(): void;
  onTaskUpdated(task: SluplanTask): void;
}

const DEFAULT_AUTHOR = labels.rightPanel.comments.defaultAuthor;
function humanFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function renderCommentText(text: string) {
  return text.split(/(@[\w\-æøåÆØÅ]+)/iu).map((part, index) =>
    part.startsWith("@") ? (
      <span key={index} className="font-semibold text-primary">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

function RightTaskPanel({ task, resources, resourceCatalog, projectId, onClose, onTaskUpdated }: Props) {
  const [assignee, setAssignee] = useState<string>("");
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [customResource, setCustomResource] = useState("");

  const [commentAuthor, setCommentAuthor] = useState(DEFAULT_AUTHOR);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [savingAssignee, setSavingAssignee] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const isOpen = Boolean(task);
  const icsHref = task ? `${apiBaseUrl}/tasks/${task.id}/ics` : "#";

  useEffect(() => {
    setAssignee(task?.assignee ?? "");
    setResourceError(null);
    setCustomResource("");
    setCommentAuthor(DEFAULT_AUTHOR);
    setCommentText("");
    setCommentError(null);
    setFileError(null);
    setUploadingFile(false);
  }, [task?.id]);

  const resourceOptions = useMemo(() => {
    const catalogNames = resourceCatalog?.users?.map((user) => user.name)?.filter(Boolean) ?? [];
    const combined = new Set<string>(["", ...catalogNames, ...resources]);
    if (task?.assignee) combined.add(task.assignee);
    combined.delete("");
    return Array.from(combined).sort();
  }, [resourceCatalog?.users, resources, task?.assignee]);

  const handleResourceSave = async (value: string) => {
    if (!task) return;
    const projectQuery = projectId ? `?project_id=${projectId}` : "";
    setSavingAssignee(true);
    setResourceError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/tasks/${task.id}${projectQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assignee: value || null }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setResourceError(payload?.error ?? labels.rightPanel.assignment.errors.update);
        setAssignee(task.assignee ?? "");
        return;
      }
      const normalized = normalizeTask(payload);
      setAssignee(normalized.assignee ?? "");
      onTaskUpdated(normalized);
    } catch (error) {
      console.error(error);
      setResourceError(labels.rightPanel.assignment.errors.save);
      setAssignee(task.assignee ?? "");
    } finally {
      setSavingAssignee(false);
    }
  };

  const handleCommentSubmit = async () => {
    if (!task) return;
    if (!commentText.trim()) {
      setCommentError(labels.rightPanel.comments.errors.empty);
      return;
    }
    setSavingComment(true);
    setCommentError(null);
    try {
      const projectQuery = projectId ? `?project_id=${projectId}` : "";
      const response = await fetch(`${apiBaseUrl}/tasks/${task.id}/comment${projectQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: commentText.trim(), author: commentAuthor.trim() || null }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setCommentError(payload?.error ?? labels.rightPanel.comments.errors.save);
        return;
      }
      const normalized = normalizeTask(payload);
      onTaskUpdated(normalized);
      setCommentText("");
    } catch (error) {
      console.error(error);
      setCommentError(labels.rightPanel.comments.errors.unexpected);
    } finally {
      setSavingComment(false);
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!task) return;
    const selected = event.target.files?.[0];
    if (!selected) return;
    setUploadingFile(true);
    setFileError(null);
    try {
      const formData = new FormData();
      formData.append("file", selected);
      const projectQuery = projectId ? `?project_id=${projectId}` : "";
      const response = await fetch(`${apiBaseUrl}/tasks/${task.id}/file${projectQuery}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        setFileError(payload?.error ?? labels.rightPanel.attachments.errors.upload);
        return;
      }
      const normalized = normalizeTask(payload);
      onTaskUpdated(normalized);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error(error);
      setFileError(labels.rightPanel.attachments.errors.upload);
    } finally {
      setUploadingFile(false);
    }
  };

  const comments: TaskComment[] = task?.comments ?? [];
  const files: TaskFile[] = task?.files ?? [];

  return (
    <div
      className={`absolute inset-y-0 right-0 w-full transform bg-white shadow-lg transition-transform duration-300 lg:relative lg:w-full ${
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-800">{labels.rightPanel.heading}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
        >
          {labels.rightPanel.close}
        </button>
      </div>

      <div className="space-y-5 p-4 text-sm text-slate-700">
        {task ? (
          <>
            <section>
              <p className="text-xs uppercase text-slate-500">{labels.rightPanel.task.label}</p>
              <p className="text-lg font-semibold text-primary">{task.name ?? task.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                {task.start} → {task.end} · {labels.rightPanel.task.statusPrefix} {task.status ?? labels.common.statusPlanned}
              </p>
              <div className="mt-3 flex gap-2">
                <a
                  href={icsHref}
                  className="rounded border border-primary px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
                  download
                >
                  {labels.rightPanel.exportIcs}
                </a>
              </div>
            </section>
          </>
        ) : (
          <section>
            <p className="text-xs uppercase text-slate-500">{labels.rightPanel.task.label}</p>
            <p className="text-sm text-slate-500">{labels.rightPanel.noTask}</p>
          </section>
        )}

        <section className="space-y-2">
          <p className="text-xs uppercase text-slate-500">{labels.rightPanel.assignment.title}</p>
          <div className="flex flex-col gap-2">
            <select
              value={assignee}
              onChange={(event) => {
                const value = event.target.value;
                setAssignee(value);
                void handleResourceSave(value);
              }}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              disabled={savingAssignee || !task}
            >
              <option value="">{labels.rightPanel.assignment.none}</option>
              {resourceOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="text"
                value={customResource}
                onChange={(event) => setCustomResource(event.target.value)}
                placeholder={labels.rightPanel.assignment.addPlaceholder}
                className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                disabled={savingAssignee || !task}
              />
              <button
                type="button"
                onClick={() => {
                  const value = customResource.trim();
                  if (!value || !task) return;
                  setAssignee(value);
                  setCustomResource("");
                  void handleResourceSave(value);
                }}
                className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={savingAssignee || !customResource.trim() || !task}
              >
                {savingAssignee ? labels.rightPanel.assignment.saving : labels.rightPanel.assignment.save}
              </button>
            </div>
          </div>
          {resourceError && <p className="text-xs text-red-600">{resourceError}</p>}
        </section>

        <section className="space-y-3">
          <div>
            <p className="text-xs uppercase text-slate-500">{labels.rightPanel.comments.title}</p>
            <div className="mt-2 space-y-3">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-500">{labels.rightPanel.comments.empty}</p>
              ) : (
                comments
                  .slice()
                  .reverse()
                  .map((comment) => (
                    <div key={comment.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs font-semibold text-slate-600">
                        {comment.author ?? labels.common.unknown}
                        <span className="ml-2 font-normal text-slate-400">{formatDateTime(comment.created_at)}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-700">{renderCommentText(comment.text ?? "")}</p>
                      {comment.mentions && comment.mentions.length > 0 && (
                        <p className="mt-1 text-xs text-primary">
                          {labels.rightPanel.comments.mentionsPrefix} {comment.mentions.map((m) => `@${m}`).join(", ")}
                        </p>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs uppercase text-slate-500">{labels.rightPanel.comments.newTitle}</p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={commentAuthor}
                onChange={(event) => setCommentAuthor(event.target.value)}
                placeholder={labels.rightPanel.comments.authorPlaceholder}
                className="w-1/3 rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                disabled={!task}
              />
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder={labels.rightPanel.comments.textPlaceholder}
                className="h-20 w-2/3 resize-none rounded border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                disabled={!task}
              />
            </div>
            {commentError && <p className="mt-2 text-xs text-red-600">{commentError}</p>}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleCommentSubmit}
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/60"
                disabled={savingComment || !task}
              >
                {savingComment ? labels.rightPanel.comments.loading : labels.rightPanel.comments.add}
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs uppercase text-slate-500">{labels.rightPanel.attachments.title}</p>
          <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-3">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-500"
              disabled={uploadingFile || !task}
            />
            {uploadingFile && <p className="mt-2 text-xs text-primary">{labels.rightPanel.attachments.uploading}</p>}
            {fileError && <p className="mt-2 text-xs text-red-600">{fileError}</p>}
            <p className="mt-1 text-xs text-slate-500">{labels.rightPanel.attachments.info}</p>
          </div>
          <ul className="space-y-2 text-xs text-slate-600">
            {files.length === 0 ? (
              <li className="text-slate-500">{labels.rightPanel.attachments.empty}</li>
            ) : (
              files
                .slice()
                .reverse()
                .map((file) => (
                  <li key={file.id} className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2">
                    <div>
                      <p className="font-medium text-slate-700">{file.filename}</p>
                      <p className="text-[11px] text-slate-500">
                        {humanFileSize(file.size ?? 0)} · {formatDateTime(file.uploaded_at)}
                      </p>
                    </div>
                    {file.content_type && (
                      <span className="text-[11px] text-slate-400">{file.content_type}</span>
                    )}
                  </li>
                ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default RightTaskPanel;
