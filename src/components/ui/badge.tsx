import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
      tone: {
        default: "border-transparent bg-[#111A2E] text-white",
        info: "border-[#20528D] bg-[#111A2E] text-white",
        success: "border-[#529233] bg-[#111A2E] text-white",
        warning: "border-[#EE6507] bg-[#111A2E] text-white",
        danger: "border-[#DC2626] bg-[#111A2E] text-white",
        muted: "border-[#24314A] bg-[#111A2E] text-[#A8B3C7]",
      },
    },
    defaultVariants: {
      variant: "default",
      tone: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, tone, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, tone }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
