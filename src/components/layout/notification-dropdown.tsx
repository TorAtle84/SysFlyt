"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AlertTriangle, Bell, Check, CheckCheck, CheckSquare, ClipboardList, MessageSquare, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getNotificationContent as importGetNotificationContent } from "@/lib/notification-helpers";

interface Notification {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
  comment?: {
    id: string;
    content: string;
    author: { firstName: string; lastName: string };
  } | null;
  annotation?: {
    id: string;
    document: { id: string; title: string; projectId: string };
  } | null;
}

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleMarkAsRead(notificationId: string) {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleMarkAllRead() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getNotificationContent(notification: Notification) {
    // Adapter for the shared helper since the interface might match structurally but Typescript needs confirmation
    return importGetNotificationContent(notification as any);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="relative h-9 w-9 p-0"
        onClick={() => setIsOpen(true)}
        title="Varsler"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar */}
          <div className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                <h3 className="text-lg font-semibold text-foreground">Varsler</h3>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleMarkAllRead}
                    disabled={loading}
                  >
                    <CheckCheck size={14} className="mr-1" />
                    Marker alt lest
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsOpen(false)}
                >
                  <X size={18} />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {notifications.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <Bell className="mb-4 h-12 w-12 opacity-20" />
                  <p>Du har ingen nye varsler</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {notifications.map((notification) => {
                    const { icon: Icon, text, link } = getNotificationContent(notification);
                    const content = (
                      <div
                        className={cn(
                          "relative flex gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-muted/50",
                          !notification.read && "bg-primary/5"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-border",
                            notification.read ? "bg-background text-muted-foreground" : "bg-primary/10 text-primary ring-primary/20"
                          )}
                        >
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p
                            className={cn(
                              "text-sm leading-snug",
                              notification.read ? "text-muted-foreground" : "text-foreground font-medium"
                            )}
                          >
                            {text}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(notification.createdAt), "d. MMM HH:mm", {
                              locale: nb,
                            })}
                          </p>
                        </div>
                        {!notification.read && (
                          <button
                            type="button"
                            className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleMarkAsRead(notification.id);
                            }}
                            title="Marker som lest"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    );

                    if (link) {
                      return (
                        <Link
                          key={notification.id}
                          href={link}
                          onClick={() => {
                            if (!notification.read) {
                              handleMarkAsRead(notification.id);
                            }
                            setIsOpen(false);
                          }}
                          className="block group"
                        >
                          {content}
                        </Link>
                      );
                    }

                    return <div key={notification.id} className="group">{content}</div>;
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-border p-4 bg-muted/20">
              <Link
                href="/notifications"
                className="flex w-full items-center justify-center rounded-md bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                onClick={() => setIsOpen(false)}
              >
                Gå til varslingssenter
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
