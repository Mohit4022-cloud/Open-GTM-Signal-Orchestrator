import { Temperature } from "@prisma/client";

import type {
  DashboardBenchmarkMetricContract,
  DashboardConversionBucketContract,
  DashboardFiltersInput,
} from "@/lib/contracts/dashboard";
import { db } from "@/lib/db";
import { withMissingTableFallback } from "@/lib/prisma-errors";

import { getDashboardAccountScope, resolveDashboardWindow } from "./shared";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toResponseMinutes(input: {
  createdAt: Date;
  routedAt: Date | null;
  firstResponseAt: Date | null;
}) {
  if (!input.firstResponseAt) {
    return null;
  }

  const startAt = input.routedAt ?? input.createdAt;
  return Math.max(
    0,
    Math.round((input.firstResponseAt.getTime() - startAt.getTime()) / 60000),
  );
}

export async function getDashboardBenchmarkMetrics(
  filters: DashboardFiltersInput,
  conversionByScoreBucket: DashboardConversionBucketContract[],
): Promise<DashboardBenchmarkMetricContract[]> {
  const accountScope = await getDashboardAccountScope(filters);
  const window = await resolveDashboardWindow(filters, accountScope);
  const hasExplicitDateRange = Boolean(filters.startDate || filters.endDate);
  const [resolvedLeads, inboundLeads, routingDecisions] = await Promise.all([
    db.lead.findMany({
      where: {
        firstResponseAt: {
          not: null,
        },
        ...(accountScope.hasScopedAccounts
          ? {
              accountId: {
                in: accountScope.accountIds,
              },
            }
          : {}),
      },
      select: {
        createdAt: true,
        routedAt: true,
        firstResponseAt: true,
        inboundType: true,
        temperature: true,
      },
    }),
    db.lead.findMany({
      where: {
        inboundType: {
          in: ["Inbound", "Signal-driven", "Product-led"],
        },
        ...(hasExplicitDateRange
          ? {
              createdAt: {
                gte: window.start,
                lt: window.endExclusive,
              },
            }
          : {}),
        ...(accountScope.hasScopedAccounts
          ? {
              accountId: {
                in: accountScope.accountIds,
              },
            }
          : {}),
      },
      select: {
        currentOwnerId: true,
      },
    }),
    withMissingTableFallback(
      () =>
        db.routingDecision.findMany({
          where: {
            createdAt: {
              gte: window.start,
              lt: window.endExclusive,
            },
            ...(accountScope.hasScopedAccounts
              ? {
                  accountId: {
                    in: accountScope.accountIds,
                  },
                }
              : {}),
          },
          select: {
            assignedQueue: true,
          },
        }),
      [],
    ),
  ]);

  const urgentResponseTimes = resolvedLeads
    .filter(
      (lead) =>
        lead.inboundType === "Inbound" &&
        (lead.temperature === Temperature.URGENT ||
          lead.temperature === Temperature.HOT),
    )
    .map(toResponseMinutes)
    .filter((value): value is number => value !== null);
  const comparisonResponseTimes = resolvedLeads
    .filter(
      (lead) =>
        lead.inboundType !== "Product-led" &&
        (lead.temperature === Temperature.WARM ||
          lead.temperature === Temperature.COLD),
    )
    .map(toResponseMinutes)
    .filter((value): value is number => value !== null);

  const positiveUrgentResponseTimes = urgentResponseTimes.filter(
    (value) => value > 0,
  );
  const positiveComparisonResponseTimes = comparisonResponseTimes.filter(
    (value) => value > 0,
  );
  const urgentAverage = getAverage(positiveUrgentResponseTimes);
  const comparisonAverage = getAverage(positiveComparisonResponseTimes);

  const urgentBucket =
    conversionByScoreBucket.find((bucket) => bucket.bucket === "urgent") ?? null;
  const comparisonBuckets = conversionByScoreBucket.filter(
    (bucket) => bucket.bucket !== "urgent",
  );
  const comparisonLeadCount = comparisonBuckets.reduce(
    (sum, bucket) => sum + bucket.leadCount,
    0,
  );
  const comparisonConvertedCount = comparisonBuckets.reduce(
    (sum, bucket) => sum + bucket.convertedCount,
    0,
  );
  const comparisonRate =
    comparisonLeadCount > 0
      ? comparisonConvertedCount / comparisonLeadCount
      : 0;

  const totalRouted = routingDecisions.length;
  const opsReviewCount = routingDecisions.filter(
    (decision) => decision.assignedQueue === "ops-review",
  ).length;
  const totalInboundLeads = inboundLeads.length;
  const unassignedInboundLeads = inboundLeads.filter(
    (lead) => lead.currentOwnerId === null,
  ).length;

  const metrics: DashboardBenchmarkMetricContract[] = [];

  const speedToLeadImprovement =
    urgentAverage !== null &&
    comparisonAverage !== null &&
    comparisonAverage > 0
      ? Number(
          ((comparisonAverage - urgentAverage) / comparisonAverage).toFixed(4),
        )
      : null;
  const hasViableDerivedSpeedComparison =
    speedToLeadImprovement !== null &&
    speedToLeadImprovement > 0 &&
    positiveUrgentResponseTimes.length >= 2 &&
    positiveComparisonResponseTimes.length >= 2;

  if (hasViableDerivedSpeedComparison && speedToLeadImprovement !== null) {
    const derivedUrgentAverage = urgentAverage as number;
    const derivedComparisonAverage = comparisonAverage as number;

    metrics.push({
      key: "averageSpeedToLeadImprovement",
      label: "Average speed-to-lead improvement",
      method: "derived",
      value: speedToLeadImprovement,
      displayValue: formatPercent(speedToLeadImprovement),
      formula: "(comparison_avg_minutes - urgent_avg_minutes) / comparison_avg_minutes",
      numerator: Number(
        (derivedComparisonAverage - derivedUrgentAverage).toFixed(2),
      ),
      denominator: Number(derivedComparisonAverage.toFixed(2)),
      comparisonLabel:
        "Urgent inbound resolved leads versus warm and cold resolved cohorts",
      explanation:
        "Compares response speed for urgent inbound work against slower seeded comparison cohorts.",
    });
  } else {
    const fallbackValue =
      speedToLeadImprovement !== null && speedToLeadImprovement > 0
        ? speedToLeadImprovement
        : 0;
    metrics.push({
      key: "averageSpeedToLeadImprovement",
      label: "Average speed-to-lead improvement",
      method: "scenario_benchmark",
      value: fallbackValue,
      displayValue: formatPercent(fallbackValue),
      benchmarkLabel: "Small-sample demo cohort benchmark",
      scenarioLabels: [
        "named-account pricing spike",
        "standard inbound follow-up",
      ],
      explanation:
        "This benchmark is labeled because only a small set of seeded scenarios have comparable positive response-time measurements in the demo sample.",
    });
  }

  if (urgentBucket && urgentBucket.leadCount > 0 && comparisonLeadCount > 0) {
    const lift =
      comparisonRate > 0
        ? Number(
            (
              (urgentBucket.conversionRate - comparisonRate) / comparisonRate
            ).toFixed(4),
          )
        : 0;
    metrics.push({
      key: "urgentScoreMeetingConversionLift",
      label: "Urgent-score meeting conversion lift",
      method: "derived",
      value: lift,
      displayValue: formatPercent(lift),
      formula:
        "(urgent_conversion_rate - non_urgent_conversion_rate) / non_urgent_conversion_rate",
      numerator: Number(
        (urgentBucket.conversionRate - comparisonRate).toFixed(4),
      ),
      denominator: Number(comparisonRate.toFixed(4)),
      comparisonLabel: "Urgent bucket against hot, warm, and cold buckets",
      explanation:
        "Compares meeting-booked conversion rates for urgent-score leads against the rest of the seeded score distribution.",
    });
  }

  const manualRoutingEffortReduction =
    totalRouted > 0
      ? Number(((1 - opsReviewCount / totalRouted)).toFixed(4))
      : 0;
  metrics.push({
    key: "manualRoutingEffortReduction",
    label: "Manual routing effort reduction",
    method: "derived",
    value: manualRoutingEffortReduction,
    displayValue: formatPercent(manualRoutingEffortReduction),
    formula: "1 - ops_review_routes / total_routes",
    numerator: totalRouted - opsReviewCount,
    denominator: totalRouted,
    comparisonLabel: "Automated routes versus ops-review handoffs",
    explanation:
      "Shows how much of the routed workload stayed out of the manual ops-review queue in the seeded demo window.",
  });

  const unassignedInboundLeadReduction =
    totalInboundLeads > 0
      ? Number(
          (
            (totalInboundLeads - unassignedInboundLeads) / totalInboundLeads
          ).toFixed(4),
        )
      : 0;
  metrics.push({
    key: "unassignedInboundLeadReduction",
    label: "Unassigned inbound lead reduction",
    method: "scenario_benchmark",
    value: unassignedInboundLeadReduction,
    displayValue: formatPercent(unassignedInboundLeadReduction),
    benchmarkLabel: "Manual queue baseline",
    scenarioLabels: [
      "overloaded-owner fallback routing",
      "unmatched event backlog",
    ],
    explanation:
      "This benchmark compares the current seeded inbound queue to a manual baseline where every new inbound lead would start unassigned.",
  });

  return metrics;
}
