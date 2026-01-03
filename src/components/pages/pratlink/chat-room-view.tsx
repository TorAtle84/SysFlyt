"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  ArrowLeft,
  Hash,
  Plus,
  Send,
  Users,
  AtSign,
  MessageSquare,
  CheckSquare,
  Paperclip,
  FileText,
  Image,
  X,
  Download,
  ExternalLink,
  FileIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TaskPanel } from "./task-panel";

interface Member {
  id: string;
  name: string;
  email: string;
  company: string | null;
  role: string;
}

interface Room {
  id: string;
  name: string;
  type: string;
  description: string | null;
  messageCount: number;
}

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
}

interface MessageLink {
  id: string;
  targetType: string;
  targetId: string;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
  };
  attachments?: Attachment[];
  links?: MessageLink[];
  replies?: Message[];
  _count?: { replies: number };
}

interface ChatRoomViewProps {
  project: {
    id: string;
    name: string;
    description: string | null;
  };
  rooms: Room[];
  members: Member[];
  currentUserId: string;
  canManageRooms: boolean;
}

export function ChatRoomView({
  project,
  rooms,
  members,
  currentUserId,
  canManageRooms,
}: ChatRoomViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"chat" | "tasks">("chat");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(
    rooms.find((r) => r.type === "PROJECT") || rooms[0] || null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [deepLinkMessageId, setDeepLinkMessageId] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deepLinkHandledRef = useRef(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get("tab");
    if (tab === "tasks") {
      setActiveTab("tasks");
      return;
    }

    const roomId = urlParams.get("room");
    const messageId = urlParams.get("message");

    if (roomId) {
      const room = rooms.find((r) => r.id === roomId);
      if (room) setSelectedRoom(room);
    }

    if (messageId) {
      setDeepLinkMessageId(messageId);
    }
  }, [rooms]);

  const fetchMessages = useCallback(async () => {
    if (!selectedRoom) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/pratlink/rooms/${selectedRoom.id}/messages`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedRoom]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (deepLinkMessageId && !deepLinkHandledRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, deepLinkMessageId]);

  useEffect(() => {
    if (!deepLinkMessageId) return;
    if (deepLinkHandledRef.current) return;
    if (loading) return;

    const el = document.getElementById(`chat-message-${deepLinkMessageId}`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    deepLinkHandledRef.current = true;

    setHighlightMessageId(deepLinkMessageId);
    window.setTimeout(() => setHighlightMessageId(null), 3500);
  }, [deepLinkMessageId, loading, messages]);

  const handleSendMessage = async () => {
    if ((!messageText.trim() && selectedFiles.length === 0) || !selectedRoom) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/pratlink/rooms/${selectedRoom.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messageText || "(fil vedlagt)" }),
        }
      );
      if (res.ok) {
        const { message } = await res.json();

        if (selectedFiles.length > 0) {
          setUploadingFiles(true);
          for (const file of selectedFiles) {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("messageId", message.id);
            formData.append("projectId", project.id);

            await fetch("/api/pratlink/attachments", {
              method: "POST",
              body: formData,
            });
          }
          setUploadingFiles(false);
          setSelectedFiles([]);
        }

        setMessageText("");
        fetchMessages();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
      setUploadingFiles(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const allowedExts = ["pdf", "xlsx", "xls", "png", "jpg", "jpeg", "gif", "webp", "doc", "docx"];
      return ext && allowedExts.includes(ext) && file.size <= 10 * 1024 * 1024;
    });
    setSelectedFiles((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileType: string | null, fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (fileType?.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext || "")) {
      return Image;
    }
    return FileText;
  };

  const getLinkInfo = (link: MessageLink) => {
    switch (link.targetType) {
      case "document":
        return {
          icon: FileIcon,
          label: "Dokument",
          href: `/projects/${project.id}/documents/${link.targetId}`,
          color: "text-blue-500",
        };
      case "annotation":
        return {
          icon: AlertCircle,
          label: "Avvik",
          href: `/projects/${project.id}/documents?annotationId=${link.targetId}`,
          color: "text-orange-500",
        };
      case "task":
        return {
          icon: CheckSquare,
          label: "Oppgave",
          href: `/pratlink/${project.id}?tab=tasks`,
          color: "text-green-500",
        };
      default:
        return {
          icon: ExternalLink,
          label: "Lenke",
          href: "#",
          color: "text-muted-foreground",
        };
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    setCreatingRoom(true);
    try {
      const res = await fetch(`/api/pratlink/projects/${project.id}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoomName, type: "TOPIC" }),
      });
      if (res.ok) {
        setNewRoomName("");
        setCreateRoomOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingRoom(false);
    }
  };

  const insertMention = (member: Member) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBefore = messageText.slice(0, cursorPos);
    const textAfter = messageText.slice(cursorPos);
    const lastAtIndex = textBefore.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const newText =
        textBefore.slice(0, lastAtIndex) +
        `@${member.name} ` +
        textAfter;
      setMessageText(newText);
    }

    setShowMentions(false);
    setMentionSearch("");
    textarea.focus();
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessageText(value);

    const cursorPos = e.target.selectionStart;
    const textBefore = value.slice(0, cursorPos);
    const lastAtIndex = textBefore.lastIndexOf("@");

    if (lastAtIndex !== -1 && lastAtIndex === textBefore.length - 1) {
      setShowMentions(true);
      setMentionSearch("");
    } else if (lastAtIndex !== -1) {
      const searchText = textBefore.slice(lastAtIndex + 1);
      if (!searchText.includes(" ")) {
        setShowMentions(true);
        setMentionSearch(searchText.toLowerCase());
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      m.id !== currentUserId &&
      (m.name.toLowerCase().includes(mentionSearch) ||
        m.email.toLowerCase().includes(mentionSearch))
  );

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col gap-4 lg:flex-row">
      <div className="lg:hidden space-y-3">
        <div className="flex items-center gap-3">
          <Link href="/syslink/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <img
            src="/pratlink-logo.png"
            alt="PratLink"
            className="h-10 w-10 rounded-lg object-contain"
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{project.name}</h1>
            <p className="text-xs text-muted-foreground">PratLink</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            onClick={() => setMembersOpen(true)}
            title="Medlemmer"
          >
            <Users size={18} />
          </Button>
        </div>

        <div className="flex rounded-lg border border-border bg-muted p-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "chat"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageSquare size={14} />
            Chat
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "tasks"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CheckSquare size={14} />
            Oppgaver
          </button>
        </div>

        {activeTab === "chat" && (
          <div className="flex items-center gap-2">
            <Select
              value={selectedRoom?.id || ""}
              onValueChange={(roomId) => {
                const room = rooms.find((r) => r.id === roomId);
                if (room) setSelectedRoom(room);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Velg rom" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    #{room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canManageRooms && (
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                onClick={() => setCreateRoomOpen(true)}
                title="Opprett rom"
              >
                <Plus size={18} />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="hidden lg:flex flex-col gap-4 w-72">
        <div className="flex items-center gap-3">
          <Link href="/syslink/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <img
            src="/pratlink-logo.png"
            alt="PratLink"
            className="h-10 w-10 rounded-lg object-contain"
          />
          <div className="flex-1">
            <h1 className="font-semibold">{project.name}</h1>
            <p className="text-xs text-muted-foreground">PratLink</p>
          </div>
        </div>

        <div className="flex rounded-lg border border-border bg-muted p-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "chat"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageSquare size={14} />
            Chat
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "tasks"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CheckSquare size={14} />
            Oppgaver
          </button>
        </div>

        <Card className="flex-1 overflow-hidden">
          <CardHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Rom</CardTitle>
              {canManageRooms && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCreateRoomOpen(true)}
                  title="Opprett rom"
                >
                  <Plus size={14} />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 overflow-auto p-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  selectedRoom?.id === room.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                )}
              >
                <Hash size={14} />
                <span className="flex-1 truncate">{room.name}</span>
                {room.messageCount > 0 && (
                  <Badge tone="muted" className="text-xs">
                    {room.messageCount}
                  </Badge>
                )}
              </button>
            ))}
            {rooms.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Ingen rom opprettet
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users size={14} />
              Medlemmer ({members.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 space-y-1 overflow-auto p-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {member.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="flex-1 truncate">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  {member.company && (
                    <p className="truncate text-xs text-muted-foreground">
                      {member.company}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {activeTab === "chat" ? (
        <Card className="flex flex-1 flex-col overflow-hidden">
          {selectedRoom ? (
            <>
              <CardHeader className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Hash size={18} />
                  <CardTitle className="text-base">{selectedRoom.name}</CardTitle>
                  {selectedRoom.type === "PROJECT" && (
                    <Badge tone="info" className="text-xs">
                      Hovedrom
                    </Badge>
                  )}
                </div>
                {selectedRoom.description && (
                  <p className="text-sm text-muted-foreground">
                    {selectedRoom.description}
                  </p>
                )}
              </CardHeader>

              <CardContent className="flex-1 overflow-auto p-4">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-muted-foreground">Laster meldinger...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/50" />
                    <h3 className="font-medium">Ingen meldinger ennå</h3>
                    <p className="text-sm text-muted-foreground">
                      Vær den første til å skrive noe!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        id={`chat-message-${message.id}`}
                        className={cn(
                          "group flex gap-3 scroll-mt-24",
                          message.id === highlightMessageId &&
                          "rounded-lg bg-primary/5 ring-1 ring-primary/30 p-2"
                        )}
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {message.author.firstName[0]}
                          {message.author.lastName[0]}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium">
                              {message.author.firstName} {message.author.lastName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(
                                new Date(message.createdAt),
                                "d. MMM HH:mm",
                                { locale: nb }
                              )}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm">
                            {message.content}
                          </p>
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {message.attachments.map((attachment) => {
                                const FileIconComp = getFileIcon(attachment.fileType, attachment.fileName);
                                return (
                                  <a
                                    key={attachment.id}
                                    href={attachment.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group/file flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm transition-colors hover:bg-muted"
                                  >
                                    <FileIconComp size={16} className="text-muted-foreground" />
                                    <span className="max-w-[200px] truncate">{attachment.fileName}</span>
                                    {attachment.fileSize && (
                                      <span className="text-xs text-muted-foreground">
                                        {formatFileSize(attachment.fileSize)}
                                      </span>
                                    )}
                                    <Download size={14} className="text-muted-foreground opacity-0 transition-opacity group-hover/file:opacity-100" />
                                  </a>
                                );
                              })}
                            </div>
                          )}
                          {message.links && message.links.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {message.links.map((link) => {
                                const linkInfo = getLinkInfo(link);
                                const LinkIcon = linkInfo.icon;
                                return (
                                  <Link
                                    key={link.id}
                                    href={linkInfo.href}
                                    className={cn(
                                      "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                                      linkInfo.color
                                    )}
                                  >
                                    <LinkIcon size={14} />
                                    <span>{linkInfo.label}</span>
                                    <ExternalLink size={12} className="opacity-50" />
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </CardContent>

              <div className="border-t p-4">
                <div className="relative">
                  {showMentions && filteredMembers.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-2 w-full max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-1 shadow-lg sm:w-64">
                      {filteredMembers.slice(0, 5).map((member) => (
                        <button
                          key={member.id}
                          onClick={() => insertMention(member)}
                          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <AtSign size={14} className="text-muted-foreground" />
                          <span>{member.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {selectedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1 text-sm"
                        >
                          <Paperclip size={14} className="text-muted-foreground" />
                          <span className="max-w-[150px] truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </span>
                          <button
                            onClick={() => removeSelectedFile(index)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 flex-shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      title="Legg til fil"
                    >
                      <Paperclip size={18} />
                    </Button>
                    <Textarea
                      ref={textareaRef}
                      placeholder={`Skriv en melding i #${selectedRoom.name}...`}
                      value={messageText}
                      onChange={handleTextChange}
                      onKeyDown={handleKeyDown}
                      className="min-h-[44px] resize-none"
                      rows={1}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={sending || uploadingFiles || (!messageText.trim() && selectedFiles.length === 0)}
                      size="icon"
                      className="h-11 w-11"
                    >
                      <Send size={18} />
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Bruk @ for å nevne en person. Maks filstørrelse: 10MB
                  </p>
                </div>
              </div>
            </>
          ) : (
            <CardContent className="flex h-full items-center justify-center">
              <div className="text-center">
                <Hash className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="font-medium">Velg et rom</h3>
                <p className="text-sm text-muted-foreground">
                  Eller opprett et nytt rom for å starte
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      ) : (
        <Card className="flex flex-1 flex-col overflow-hidden">
          <TaskPanel
            projectId={project.id}
            members={members.map((m) => ({
              id: m.id,
              firstName: m.name.split(" ")[0],
              lastName: m.name.split(" ").slice(1).join(" ") || "",
              email: m.email,
            }))}
            onNavigateToMessage={(roomId, messageId) => {
              const room = rooms.find((r) => r.id === roomId);
              if (room) {
                setSelectedRoom(room);
                setActiveTab("chat");
              }
            }}
          />
        </Card>
      )}

      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Medlemmer ({members.length})</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1 overflow-auto pr-1">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {member.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.company || member.email}
                  </p>
                </div>
                <Badge tone="muted" className="text-xs">
                  {member.role}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {canManageRooms && (
        <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Opprett nytt rom</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder="Romnavn (f.eks. Avvik, FDV)"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
              <Button
                onClick={handleCreateRoom}
                disabled={creatingRoom || !newRoomName.trim()}
                className="w-full"
              >
                {creatingRoom ? "Oppretter..." : "Opprett rom"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
