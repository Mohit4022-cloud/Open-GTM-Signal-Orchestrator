import { Badge } from "@/components/shared/Badge";
import { formatDateTime } from "@/lib/formatters/display";

function formatSlaMinutes(minutes: number | null): string {
  if (minutes === null) return "No SLA";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hr" : `${hours} hr`;
}

type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "danger";

function slaToTone(minutes: number | null): BadgeTone {
  if (minutes === null) return "neutral";
  if (minutes <= 15) return "danger";
  if (minutes <= 120) return "warning";
  return "neutral";
}

type SlaTargetBadgeProps = {
  targetMinutes: number | null;
  dueAtIso: string | null;
};

export function SlaTargetBadge({ targetMinutes, dueAtIso }: SlaTargetBadgeProps) {
  if (targetMinutes === null && dueAtIso === null) {
    return (
      <div className="rounded-xl border border-border bg-panel-muted/80 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          SLA target
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">No SLA assigned</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-panel-muted/80 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        SLA target
      </p>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-foreground">
          {formatSlaMinutes(targetMinutes)}
        </span>
        <Badge tone={slaToTone(targetMinutes)}>{formatSlaMinutes(targetMinutes)}</Badge>
      </div>
      {dueAtIso ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Due {formatDateTime(dueAtIso)}
        </p>
      ) : null}
    </div>
  );
}
