import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:scale-[1.02] active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 hover:from-blue-600 hover:to-blue-700",
        destructive:
          "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/30",
        outline:
          "border-2 border-slate-200 bg-transparent hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50 hover:border-blue-300 hover:text-blue-600 dark:border-slate-600 dark:hover:from-blue-900/30 dark:hover:to-cyan-900/30 dark:hover:border-blue-400 dark:hover:text-blue-300",
        secondary:
          "bg-gradient-to-r from-slate-100 to-slate-50 text-slate-700 border border-slate-200 hover:from-slate-200 hover:to-slate-100 dark:from-slate-800 dark:to-slate-700 dark:text-slate-200 dark:border-slate-600",
        ghost: "hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50 hover:text-blue-600 dark:hover:from-blue-900/30 dark:hover:to-cyan-900/30 dark:hover:text-blue-300",
        link: "text-blue-500 underline-offset-4 hover:underline hover:text-blue-600",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-10 rounded-lg px-4",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-11 w-11 rounded-xl",
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
