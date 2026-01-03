"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

interface LinkDogSettings {
    enabled: boolean;
    provider: 'gemini' | 'claude';
    hasApiKey: boolean;
}

interface LinkDogContextType {
    settings: LinkDogSettings | null;
    isOpen: boolean;
    toggleOpen: () => void;
    currentPage: string;
    currentApp: 'syslink' | 'flytlink';
    refreshSettings: () => Promise<void>;
}

const LinkDogContext = createContext<LinkDogContextType | null>(null);

export function useLinkDog(): LinkDogContextType | null {
    const context = useContext(LinkDogContext);
    return context;
}

interface LinkDogProviderProps {
    children: ReactNode;
}

export function LinkDogProvider({ children }: LinkDogProviderProps) {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const [settings, setSettings] = useState<LinkDogSettings | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    // Determine current app based on pathname
    const currentApp = pathname.startsWith('/flytlink') ? 'flytlink' : 'syslink';

    const fetchSettings = useCallback(async () => {
        if (status !== 'authenticated') return;

        try {
            const res = await fetch('/api/linkdog/settings');
            if (!res.ok) return;

            const data = await res.json();
            setSettings({
                enabled: data.enabled,
                provider: data.provider,
                hasApiKey: data.provider === 'gemini'
                    ? data.keys.gemini.configured
                    : data.keys.claude.configured
            });
        } catch (error) {
            console.error("Error fetching LinkDog settings:", error);
        }
    }, [status]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const toggleOpen = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    const refreshSettings = useCallback(async () => {
        await fetchSettings();
    }, [fetchSettings]);

    // Don't render LinkDog if not authenticated or on auth pages
    const isAuthPage = pathname.includes('/login') ||
        pathname.includes('/register') ||
        pathname.includes('/reset') ||
        pathname.includes('/pending') ||
        pathname.includes('/verify');

    if (status !== 'authenticated' || isAuthPage || !settings?.enabled) {
        return <>{children}</>;
    }

    return (
        <LinkDogContext.Provider value={{
            settings,
            isOpen,
            toggleOpen,
            currentPage: pathname,
            currentApp,
            refreshSettings
        }}>
            {children}
        </LinkDogContext.Provider>
    );
}
