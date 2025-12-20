"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={nb}
      showOutsideDays={showOutsideDays}
      showWeekNumber
      navLayout="around"
      formatters={{
        formatCaption: (month) => {
          const formatted = format(month, "MMM yyyy", { locale: nb }).replace(".", "");
          return formatted.charAt(0).toUpperCase() + formatted.slice(1);
        },
      }}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "grid grid-cols-[auto_1fr_auto] gap-y-4 items-center",
        month_caption: "flex justify-center items-center",
        caption_label: "text-sm font-medium whitespace-nowrap",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-7 w-7 min-h-0 min-w-0 p-0 opacity-60 hover:opacity-100 justify-self-start"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-7 w-7 min-h-0 min-w-0 p-0 opacity-60 hover:opacity-100 justify-self-end"
        ),
        month_grid: "col-span-3 w-full border-collapse",
        weekdays: "flex w-full",
        weekday:
          "text-muted-foreground rounded-md w-8 h-8 p-0 font-normal text-[0.8rem] flex items-center justify-center",
        week: "flex w-full mt-2",
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "h-8 w-8",
          "aria-selected:bg-accent"
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 min-h-0 min-w-0 p-0 font-normal aria-selected:opacity-100"
        ),
        range_end: "range_end",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside: "outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        week_number_header:
          "text-muted-foreground rounded-md w-8 h-8 p-0 font-normal text-[0.8rem] flex items-center justify-center",
        week_number:
          "text-[0.7rem] text-muted-foreground font-medium h-8 w-8 flex items-center justify-center",
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation }) => {
          if (orientation === "left") return <ChevronLeft className={cn("h-4 w-4", className)} />;
          if (orientation === "right") return <ChevronRight className={cn("h-4 w-4", className)} />;
          return <ChevronRight className={cn("h-4 w-4", className)} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
