"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AlertTriangle, Bell, Check, CheckCheck, CheckSquare, ClipboardList, MessageSquare, UserCheck } from "lucide-react";
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
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        className="relative h-9 w-9 p-0"
        onClick={() => setIsOpen(!isOpen)}
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
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-semibold text-foreground">Varsler</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleMarkAllRead}
                disabled={loading}
              >
                <CheckCheck size={14} className="mr-1" />
                Marker alle som lest
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Bell className="mx-auto mb-2 opacity-50" size={24} />
                Ingen varsler enda
              </div>
            ) : (
              notifications.map((notification) => {
                const { icon: Icon, text, link } = getNotificationContent(notification);
                const content = (
                  <div
                    className={cn(
                      "flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                      !notification.read && "bg-primary/5"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        notification.read ? "bg-muted" : "bg-primary/20"
                      )}
                    >
                      <Icon
                        size={14}
                        className={notification.read ? "text-muted-foreground" : "text-primary"}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm",
                          notification.read ? "text-muted-foreground" : "text-foreground"
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
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    >
                      {content}
                    </Link>
                  );
                }

                return <div key={notification.id}>{content}</div>;
              })
            )}
          </div>
          <div className="border-t border-border p-2">
            <Link
              href="/notifications"
              className="flex w-full items-center justify-center rounded-md px-3 py-2 text-sm text-primary transition-colors hover:bg-muted"
              onClick={() => setIsOpen(false)}
            >
              Se alle varsler
            </Link>
          </div>
        </div>
      )
      }
    </div >
  );
}
