"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type StatusValue = "NOT_STARTED" | "IN_PROGRESS" | "DEVIATION" | "NA" | "COMPLETED";

interface StatusDropdownProps {
    value: StatusValue;
    onChange: (value: StatusValue) => void;
    disabled?: boolean;
}

const STATUS_CONFIG: Record<StatusValue, { label: string; color: string; hover: string }> = {
    NOT_STARTED: { label: "", color: "bg-gray-100 text-gray-700", hover: "hover:bg-gray-200" },
    IN_PROGRESS: { label: "I", color: "bg-blue-100 text-blue-800", hover: "hover:bg-blue-200" },
    DEVIATION: { label: "Avvik", color: "bg-red-100 text-red-800", hover: "hover:bg-red-200" },
    NA: { label: "N/A", color: "bg-gray-200 text-gray-600", hover: "hover:bg-gray-300" },
    COMPLETED: { label: "OK", color: "bg-green-100 text-green-800", hover: "hover:bg-green-200" },
};

export function StatusDropdown({ value, onChange, disabled }: StatusDropdownProps) {
    const currentConfig = STATUS_CONFIG[value] || STATUS_CONFIG.NOT_STARTED;

    return (
        <Select value={value} onValueChange={(val) => onChange(val as StatusValue)} disabled={disabled}>
            <SelectTrigger
                className={cn(
                    "h-8 w-full border-0 focus:ring-1 focus:ring-inset focus:ring-primary",
                    currentConfig.color,
                    currentConfig.hover
                )}
            >
                <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="NOT_STARTED">Ikke startet</SelectItem>
                <SelectItem value="IN_PROGRESS" className="text-blue-600">
                    I (Påbegynt)
                </SelectItem>
                <SelectItem value="DEVIATION" className="text-red-600">
                    Avvik
                </SelectItem>
                <SelectItem value="NA" className="text-gray-500">
                    N/A (Ikke aktuelt)
                </SelectItem>
                <SelectItem value="COMPLETED" className="text-green-600 font-medium">
                    Fullført
                </SelectItem>
            </SelectContent>
        </Select>
    );
}
