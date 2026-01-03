"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { Check, CheckCheck, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { getNotificationContent, Notification } from "@/lib/notification-helpers";

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchNotifications();
    }, []);

    async function fetchNotifications() {
        try {
            const res = await fetch("/api/notifications?limit=50");
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
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
            }
        } catch (err) {
            console.error(err);
        }
    }

    async function handleMarkAllRead() {
        try {
            const res = await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ markAllRead: true }),
            });
            if (res.ok) {
                setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
            }
        } catch (err) {
            console.error(err);
        }
    }

    if (loading) {
        return (
            <div className="container mx-auto max-w-3xl space-y-4 py-8">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-8 w-32" />
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                ))}
            </div>
        );
    }

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <div className="container mx-auto max-w-3xl space-y-6 py-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Varslingssenter</h1>
                {unreadCount > 0 && (
                    <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                        <CheckCheck className="mr-2 h-4 w-4" />
                        Marker alt som lest
                    </Button>
                )}
            </div>

            <Card>
                <CardContent className="p-0">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                            <Bell className="mb-4 h-12 w-12 opacity-20" />
                            <p>Du har ingen varsler</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {notifications.map((notification) => {
                                const { icon: Icon, text, link } = getNotificationContent(notification);

                                const content = (
                                    <div
                                        className={cn(
                                            "flex items-start gap-4 p-4 transition-colors hover:bg-muted/50",
                                            !notification.read && "bg-primary/5"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                                                notification.read ? "bg-muted" : "bg-primary/20 text-primary"
                                            )}
                                        >
                                            <Icon size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <p
                                                className={cn(
                                                    "text-sm",
                                                    notification.read ? "text-muted-foreground" : "text-foreground font-medium"
                                                )}
                                            >
                                                {text}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {format(new Date(notification.createdAt), "d. MMMM yyyy HH:mm", {
                                                    locale: nb,
                                                })}
                                            </p>
                                        </div>
                                        {!notification.read && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-muted-foreground hover:bg-background hover:text-foreground"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleMarkAsRead(notification.id);
                                                }}
                                                title="Marker som lest"
                                            >
                                                <Check size={16} />
                                            </Button>
                                        )}
                                    </div>
                                );

                                return (
                                    <div key={notification.id}>
                                        {link ? (
                                            <Link
                                                href={link}
                                                onClick={() => {
                                                    if (!notification.read) handleMarkAsRead(notification.id);
                                                }}
                                                className="block"
                                            >
                                                {content}
                                            </Link>
                                        ) : (
                                            content
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

