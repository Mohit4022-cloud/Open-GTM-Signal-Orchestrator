import type { ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Flame,
  Router,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from "lucide-react";

import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { HotAccountsTable } from "@/components/dashboard/HotAccountsTable";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { MetricCard } from "@/components/shared/MetricCard";
import { getDashboardData } from "@/lib/queries/dashboard";

/** Maps known KPI labels to a Lucide icon for quick visual scanning. */
const KPI_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  "Signals received today": Activity,
  "Routed today": Router,
  "Unmatched signals": AlertTriangle,
  "Hot accounts": Flame,
  "SLA breaches": ShieldAlert,
  "Avg. speed-to-lead": Timer,
};

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operator console"
        title="Demand orchestration at a glance"
        description="Monitor signal intake, routing quality, and SLA pressure across the seeded GTM workspace. All metrics below are driven from local Prisma queries against SQLite."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">Read-only local mode</Badge>
            <Badge tone="neutral">No external services</Badge>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.kpis.map((kpi) => (
          <MetricCard
            key={kpi.label}
            {...kpi}
            icon={KPI_ICON_MAP[kpi.label]}
          />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Signal volume
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                14-day inbound and matched signal trend
              </h2>
            </div>
            <Badge tone="accent">
              <Activity className="mr-1 size-3.5" aria-hidden />
              High-intent stream
            </Badge>
          </div>
          <div className="mt-6">
            <DashboardCharts kind="signals" data={data.signalVolume14d} />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                SLA health
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Response coverage by working state
              </h2>
            </div>
            <Badge tone="neutral">
              <ShieldCheck className="mr-1 size-3.5" aria-hidden />
              Follow-up posture
            </Badge>
          </div>
          <div className="mt-6">
            <DashboardCharts kind="sla" data={data.slaHealth} />
          </div>
        </Card>
      </div>

      {/* Hot Accounts + Feed Row */}
      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        {/* Hot Accounts */}
        <Card className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Hot accounts
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Accounts with the strongest activation signals
              </h2>
            </div>
            <Badge tone="positive">
              <Flame className="mr-1 size-3.5" aria-hidden />
              Prioritize now
            </Badge>
          </div>
          <HotAccountsTable accounts={data.hotAccounts} />
        </Card>

        {/* Right column */}
        <div className="grid gap-6">
          {/* Unmatched Signals */}
          <Card className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Unmatched signals
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  Ops review queue
                </h2>
              </div>
              <Badge tone="warning">
                <AlertTriangle className="mr-1 size-3.5" aria-hidden />
                Needs review
              </Badge>
            </div>
            {data.unmatchedSignals.length === 0 ? (
              <div className="flex h-20 items-center justify-center rounded-2xl border border-border bg-panel-muted/40 text-sm text-muted-foreground">
                Queue is clear
              </div>
            ) : (
              <div className="space-y-3">
                {data.unmatchedSignals.map((signal) => (
                  <div
                    key={signal.id}
                    className="rounded-2xl border border-border bg-panel-muted/70 p-4"
                  >
                    <p className="font-semibold text-foreground">{signal.eventType}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {signal.sourceSystem} · {signal.receivedAt}
                    </p>
                    <p className="mt-3 text-sm text-foreground">
                      Recommended queue:{" "}
                      <span className="font-medium">{signal.recommendation}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Activity Feed */}
          <Card className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Routing decisions
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  Most recent policy outcomes
                </h2>
              </div>
              <Badge tone="neutral">
                <Router className="mr-1 size-3.5" aria-hidden />
                Policy trace
              </Badge>
            </div>
            <ActivityFeed items={data.recentRoutingDecisions} />
          </Card>
        </div>
      </div>
    </div>
  );
}
