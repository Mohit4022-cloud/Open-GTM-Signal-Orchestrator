import { AlertTriangle, Flame, ShieldAlert, Users } from "lucide-react";

import { LeadQueueClientView } from "@/components/leads/LeadQueueClientView";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { getLeadQueue } from "@/lib/queries/leads";

export default async function LeadsPage() {
  const queue = await getLeadQueue({});

  const stats = {
    total: queue.rows.length,
    hot: queue.rows.filter((r) => r.queueFlags.isHot).length,
    overdueSla: queue.rows.filter((r) => r.queueFlags.isOverdueSla).length,
    unassigned: queue.rows.filter((r) => r.queueFlags.isUnassigned).length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operator queue"
        title="Lead intake and routing queue"
        description="Monitor active leads across all routing queues. Filter by temperature, SLA state, or assignment status to prioritize operator actions."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">
              <Users className="mr-1 size-3.5" />
              {stats.total} leads
            </Badge>
            {stats.overdueSla > 0 && (
              <Badge tone="danger">
                <ShieldAlert className="mr-1 size-3.5" />
                {stats.overdueSla} SLA violations
              </Badge>
            )}
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Total leads
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p className="font-mono text-3xl font-semibold text-foreground">
              {stats.total}
            </p>
            <Users className="size-5 text-accent" />
          </div>
        </Card>

        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Hot leads
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p className="font-mono text-3xl font-semibold text-foreground">
              {stats.hot}
            </p>
            <Flame className="size-5 text-success" />
          </div>
        </Card>

        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Overdue SLA
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p
              className={`font-mono text-3xl font-semibold ${stats.overdueSla > 0 ? "text-danger" : "text-foreground"}`}
            >
              {stats.overdueSla}
            </p>
            <ShieldAlert
              className={`size-5 ${stats.overdueSla > 0 ? "text-danger" : "text-muted-foreground"}`}
            />
          </div>
        </Card>

        <Card className="rounded-[28px] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Unassigned
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p
              className={`font-mono text-3xl font-semibold ${stats.unassigned > 0 ? "text-warning" : "text-foreground"}`}
            >
              {stats.unassigned}
            </p>
            <AlertTriangle
              className={`size-5 ${stats.unassigned > 0 ? "text-warning" : "text-muted-foreground"}`}
            />
          </div>
        </Card>
      </div>

      <LeadQueueClientView rows={queue.rows} totalCount={queue.totalCount} />
    </div>
  );
}
