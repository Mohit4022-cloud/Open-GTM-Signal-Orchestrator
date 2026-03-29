import { ListX } from "lucide-react";

import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { SlaStateBadge } from "@/components/leads/SlaStateBadge";
import { SlaCountdownText } from "@/components/leads/SlaCountdownText";
import { TaskPriorityBadge } from "@/components/tasks/TaskPriorityBadge";
import type { TaskQueueItemContract } from "@/lib/contracts/actions";
import { formatEnumLabel, formatRelativeTime } from "@/lib/formatters/display";
import { cn } from "@/lib/utils";

const COLUMNS = [
  "Task",
  "Type",
  "Priority",
  "Account / Lead",
  "Owner",
  "Due",
  "SLA",
  "Countdown",
];

type Props = {
  rows: TaskQueueItemContract[];
};

export function TaskQueueTable({ rows }: Props) {
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
                  <ListX className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                  <p className="font-semibold text-foreground">
                    No open tasks found
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try adjusting your filters or check back when new tasks are
                    created.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className={cn(
                    "bg-white/70 transition-colors hover:bg-panel-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                    row.isOverdue && "border-l-2 border-l-danger/50",
                  )}
                  aria-label={`Task: ${row.title}`}
                >
                  {/* Task */}
                  <td className="max-w-[280px] px-5 py-4">
                    <p
                      className="truncate font-semibold text-foreground"
                      title={row.title}
                    >
                      {row.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.reasonSummary.primaryLabel}
                    </p>
                  </td>

                  {/* Type */}
                  <td className="px-5 py-4">
                    <Badge tone="neutral">
                      {formatEnumLabel(row.taskType)}
                    </Badge>
                  </td>

                  {/* Priority */}
                  <td className="px-5 py-4">
                    <TaskPriorityBadge
                      priorityLabel={row.priorityLabel}
                      priorityCode={row.priorityCode}
                    />
                  </td>

                  {/* Account / Lead */}
                  <td className="px-5 py-4">
                    {row.linkedEntity.accountName ? (
                      <>
                        <p className="font-semibold text-foreground">
                          {row.linkedEntity.accountName}
                        </p>
                        {row.linkedEntity.contactName && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.linkedEntity.contactName}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Owner */}
                  <td className="px-5 py-4 text-sm">
                    {row.owner?.name ?? (
                      <span className="text-xs font-medium text-warning">
                        Unassigned
                      </span>
                    )}
                  </td>

                  {/* Due */}
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "text-sm",
                        row.isOverdue
                          ? "font-medium text-danger"
                          : "text-foreground",
                      )}
                    >
                      {formatRelativeTime(row.dueAtIso)}
                    </span>
                  </td>

                  {/* SLA */}
                  <td className="px-5 py-4">
                    {row.sla.isTracked ? (
                      <SlaStateBadge state={row.sla.currentState} />
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Countdown */}
                  <td className="px-5 py-4">
                    <SlaCountdownText sla={row.sla} />
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
