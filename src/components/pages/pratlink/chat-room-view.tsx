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
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

interface Message {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
  };
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
  const [newRoomName, setNewRoomName] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedRoom) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/pratlink/rooms/${selectedRoom.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messageText }),
        }
      );
      if (res.ok) {
        setMessageText("");
        fetchMessages();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
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
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row">
      <div className="flex flex-col gap-4 lg:w-72">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft size={16} />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">{project.name}</h1>
            <p className="text-xs text-muted-foreground">PratLink</p>
          </div>
        </div>

        <Card className="flex-1 overflow-hidden">
          <CardHeader className="border-b px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Rom</CardTitle>
              {canManageRooms && (
                <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Plus size={14} />
                    </Button>
                  </DialogTrigger>
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
                    <div key={message.id} className="group flex gap-3">
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
                  <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border bg-background p-1 shadow-lg">
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
                <div className="flex gap-2">
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
                    disabled={sending || !messageText.trim()}
                    size="icon"
                    className="h-11 w-11"
                  >
                    <Send size={18} />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Bruk @ for å nevne en person
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
    </div>
  );
}
