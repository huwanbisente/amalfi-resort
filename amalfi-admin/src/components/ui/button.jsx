import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(10,107,95,0.18)] hover:-translate-y-0.5 hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_10px_22px_rgba(200,74,74,0.18)] hover:bg-destructive/90",
        outline:
          "border border-[#d8c9b3]/80 bg-[#fffdf8]/85 text-[#13211f] shadow-[0_10px_22px_rgba(19,33,31,0.045)] hover:-translate-y-0.5 hover:border-[#c6923f]/55 hover:bg-[#f7eedf]/75 hover:text-[#13211f]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_8px_18px_rgba(19,33,31,0.04)] hover:-translate-y-0.5 hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
