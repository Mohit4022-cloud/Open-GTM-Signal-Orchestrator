import { SignalStatus, TaskStatus, Temperature } from "@prisma/client";

import type {
  DashboardData,
  DashboardDistributionItemContract,
  DashboardFiltersInput,
  DashboardSummaryContract,
  HotAccountContract,
  RoutingFeedItem,
  UnmatchedSignalItem,
} from "@/lib/contracts/dashboard";
import { identityResolutionCodeValues, type IdentityResolutionCode } from "@/lib/contracts/signals";
import { getRecommendedQueue } from "@/lib/data/signals/presentation";
import { db } from "@/lib/db";
import {
  formatCompactNumber,
  formatEnumLabel,
} from "@/lib/formatters/display";
import { withMissingTableFallback } from "@/lib/prisma-errors";
import { summarizeRoutingExplanation } from "@/lib/routing/explanation";

import { getDashboardConversionView } from "./conversion";
import {
  formatDashboardPointLabel,
  formatRelativeFromReference,
  toUtcIsoDate,
} from "./reference-time";
import { getDashboardSlaView } from "./sla";
import {
  buildAppliedFilters,
  buildDashboardDemoMeta,
  getDashboardAccountScope,
  getPrimaryRoutingReasonMetadata,
  isSignalInAccountScope,
  resolveDashboardWindow,
  toDistributionItems,
} from "./shared";

function getAverageSpeedToLeadLabel(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  if (value < 60) {
    return `${value}m`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function getRoutingExplanationSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Routing explanation unavailable.";
  }

  return summarizeRoutingExplanation(
    value as Parameters<typeof summarizeRoutingExplanation>[0],
  );
}

function getHotAccountHeadlineReason(
  signals: Array<{
    eventType: string;
    payloadSummary: string;
  }>,
) {
  const summaries = signals
    .map((signal) =>
      signal.payloadSummary.length > 0
        ? signal.payloadSummary
        : formatEnumLabel(signal.eventType),
    )
    .filter(Boolean);

  if (summaries.length === 0) {
    return "No recent qualifying signals";
  }

  if (summaries.length === 1) {
    return summaries[0]!;
  }

  return `${summaries[0]} + ${summaries[1]}`;
}

const identityResolutionCodeSet = new Set<IdentityResolutionCode>(
  identityResolutionCodeValues,
);

function parseIdentityResolutionCodes(value: unknown): IdentityResolutionCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is IdentityResolutionCode =>
      typeof item === "string" &&
      identityResolutionCodeSet.has(item as IdentityResolutionCode),
  );
}

export async function getHotAccounts(
  filters: DashboardFiltersInput = {},
): Promise<HotAccountContract[]> {
  const accountScope = await getDashboardAccountScope(filters);
  const window = await resolveDashboardWindow(filters, accountScope);
  const accounts = await db.account.findMany({
    where: {
      temperature: {
        in: [Temperature.HOT, Temperature.URGENT],
      },
      ...(accountScope.hasScopedAccounts
        ? {
            id: {
              in: accountScope.accountIds,
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      domain: true,
      segment: true,
      status: true,
      overallScore: true,
      temperature: true,
      scoringVersion: true,
      scoreLastComputedAt: true,
      namedOwnerId: true,
      namedOwner: {
        select: {
          name: true,
        },
      },
      tasks: {
        where: {
          status: {
            in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
          },
        },
        select: {
          id: true,
        },
      },
      signals: {
        take: 2,
        orderBy: {
          occurredAt: "desc",
        },
        select: {
          occurredAt: true,
          eventType: true,
          payloadSummary: true,
        },
      },
    },
  });

  return accounts
    .map((account) => ({
      id: account.id,
      name: account.name,
      domain: account.domain,
      ownerId: account.namedOwnerId,
      ownerName: account.namedOwner?.name ?? null,
      segment: account.segment,
      segmentLabel: formatEnumLabel(account.segment),
      status: account.status,
      statusLabel: formatEnumLabel(account.status),
      score: account.overallScore,
      temperature: account.temperature,
      temperatureLabel: formatEnumLabel(account.temperature),
      scoringVersion: account.scoringVersion,
      scoreLastComputedAtIso: account.scoreLastComputedAt?.toISOString() ?? null,
      lastSignalAtIso: account.signals[0]?.occurredAt.toISOString() ?? null,
      lastSignalAtLabel: account.signals[0]?.occurredAt
        ? formatRelativeFromReference(
            account.signals[0].occurredAt,
            window.referenceDate,
          )
        : null,
      headlineReason: getHotAccountHeadlineReason(account.signals),
      openTaskCount: account.tasks.length,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftSignalAt = left.lastSignalAtIso
        ? new Date(left.lastSignalAtIso).getTime()
        : 0;
      const rightSignalAt = right.lastSignalAtIso
        ? new Date(right.lastSignalAtIso).getTime()
        : 0;

      if (rightSignalAt !== leftSignalAt) {
        return rightSignalAt - leftSignalAt;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 6);
}

async function getRecentRoutingFeed(
  filters: DashboardFiltersInput,
  start: Date,
  endExclusive: Date,
  referenceDate: Date,
): Promise<RoutingFeedItem[]> {
  const accountScope = await getDashboardAccountScope(filters);
  const decisions = await withMissingTableFallback(
    () =>
      db.routingDecision.findMany({
        where: {
          createdAt: {
            gte: start,
            lt: endExclusive,
          },
          ...(accountScope.hasScopedAccounts
            ? {
                accountId: {
                  in: accountScope.accountIds,
                },
              }
            : {}),
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 6,
        select: {
          id: true,
          assignedQueue: true,
          decisionType: true,
          createdAt: true,
          explanationJson: true,
          assignedOwner: {
            select: {
              name: true,
            },
          },
          account: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    [],
  );

  return decisions.map((decision) => ({
    id: decision.id,
    accountName: decision.account?.name ?? "Unmatched account",
    ownerName: decision.assignedOwner?.name ?? "Ops review",
    queue: decision.assignedQueue,
    decisionType: formatEnumLabel(decision.decisionType),
    createdAt: formatRelativeFromReference(decision.createdAt, referenceDate),
    explanation: getRoutingExplanationSummary(decision.explanationJson),
  }));
}

async function getUnmatchedSignalsPreview(
  filters: DashboardFiltersInput,
  referenceDate: Date,
): Promise<{
  totalCount: number;
  rows: UnmatchedSignalItem[];
}> {
  const accountScope = await getDashboardAccountScope(filters);
  const signals = await db.signalEvent.findMany({
    where: {
      status: SignalStatus.UNMATCHED,
    },
    orderBy: {
      receivedAt: "desc",
    },
    select: {
      id: true,
      eventType: true,
      sourceSystem: true,
      receivedAt: true,
      accountId: true,
      accountDomain: true,
      identityResolutionCodesJson: true,
    },
  });

  const filtered = signals.filter((signal) =>
    isSignalInAccountScope(signal, accountScope),
  );

  return {
    totalCount: filtered.length,
    rows: filtered.slice(0, 5).map((signal) => ({
      id: signal.id,
      eventType: formatEnumLabel(signal.eventType),
      sourceSystem: formatEnumLabel(signal.sourceSystem),
      receivedAt: formatRelativeFromReference(signal.receivedAt, referenceDate),
      recommendation: getRecommendedQueue(
        parseIdentityResolutionCodes(signal.identityResolutionCodesJson),
      ),
    })),
  };
}

async function getRoutingReasonDistribution(
  filters: DashboardFiltersInput,
  start: Date,
  endExclusive: Date,
): Promise<DashboardDistributionItemContract[]> {
  const accountScope = await getDashboardAccountScope(filters);
  const decisions = await withMissingTableFallback(
    () =>
      db.routingDecision.findMany({
        where: {
          createdAt: {
            gte: start,
            lt: endExclusive,
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
          reasonCodesJson: true,
        },
      }),
    [],
  );

  const counts = new Map<
    string,
    {
      label: string;
      description: string;
      value: number;
    }
  >();

  for (const decision of decisions) {
    const metadata = getPrimaryRoutingReasonMetadata(decision.reasonCodesJson);

    if (!metadata) {
      continue;
    }

    const current = counts.get(metadata.code) ?? {
      label: metadata.label,
      description: metadata.description,
      value: 0,
    };
    current.value += 1;
    counts.set(metadata.code, current);
  }

  return toDistributionItems(
    Array.from(counts.entries())
      .map(([key, value]) => ({
        key,
        label: value.label,
        description: value.description,
        value: value.value,
      }))
      .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label)),
  );
}

async function getSignalVolumeSeries(
  filters: DashboardFiltersInput,
  start: Date,
  endExclusive: Date,
  pointDates: Date[],
) {
  const accountScope = await getDashboardAccountScope(filters);
  const signals = await db.signalEvent.findMany({
    where: {
      receivedAt: {
        gte: start,
        lt: endExclusive,
      },
    },
    select: {
      receivedAt: true,
      status: true,
      accountId: true,
      accountDomain: true,
    },
  });

  const filteredSignals = signals.filter((signal) =>
    isSignalInAccountScope(signal, accountScope),
  );
  const countsByDay = new Map<
    string,
    {
      signals: number;
      matched: number;
    }
  >();

  for (const signal of filteredSignals) {
    const key = toUtcIsoDate(signal.receivedAt);
    const current = countsByDay.get(key) ?? { signals: 0, matched: 0 };
    current.signals += 1;
    if (signal.status === SignalStatus.MATCHED) {
      current.matched += 1;
    }
    countsByDay.set(key, current);
  }

  const points = pointDates.map((pointDate) => {
    const key = toUtcIsoDate(pointDate);
    const counts = countsByDay.get(key) ?? { signals: 0, matched: 0 };
    return {
      date: formatDashboardPointLabel(pointDate),
      signals: counts.signals,
      matched: counts.matched,
    };
  });

  return {
    granularity: "day" as const,
    startDate: toUtcIsoDate(start),
    endDate: toUtcIsoDate(new Date(endExclusive.getTime() - 1)),
    totalSignals: filteredSignals.length,
    totalMatched: filteredSignals.filter(
      (signal) => signal.status === SignalStatus.MATCHED,
    ).length,
    points,
  };
}

export async function getDashboardSummary(
  filters: DashboardFiltersInput = {},
): Promise<DashboardSummaryContract> {
  const accountScope = await getDashboardAccountScope(filters);
  const window = await resolveDashboardWindow(filters, accountScope);
  const [hotAccounts, signalVolumeSeries, slaView, conversionView, unmatchedPreview, recentRoutingDecisions, routingReasonDistribution, routedToday] =
    await Promise.all([
      getHotAccounts(filters),
      getSignalVolumeSeries(
        filters,
        window.start,
        window.endExclusive,
        window.pointDates,
      ),
      getDashboardSlaView(filters),
      getDashboardConversionView(filters),
      getUnmatchedSignalsPreview(filters, window.referenceDate),
      getRecentRoutingFeed(
        filters,
        window.start,
        window.endExclusive,
        window.referenceDate,
      ),
      getRoutingReasonDistribution(filters, window.start, window.endExclusive),
      withMissingTableFallback(
        async () => {
          const decisions = await db.routingDecision.count({
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
          });
          return decisions;
        },
        0,
      ),
    ]);

  const signalsReceivedToday = signalVolumeSeries.points.at(-1)?.signals ?? 0;
  const hotAccountCount = hotAccounts.length;
  const hotAccountShare =
    accountScope.hasScopedAccounts && accountScope.accountIds.length > 0
      ? Math.round((hotAccountCount / accountScope.accountIds.length) * 100)
      : hotAccountCount > 0
        ? Math.round((hotAccountCount / (await db.account.count())) * 100)
        : 0;

  return {
    asOfIso: window.referenceDate.toISOString(),
    demoMeta: buildDashboardDemoMeta(window.referenceDate),
    appliedFilters: buildAppliedFilters(filters, window),
    kpis: [
      {
        key: "signalsReceivedToday",
        label: "Signals received today",
        value: formatCompactNumber(signalsReceivedToday),
        rawValue: signalsReceivedToday,
        change: `${signalVolumeSeries.totalSignals} in the active demo window`,
        tone: "default",
      },
      {
        key: "routedToday",
        label: "Routed today",
        value: formatCompactNumber(routedToday),
        rawValue: routedToday,
        change: `${recentRoutingDecisions.length} recent routing decisions`,
        tone: routedToday > 0 ? "positive" : "default",
      },
      {
        key: "unmatchedSignals",
        label: "Unmatched signals",
        value: formatCompactNumber(unmatchedPreview.totalCount),
        rawValue: unmatchedPreview.totalCount,
        change: "Current unmatched backlog in the demo ops queue",
        tone: unmatchedPreview.totalCount > 2 ? "warning" : "default",
      },
      {
        key: "hotAccounts",
        label: "Hot accounts",
        value: formatCompactNumber(hotAccountCount),
        rawValue: hotAccountCount,
        change: `${hotAccountShare}% of the scoped portfolio`,
        tone: "positive",
      },
      {
        key: "slaBreaches",
        label: "SLA breaches",
        value: formatCompactNumber(slaView.summary.leadMetrics.breachedCount),
        rawValue: slaView.summary.leadMetrics.breachedCount,
        change:
          slaView.summary.leadMetrics.attainmentRate === null
            ? "No resolved tracked leads yet"
            : `${Math.round(slaView.summary.leadMetrics.attainmentRate * 100)}% attainment on resolved tracked leads`,
        tone:
          slaView.summary.leadMetrics.breachedCount > 0 ? "warning" : "positive",
      },
      {
        key: "averageSpeedToLead",
        label: "Avg. speed-to-lead",
        value: getAverageSpeedToLeadLabel(
          slaView.summary.leadMetrics.averageSpeedToLeadMinutes,
        ),
        rawValue: slaView.summary.leadMetrics.averageSpeedToLeadMinutes ?? 0,
        change: `${slaView.tasksDueToday.totalCount} tasks due on the reference day`,
        tone: "default",
      },
    ],
    signalVolume14d: signalVolumeSeries.points,
    signalVolumeSeries,
    slaHealth: slaView.slaHealth,
    slaSummary: slaView.summary,
    routingReasonDistribution,
    conversionByScoreBucket: conversionView.conversionByScoreBucket,
    hotAccounts,
    recentRoutingDecisions,
    unmatchedSignalsPreview: unmatchedPreview,
    tasksDueToday: slaView.tasksDueToday,
    benchmarkMetrics: conversionView.benchmarkMetrics,
  };
}

export function mapDashboardSummaryToData(
  summary: DashboardSummaryContract,
): DashboardData {
  return {
    kpis: summary.kpis.map(({ label, value, change, tone }) => ({
      label,
      value,
      change,
      tone,
    })),
    signalVolume14d: summary.signalVolume14d,
    slaHealth: summary.slaHealth,
    hotAccounts: summary.hotAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      owner: account.ownerName ?? "Unassigned",
      segment: account.segmentLabel,
      score: account.score,
      lastSignalAt: account.lastSignalAtLabel ?? "No recent signals",
    })),
    unmatchedSignals: summary.unmatchedSignalsPreview.rows,
    recentRoutingDecisions: summary.recentRoutingDecisions,
    demoMeta: summary.demoMeta,
    routingReasonDistribution: summary.routingReasonDistribution,
    tasksDueToday: summary.tasksDueToday,
    benchmarkMetrics: summary.benchmarkMetrics,
  };
}

export async function getDashboardData(
  filters: DashboardFiltersInput = {},
): Promise<DashboardData> {
  const summary = await getDashboardSummary(filters);
  return mapDashboardSummaryToData(summary);
}
