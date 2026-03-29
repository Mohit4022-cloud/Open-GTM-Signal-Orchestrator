import type { SlaSnapshotContract } from "@/lib/contracts/sla";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/formatters/display";

type Props = {
  sla: SlaSnapshotContract;
};

function formatDuration(absSeconds: number): string {
  const h = Math.floor(absSeconds / 3600);
  const m = Math.floor((absSeconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "< 1m";
}

export function SlaCountdownText({ sla }: Props) {
  if (!sla.isTracked) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (sla.currentState === "completed") {
    return (
      <span className="font-mono text-xs text-muted-foreground">Met SLA</span>
    );
  }

  if (sla.currentState === "paused") {
    return (
      <span className="font-mono text-xs text-muted-foreground">Paused</span>
    );
  }

  const colorClass = cn(
    "font-mono text-xs",
    sla.currentState === "on_track" && "text-success",
    sla.currentState === "due_soon" && "text-warning",
    (sla.currentState === "overdue" || sla.currentState === "breached") &&
      "text-danger",
  );

  // Use timeRemainingSeconds when available (positive = future, negative = past)
  if (sla.timeRemainingSeconds !== null) {
    if (sla.timeRemainingSeconds === 0) {
      return <span className={cn(colorClass, "text-warning")}>Due now</span>;
    }

    const absSeconds = Math.abs(sla.timeRemainingSeconds);
    const duration = formatDuration(absSeconds);

    if (sla.timeRemainingSeconds < 0) {
      // Past due
      return <span className={colorClass}>{duration} overdue</span>;
    }

    // Future due
    return <span className={colorClass}>Due in {duration}</span>;
  }

  // Fallback: use dueAtIso with formatRelativeTime
  if (sla.dueAtIso) {
    const relTime = formatRelativeTime(sla.dueAtIso);
    const isOverdue =
      sla.currentState === "overdue" || sla.currentState === "breached";
    return (
      <span className={colorClass}>
        {isOverdue ? `Overdue ${relTime}` : relTime}
      </span>
    );
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}
