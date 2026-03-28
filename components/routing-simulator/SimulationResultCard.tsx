import { Route } from "lucide-react";

import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { getDecisionTypeTone } from "@/lib/badgeHelpers";
import { formatEnumLabel } from "@/lib/formatters/display";
import { cn } from "@/lib/utils";
import type { RoutingSimulationResultContract, RoutingOwnerSummaryContract } from "@/lib/contracts/routing";

import { RoutingReasonList } from "./RoutingReasonList";
import { SlaTargetBadge } from "./SlaTargetBadge";

function OwnerPill({ owner, label }: { owner: RoutingOwnerSummaryContract; label: string }) {
  const initials = owner.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-panel-muted/70 px-4 py-3">
      <span
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent"
        aria-hidden="true"
      >
        {initials}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <p className="text-sm font-semibold text-foreground">{owner.name}</p>
        <p className="text-xs text-muted-foreground">
          {owner.role} · {owner.team} · {formatEnumLabel(owner.geography)}
        </p>
      </div>
    </div>
  );
}

type SimulationResultCardProps = {
  result: RoutingSimulationResultContract;
};

export function SimulationResultCard({ result }: SimulationResultCardProps) {
  const isOpsReview = result.decisionType === "ops_review_queue";
  const decisionTone = getDecisionTypeTone(result.decisionType);

  return (
    <Card
      className={cn(
        "p-6",
        isOpsReview && "border-warning/30 bg-warning/5",
      )}
    >
      <SectionHeader
        label="Simulation result"
        title={formatEnumLabel(result.decisionType)}
        badge={
          <Badge tone={decisionTone}>{formatEnumLabel(result.decisionType)}</Badge>
        }
      />
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {result.policyVersion}
      </p>

      {isOpsReview ? (
        <div className="mt-3 rounded-xl border border-warning/20 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          Lead sent to ops review — no eligible owner found under the current
          capacity scenario.
        </div>
      ) : null}

      <hr className="my-5 border-border" />

      {/* Owner assignment */}
      <div className="space-y-2">
        {result.simulatedOwner ? (
          <OwnerPill owner={result.simulatedOwner} label="Assigned owner" />
        ) : (
          <div className="rounded-2xl border border-border bg-panel-muted/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Assigned owner
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              No owner assigned
            </p>
          </div>
        )}
        {result.simulatedSecondaryOwner ? (
          <OwnerPill
            owner={result.simulatedSecondaryOwner}
            label="Secondary owner"
          />
        ) : null}
      </div>

      {/* Queue */}
      <div className="mt-3 rounded-xl border border-border bg-panel-muted/80 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Queue
        </p>
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {result.simulatedQueue}
        </p>
      </div>

      {/* Team */}
      {result.simulatedTeam ? (
        <div className="mt-2 rounded-xl border border-border bg-panel-muted/80 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Team
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            {result.simulatedTeam}
          </p>
        </div>
      ) : null}

      {/* SLA */}
      <div className="mt-2">
        <SlaTargetBadge
          targetMinutes={result.slaTargetMinutes}
          dueAtIso={result.slaDueAtIso}
        />
      </div>

      <hr className="my-5 border-border" />

      {/* Explanation summary */}
      <p className="text-sm leading-7 text-foreground">
        {result.explanation.summary}
      </p>

      {/* Reason codes */}
      <div className="mt-5">
        <RoutingReasonList details={result.reasonDetails} />
      </div>
    </Card>
  );
}
