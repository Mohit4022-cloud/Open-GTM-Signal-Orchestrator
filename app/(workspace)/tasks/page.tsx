import { AlertCircle, ListChecks, UserX, Zap } from "lucide-react";

import { TaskQueueClientView } from "@/components/tasks/TaskQueueClientView";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { getDashboardTaskSummary, getTaskQueue } from "@/lib/actions";

export default async function TasksPage() {
  const [queue, summary] = await Promise.all([
    getTaskQueue({}),
    getDashboardTaskSummary(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Work queue"
        title="Open task queue"
        description="Operator action queue showing all open and in-progress tasks. Overdue rows are highlighted. Filter by type or priority to focus your workflow."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">
              <ListChecks className="mr-1 size-3.5" />
              {summary.openCount} open
            </Badge>
            {summary.overdueCount > 0 && (
              <Badge tone="danger">
                <AlertCircle className="mr-1 size-3.5" />
                {summary.overdueCount} overdue
              </Badge>
            )}
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Open tasks
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p className="font-mono text-3xl font-semibold text-foreground">
              {summary.openCount}
            </p>
            <ListChecks className="size-5 text-accent" />
          </div>
        </Card>

        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Overdue
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p
              className={`font-mono text-3xl font-semibold ${summary.overdueCount > 0 ? "text-danger" : "text-foreground"}`}
            >
              {summary.overdueCount}
            </p>
            <AlertCircle
              className={`size-5 ${summary.overdueCount > 0 ? "text-danger" : "text-muted-foreground"}`}
            />
          </div>
        </Card>

        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Urgent (P1)
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p
              className={`font-mono text-3xl font-semibold ${summary.urgentCount > 0 ? "text-warning" : "text-foreground"}`}
            >
              {summary.urgentCount}
            </p>
            <Zap
              className={`size-5 ${summary.urgentCount > 0 ? "text-warning" : "text-muted-foreground"}`}
            />
          </div>
        </Card>

        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Unassigned
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p
              className={`font-mono text-3xl font-semibold ${summary.unassignedCount > 0 ? "text-warning" : "text-foreground"}`}
            >
              {summary.unassignedCount}
            </p>
            <UserX
              className={`size-5 ${summary.unassignedCount > 0 ? "text-warning" : "text-muted-foreground"}`}
            />
          </div>
        </Card>
      </div>

      <TaskQueueClientView rows={queue.rows} totalCount={queue.totalCount} />
    </div>
  );
}
