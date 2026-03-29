import { Users } from "lucide-react";

import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { LeadTemperatureBadge } from "@/components/leads/LeadTemperatureBadge";
import { SlaStateBadge } from "@/components/leads/SlaStateBadge";
import { SlaCountdownText } from "@/components/leads/SlaCountdownText";
import type { LeadQueueItemContract } from "@/lib/contracts/leads";
import { getLeadStatusTone } from "@/lib/badgeHelpers";
import { formatEnumLabel, formatRelativeTime } from "@/lib/formatters/display";
import { cn } from "@/lib/utils";

const COLUMNS = [
  "Lead",
  "Account",
  "Score",
  "Temperature",
  "Status",
  "Owner",
  "Queue",
  "SLA",
  "Routed",
];

type Props = {
  rows: LeadQueueItemContract[];
  emptyIcon?: React.ComponentType<{ className?: string }>;
  emptyLabel?: string;
  emptyMessage?: string;
};

function scoreColorClass(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 65) return "text-warning";
  return "text-foreground";
}

export function LeadQueueTable({
  rows,
  emptyIcon: EmptyIcon = Users,
  emptyLabel = "No leads found",
  emptyMessage = "Try adjusting your filters or selecting a different queue.",
}: Props) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-left">
          <thead className="bg-panel-muted/80">
            <tr>
              {COLUMNS.map((label) => (
                <th
                  key={label}
                  className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-5 py-16 text-center"
                >
                  <EmptyIcon className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                  <p className="font-semibold text-foreground">{emptyLabel}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {emptyMessage}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className="bg-white/70 transition-colors hover:bg-panel-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  aria-label={`Lead for ${row.contactName ?? "unidentified contact"} at ${row.accountName}`}
                >
                  {/* Lead */}
                  <td className="px-5 py-4">
                    <p className="font-semibold text-foreground">
                      {row.contactName ?? (
                        <span className="text-muted-foreground">
                          Unidentified
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatEnumLabel(row.source)}
                    </p>
                  </td>

                  {/* Account */}
                  <td className="px-5 py-4 text-sm text-foreground">
                    {row.accountName}
                  </td>

                  {/* Score */}
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "font-mono text-lg font-semibold",
                        scoreColorClass(row.score),
                      )}
                    >
                      {row.score}
                    </span>
                  </td>

                  {/* Temperature */}
                  <td className="px-5 py-4">
                    <LeadTemperatureBadge temperature={row.temperature} />
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <Badge tone={getLeadStatusTone(row.status)}>
                      {formatEnumLabel(row.status)}
                    </Badge>
                  </td>

                  {/* Owner */}
                  <td className="px-5 py-4 text-sm">
                    {row.currentOwnerName ?? (
                      <span className="text-xs font-medium text-warning">
                        Unassigned
                      </span>
                    )}
                  </td>

                  {/* Queue */}
                  <td className="px-5 py-4">
                    {row.routing.currentQueue ? (
                      <Badge tone="neutral">{row.routing.currentQueue}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* SLA */}
                  <td className="px-5 py-4">
                    {row.sla.isTracked ? (
                      <div className="space-y-1">
                        <SlaStateBadge state={row.sla.currentState} />
                        <SlaCountdownText sla={row.sla} />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Routed */}
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {row.routing.routedAtIso
                      ? formatRelativeTime(row.routing.routedAtIso)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
