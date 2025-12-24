"use client";

import { useEffect, useRef, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";

interface InactivityProviderProps {
    children: React.ReactNode;
    timeoutMinutes?: number;
}

// Default timeout: 15 minutes
const DEFAULT_TIMEOUT_MINUTES = 15;

export function InactivityProvider({
    children,
    timeoutMinutes = DEFAULT_TIMEOUT_MINUTES
}: InactivityProviderProps) {
    const { data: session, status } = useSession();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef<number>(Date.now());

    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Handle logout
    const handleLogout = useCallback(() => {
        console.log("[InactivityProvider] Logging out due to inactivity");
        signOut({ callbackUrl: "/login?reason=inactivity" });
    }, []);

    // Reset the inactivity timer
    const resetTimer = useCallback(() => {
        lastActivityRef.current = Date.now();

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Only set timeout if user is logged in
        if (status === "authenticated") {
            timeoutRef.current = setTimeout(() => {
                handleLogout();
            }, timeoutMs);
        }
    }, [status, timeoutMs, handleLogout]);

    // Set up activity listeners
    useEffect(() => {
        // Don't run on server or if not authenticated
        if (typeof window === "undefined" || status !== "authenticated") {
            return;
        }

        // Activity events to track
        const activityEvents = [
            "mousedown",
            "mousemove",
            "keydown",
            "scroll",
            "touchstart",
            "click",
        ];

        // Throttled reset - only reset every 30 seconds to avoid excessive resets
        let lastReset = 0;
        const throttledReset = () => {
            const now = Date.now();
            if (now - lastReset > 30000) { // 30 seconds throttle
                lastReset = now;
                resetTimer();
            }
        };

        // Add event listeners
        activityEvents.forEach((event) => {
            window.addEventListener(event, throttledReset, { passive: true });
        });

        // Initial timer setup
        resetTimer();

        // Check for inactivity when tab becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                const timeSinceLastActivity = Date.now() - lastActivityRef.current;
                if (timeSinceLastActivity >= timeoutMs) {
                    handleLogout();
                } else {
                    resetTimer();
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Cleanup
        return () => {
            activityEvents.forEach((event) => {
                window.removeEventListener(event, throttledReset);
            });
            document.removeEventListener("visibilitychange", handleVisibilityChange);

            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [status, resetTimer, timeoutMs, handleLogout]);

    // Clean up on unmount or when session changes
    useEffect(() => {
        if (status !== "authenticated" && timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, [status]);

    return <>{children}</>;
}
