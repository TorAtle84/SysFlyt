import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Default = Secondary blue (standard actions: Lagre, Oppdater, Fortsett)
        default: "bg-[#20528D] text-white hover:bg-[#2A6AAD] active:bg-[#1A4273]",

        // CTA = Attention orange (primary CTA: Opprett, Generer, Send) - use sparingly
        cta: "bg-[#EE6507] text-white hover:bg-[#FF7A1F] active:bg-[#D55906]",

        // Success = Green (confirmations, positive actions)
        success: "bg-[#529233] text-white hover:bg-[#5FA63C] active:bg-[#467A2B]",

        // Destructive
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",

        // Outline = Bordered button on surface
        outline: "border border-[#24314A] bg-transparent text-[#E8EEF7] hover:bg-[#16213A] hover:text-white active:bg-[#1E2D4A]",

        // Secondary = Subtle background
        secondary: "bg-[#16213A] text-[#E8EEF7] hover:bg-[#1E2D4A] active:bg-[#24314A]",

        // Ghost = No background until hover
        ghost: "text-[#A8B3C7] hover:bg-[#16213A] hover:text-[#E8EEF7] active:bg-[#1E2D4A]",

        // Link = Text link style
        link: "text-[#20528D] underline-offset-4 hover:underline hover:text-[#2A6AAD]",
      },
      size: {
        default: "min-h-[44px] sm:min-h-[40px] px-4 py-2",
        sm: "min-h-[40px] sm:min-h-[36px] rounded-md px-3",
        lg: "min-h-[48px] sm:min-h-[44px] rounded-md px-8",
        icon: "min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    // When asChild is true, Slot requires exactly ONE child element
    // We must not render any additional elements or fragments
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          disabled={disabled || loading}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" size={16} />}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
