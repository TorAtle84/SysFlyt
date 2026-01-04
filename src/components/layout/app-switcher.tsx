"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, LayoutDashboard, FileSearch, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSwitcherProps {
    currentApp: "syslink" | "flytlink";
    availableApps: string[]; // e.g., ["SYSLINK", "FLYTLINK"]
    collapsed?: boolean;
}

const APP_CONFIG = {
    SYSLINK: {
        name: "SysLink",
        href: "/syslink/dashboard",
        icon: LayoutDashboard,
        color: "#20528D",
        description: "Prosjektstyring og dokumenthåndtering",
    },
    FLYTLINK: {
        name: "FlytLink",
        href: "/flytlink/dashboard",
        icon: FileSearch,
        color: "#7C3AED",
        description: "Kravsporing og analyse",
    },
};

export function AppSwitcher({ currentApp, availableApps, collapsed }: AppSwitcherProps) {
    const pathname = usePathname();

    // Filter to only show apps the user has access to
    const accessibleApps = Object.entries(APP_CONFIG).filter(
        ([code]) => availableApps.includes(code)
    );

    // Don't render if user only has access to one app
    if (accessibleApps.length <= 1) {
        return null;
    }

    const currentAppConfig = APP_CONFIG[currentApp.toUpperCase() as keyof typeof APP_CONFIG];
    const otherApps = accessibleApps.filter(
        ([code]) => code.toLowerCase() !== currentApp
    );

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size={collapsed ? "icon" : "default"}
                    className={cn(
                        "w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5",
                        collapsed && "justify-center px-0"
                    )}
                    title="Bytt applikasjon"
                >
                    <ArrowRightLeft size={18} />
                    {!collapsed && <span>Bytt app</span>}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Tilgjengelige apper
                </div>
                <DropdownMenuSeparator />

                {/* Current app (with checkmark) */}
                <DropdownMenuItem disabled className="opacity-100">
                    <currentAppConfig.icon
                        className="mr-2 h-4 w-4"
                        style={{ color: currentAppConfig.color }}
                    />
                    <div className="flex-1">
                        <span className="font-medium">{currentAppConfig.name}</span>
                        <p className="text-xs text-muted-foreground">
                            {currentAppConfig.description}
                        </p>
                    </div>
                    <Check className="h-4 w-4 text-green-500" />
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Other apps */}
                {otherApps.map(([code, config]) => (
                    <DropdownMenuItem key={code} asChild>
                        <Link href={config.href} className="cursor-pointer">
                            <config.icon
                                className="mr-2 h-4 w-4"
                                style={{ color: config.color }}
                            />
                            <div className="flex-1">
                                <span className="font-medium">{config.name}</span>
                                <p className="text-xs text-muted-foreground">
                                    {config.description}
                                </p>
                            </div>
                        </Link>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
