import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { cn } from "@/lib/utils";

type SectionCardProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  count?: number;
  iconTone?: "default" | "accent";
  children: ReactNode;
  className?: string;
};

export function SectionCard({
  icon: Icon,
  eyebrow,
  title,
  count,
  iconTone = "default",
  children,
  className,
}: SectionCardProps) {
  return (
    <Card className={cn("p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "rounded-2xl border p-2",
              iconTone === "accent"
                ? "border-accent/15 bg-accent-muted text-accent"
                : "border-border bg-panel-muted text-foreground",
            )}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">{title}</h2>
          </div>
        </div>
        {typeof count === "number" && (
          <Badge tone="neutral">{count}</Badge>
        )}
      </div>
      <div className="mt-6">{children}</div>
    </Card>
  );
}
