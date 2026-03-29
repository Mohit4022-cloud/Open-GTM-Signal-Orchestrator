import {
  LifecycleStage,
  Segment,
  SignalType,
  Temperature,
} from "@prisma/client";

import type {
  DashboardConversionBucketContract,
  DashboardConversionViewContract,
  DashboardDistributionItemContract,
  DashboardFiltersInput,
  DashboardPipelineStageConversionBySegmentContract,
  DashboardScoreDistributionContract,
  ScoreBucket,
} from "@/lib/contracts/dashboard";
import { db } from "@/lib/db";
import { formatEnumLabel } from "@/lib/formatters/display";

import { getDashboardBenchmarkMetrics } from "./benchmarks";
import {
  buildAppliedFilters,
  buildDashboardDemoMeta,
  getDashboardAccountScope,
  resolveDashboardWindow,
  toDistributionItems,
} from "./shared";

const orderedBuckets: ScoreBucket[] = ["urgent", "hot", "warm", "cold"];

function getBucketLabel(bucket: ScoreBucket) {
  switch (bucket) {
    case "urgent":
      return "Urgent";
    case "hot":
      return "Hot";
    case "warm":
      return "Warm";
    case "cold":
      return "Cold";
  }
}

function getBucketByTemperature(temperature: Temperature): ScoreBucket {
  switch (temperature) {
    case Temperature.URGENT:
      return "urgent";
    case Temperature.HOT:
      return "hot";
    case Temperature.WARM:
      return "warm";
    case Temperature.COLD:
      return "cold";
  }
}

function buildScoreDistribution(
  counts: Record<ScoreBucket, number>,
  descriptions: Record<ScoreBucket, string>,
): DashboardDistributionItemContract[] {
  return toDistributionItems(
    orderedBuckets.map((bucket) => ({
      key: bucket,
      label: getBucketLabel(bucket),
      description: descriptions[bucket],
      value: counts[bucket],
    })),
  );
}

export async function getDashboardConversionView(
  filters: DashboardFiltersInput = {},
): Promise<DashboardConversionViewContract> {
  const accountScope = await getDashboardAccountScope(filters);
  const window = await resolveDashboardWindow(filters, accountScope);
  const hasExplicitDateRange = Boolean(filters.startDate || filters.endDate);
  const [leads, accounts, meetingSignals] = await Promise.all([
    db.lead.findMany({
      where: {
        ...(accountScope.hasScopedAccounts
          ? {
              accountId: {
                in: accountScope.accountIds,
              },
            }
          : {}),
        ...(hasExplicitDateRange
          ? {
              createdAt: {
                gte: window.start,
                lt: window.endExclusive,
              },
            }
          : {}),
      },
      select: {
        id: true,
        accountId: true,
        source: true,
        temperature: true,
        createdAt: true,
        firstResponseAt: true,
        routedAt: true,
      },
    }),
    db.account.findMany({
      where: accountScope.hasScopedAccounts
        ? {
            id: {
              in: accountScope.accountIds,
            },
          }
        : undefined,
      select: {
        id: true,
        segment: true,
        lifecycleStage: true,
        temperature: true,
      },
    }),
    db.signalEvent.findMany({
      where: {
        eventType: SignalType.MEETING_BOOKED,
        ...(hasExplicitDateRange
          ? {
              occurredAt: {
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
        accountId: true,
        occurredAt: true,
      },
      orderBy: {
        occurredAt: "asc",
      },
    }),
  ]);

  const meetingSignalsByAccount = new Map<string, Date[]>();
  for (const signal of meetingSignals) {
    if (!signal.accountId) {
      continue;
    }

    const existing = meetingSignalsByAccount.get(signal.accountId) ?? [];
    existing.push(signal.occurredAt);
    meetingSignalsByAccount.set(signal.accountId, existing);
  }

  const conversionByScoreBucket: DashboardConversionBucketContract[] =
    orderedBuckets.map((bucket) => {
      const bucketLeads = leads.filter(
        (lead) => getBucketByTemperature(lead.temperature) === bucket,
      );
      const convertedLeads = bucketLeads.filter((lead) => {
        const meetings = meetingSignalsByAccount.get(lead.accountId) ?? [];
        return meetings.some(
          (occurredAt) => occurredAt.getTime() >= lead.createdAt.getTime(),
        );
      });
      const responseTimes = bucketLeads
        .filter((lead) => lead.firstResponseAt !== null)
        .map((lead) => {
          const startAt = lead.routedAt ?? lead.createdAt;
          return Math.max(
            0,
            Math.round(
              (lead.firstResponseAt!.getTime() - startAt.getTime()) / 60000,
            ),
          );
        });

      return {
        bucket,
        label: getBucketLabel(bucket),
        leadCount: bucketLeads.length,
        convertedCount: convertedLeads.length,
        conversionRate:
          bucketLeads.length > 0
            ? Number((convertedLeads.length / bucketLeads.length).toFixed(4))
            : 0,
        averageSpeedToLeadMinutes:
          responseTimes.length > 0
            ? Math.round(
                responseTimes.reduce((sum, value) => sum + value, 0) /
                  responseTimes.length,
              )
            : null,
      };
    });

  const accountCounts: Record<ScoreBucket, number> = {
    urgent: 0,
    hot: 0,
    warm: 0,
    cold: 0,
  };
  const leadCounts: Record<ScoreBucket, number> = {
    urgent: 0,
    hot: 0,
    warm: 0,
    cold: 0,
  };

  for (const account of accounts) {
    accountCounts[getBucketByTemperature(account.temperature)] += 1;
  }

  for (const lead of leads) {
    leadCounts[getBucketByTemperature(lead.temperature)] += 1;
  }

  const scoreDistribution: DashboardScoreDistributionContract = {
    accounts: buildScoreDistribution(accountCounts, {
      urgent: "Accounts above the urgent score threshold in the seeded workspace.",
      hot: "Accounts with strong intent but below the urgent threshold.",
      warm: "Accounts showing moderate activity or fit.",
      cold: "Accounts with low current GTM pressure.",
    }),
    leads: buildScoreDistribution(leadCounts, {
      urgent: "Leads that should receive the fastest GTM response.",
      hot: "Leads with strong but not critical urgency.",
      warm: "Leads that are active but not yet priority-one.",
      cold: "Leads with lower current buying pressure.",
    }),
  };

  const sourceCounts = leads.reduce<Record<string, number>>((counts, lead) => {
    counts[lead.source] = (counts[lead.source] ?? 0) + 1;
    return counts;
  }, {});

  const leadVolumeBySource = toDistributionItems(
    Object.entries(sourceCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([source, value]) => ({
        key: source,
        label: source,
        description: `Seeded leads created from the ${source} source.`,
        value,
      })),
  );

  const accountsBySegment = new Map<
    Segment,
    {
      totalAccounts: number;
      engagedCount: number;
      salesReadyCount: number;
      customerCount: number;
    }
  >();

  for (const account of accounts) {
    const key = account.segment;
    const current = accountsBySegment.get(key) ?? {
      totalAccounts: 0,
      engagedCount: 0,
      salesReadyCount: 0,
      customerCount: 0,
    };

    current.totalAccounts += 1;
    if (account.lifecycleStage === LifecycleStage.ENGAGED) {
      current.engagedCount += 1;
    }
    if (account.lifecycleStage === LifecycleStage.SALES_READY) {
      current.salesReadyCount += 1;
    }
    if (account.lifecycleStage === LifecycleStage.CUSTOMER) {
      current.customerCount += 1;
    }

    accountsBySegment.set(key, current);
  }

  const pipelineStageConversionBySegment: DashboardPipelineStageConversionBySegmentContract[] =
    Array.from(accountsBySegment.entries())
      .map(([segment, value]) => ({
        segment,
        segmentLabel: formatEnumLabel(segment),
        totalAccounts: value.totalAccounts,
        engagedCount: value.engagedCount,
        salesReadyCount: value.salesReadyCount,
        customerCount: value.customerCount,
        conversionRate:
          value.totalAccounts > 0
            ? Number(
                (
                  (value.salesReadyCount + value.customerCount) /
                  value.totalAccounts
                ).toFixed(4),
              )
            : 0,
      }))
      .sort((left, right) => left.segmentLabel.localeCompare(right.segmentLabel));

  const benchmarkMetrics = await getDashboardBenchmarkMetrics(
    filters,
    conversionByScoreBucket,
  );

  return {
    asOfIso: window.referenceDate.toISOString(),
    demoMeta: buildDashboardDemoMeta(window.referenceDate),
    appliedFilters: buildAppliedFilters(filters, window),
    conversionByScoreBucket,
    scoreDistribution,
    leadVolumeBySource,
    pipelineStageConversionBySegment,
    benchmarkMetrics,
  };
}
