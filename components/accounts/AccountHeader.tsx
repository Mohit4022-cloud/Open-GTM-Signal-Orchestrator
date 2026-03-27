import type { AccountDetailView } from "@/lib/types";

import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { cn } from "@/lib/utils";

type AccountHeaderProps = Pick<
  AccountDetailView,
  | "name"
  | "domain"
  | "industry"
  | "geography"
  | "lifecycleStage"
  | "segment"
  | "status"
  | "score"
  | "fitScore"
  | "owner"
  | "ownerRole"
  | "tier"
>;

function getScoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 65) return "text-warning";
  return "text-foreground";
}

function getStatusTone(score: number): "positive" | "warning" | "neutral" {
  if (score >= 80) return "positive";
  if (score >= 65) return "warning";
  return "neutral";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

type AttributeChipProps = {
  label: string;
  value: string;
};

function AttributeChip({ label, value }: AttributeChipProps) {
  return (
    <div className="rounded-xl border border-border bg-panel-muted/80 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export function AccountHeader({
  name,
  domain,
  industry,
  geography,
  lifecycleStage,
  segment,
  status,
  score,
  fitScore,
  owner,
  ownerRole,
  tier,
}: AccountHeaderProps) {
  return (
    <Card className="p-6">
      {/* Row 1: Identity + Score */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        {/* Left: name + attribute chips */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <AttributeChip label="Domain" value={domain} />
            <AttributeChip label="Industry" value={industry} />
            <AttributeChip label="Geography" value={geography} />
            <AttributeChip label="Lifecycle" value={lifecycleStage} />
          </div>
        </div>

        {/* Right: Overall score */}
        <div
          className="shrink-0 rounded-[28px] border border-border bg-panel px-5 py-4 shadow-[var(--shadow-sm)]"
          aria-label={`Overall score: ${score}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Overall score
          </p>
          <p className={cn("mt-2 font-mono text-4xl font-semibold", getScoreColor(score))}>
            {score}
          </p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">Fit: {fitScore}</p>
        </div>
      </div>

      <hr className="my-5 border-border" />

      {/* Row 2: Classification + Owner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: classification badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{segment}</Badge>
          <Badge tone={getStatusTone(score)}>{status}</Badge>
          <Badge tone="neutral">{tier}</Badge>
        </div>

        {/* Right: owner pill */}
        <div
          className="flex items-center gap-2.5 rounded-2xl border border-border bg-panel-muted px-4 py-2.5"
          aria-label={`Account owner: ${owner}`}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-xs font-bold text-accent">
            {getInitials(owner)}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{owner}</p>
            <p className="text-xs text-muted-foreground">{ownerRole}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
