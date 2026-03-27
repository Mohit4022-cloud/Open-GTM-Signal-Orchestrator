import { ArrowRight, Router } from "lucide-react";

import { Badge } from "@/components/shared/Badge";
import type { RoutingFeedItem } from "@/lib/contracts/data-access";

type Props = {
  // TODO: Backend gap — getDashboardData() exposes recentRoutingDecisions (policy
  // trace), not raw signal events. Using routing decisions as activity feed proxy.
  // To show true signal events, expose getRecentSignals() via getDashboardData().
  items: RoutingFeedItem[];
};

export function ActivityFeed({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl border border-border bg-panel-muted/40 text-sm text-muted-foreground">
        No recent routing decisions
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical rail */}
      <div
        aria-hidden
        className="absolute left-[10px] top-3 bottom-3 w-px bg-border"
      />

      <ul className="space-y-0" role="list">
        {items.map((item, index) => (
          <li key={item.id} className="relative flex gap-4 py-4">
            {/* Timeline dot */}
            <div
              aria-hidden
              className="relative z-10 mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-accent/25 bg-panel"
            >
              <div className="size-2 rounded-full bg-accent/70" />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-foreground leading-snug">{item.accountName}</p>
                <Badge tone="accent" className="shrink-0">{item.queue}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.decisionType} · {item.ownerName}
              </p>
              <p className="text-sm leading-6 text-foreground">{item.explanation}</p>
              <p className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                {item.createdAt}
                <ArrowRight className="size-3" aria-hidden />
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
