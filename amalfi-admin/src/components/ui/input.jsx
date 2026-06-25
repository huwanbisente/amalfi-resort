import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-[#d8c9b3]/80 bg-[#fffdf8]/80 px-3 py-1 text-base text-[#13211f] shadow-[0_8px_18px_rgba(19,33,31,0.035)] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[#7b857f] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0a6b5f]/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
