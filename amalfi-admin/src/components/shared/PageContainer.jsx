import React from "react";
import { cn } from "@/lib/utils";

export const PageContainer = React.forwardRef(function PageContainer({ className, children }, ref) {
  return (
    <div ref={ref} className={cn("min-h-[calc(100vh-170px)]", className)}>
      {children}
    </div>
  );
});
