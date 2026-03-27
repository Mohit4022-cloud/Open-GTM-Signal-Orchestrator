import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  label: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  iconVariant?: "default" | "accent";
  badge?: ReactNode;
  className?: string;
};

const iconVariantMap = {
  default: "rounded-2xl border border-border bg-panel-muted p-2 text-foreground",
  accent: "rounded-2xl border border-accent/15 bg-accent-muted p-2 text-accent",
} as const;

export function SectionHeader({
  label,
  title,
  icon: Icon,
  iconVariant = "default",
  badge,
  className,
}: SectionHeaderProps) {
  const labelEl = (
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {label}
    </p>
  );
  const titleEl = (
    <h2 className="text-xl font-semibold text-foreground">{title}</h2>
  );

  // Pattern A — icon on left
  if (Icon) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <span className={iconVariantMap[iconVariant]}>
          <Icon className="size-5" />
        </span>
        <div>
          {labelEl}
          <div className="mt-1">{titleEl}</div>
        </div>
      </div>
    );
  }

  // Pattern B — badge on right
  if (badge) {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <div>
          {labelEl}
          <div className="mt-2">{titleEl}</div>
        </div>
        {badge}
      </div>
    );
  }

  // Pattern C — plain label + title
  return (
    <div className={className}>
      {labelEl}
      <div className="mt-2">{titleEl}</div>
    </div>
  );
}
