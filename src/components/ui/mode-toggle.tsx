"use client"

import * as React from "react"
import { Moon, Sun, Monitor, MessageSquare } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type DashboardMode = "syslink" | "pratlink";

interface ModeToggleProps {
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  const { setTheme } = useTheme()

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={mode === 'pratlink' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onModeChange('pratlink')}
        className="flex items-center gap-2"
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">PratLink</span>
      </Button>
      <Button
        variant={mode === 'syslink' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onModeChange('syslink')}
      >
        <img src="/SysLinkText.png" alt="SysLink Logo" className="h-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTheme("light")}>
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
