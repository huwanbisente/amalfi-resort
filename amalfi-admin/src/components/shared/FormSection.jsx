import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function FormSection({ title, description, actions, className, children }) {
  return (
    <Card className={cn("rounded-2xl border-transparent bg-[#fffdf8]/96 shadow-[0_16px_36px_rgba(19,33,31,0.06)] shadow-[0_16px_36px_rgba(19,33,31,0.06)]", className)}>
      <CardHeader className="flex flex-col gap-1.5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <CardTitle className="font-resortDisplay text-lg text-amalfi-ink">{title}</CardTitle>}
            {description && <CardDescription className="mt-1 text-sm font-medium text-amalfi-muted">{description}</CardDescription>}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="p-5 pt-0">{children}</CardContent>
    </Card>
  );
}
