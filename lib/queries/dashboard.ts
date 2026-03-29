import { format, startOfDay, subDays } from "date-fns";
import { SignalStatus, TaskStatus, Temperature } from "@prisma/client";

import { getDashboardTaskSummary } from "@/lib/actions";
import type {
  DashboardData,
  DashboardSummaryContract,
  HotAccountContract,
  RecentSignalContract,
  RoutingFeedItem,
} from "@/lib/contracts/data-access";
import {
  getRecentSignals as getRecentSignalFeed,
  getUnmatchedSignals,
} from "@/lib/data/signals";
import { getRecommendedQueue } from "@/lib/data/signals/presentation";
import { db } from "@/lib/db";
import { formatCompactNumber, formatEnumLabel, formatRelativeTime } from "@/lib/formatters/display";
import { withMissingTableFallback } from "@/lib/prisma-errors";
import { summarizeRoutingExplanation } from "@/lib/routing/explanation";
import { getRecentRoutingDecisions } from "@/lib/routing/service";
import { getDashboardSlaSummary } from "@/lib/sla";
import type { ModulePlaceholderConfig } from "@/lib/types";

function getRoutingExplanationSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Routing explanation unavailable.";
  }
  return summarizeRoutingExplanation(value as Parameters<typeof summarizeRoutingExplanation>[0]);
}

function getRelativeLabel(value: Date | null | undefined) {
  return value ? formatRelativeTime(value) : null;
}

function mapRecentSignal(signal: Awaited<ReturnType<typeof getRecentSignalFeed>>[number]): RecentSignalContract {
  return {
    id: signal.signalId,
    eventType: signal.eventType,
    eventTypeLabel: formatEnumLabel(signal.eventType),
    sourceSystem: formatEnumLabel(signal.sourceSystem),
    status: signal.status,
    statusLabel: formatEnumLabel(signal.status),
    occurredAtIso: signal.occurredAtIso,
    occurredAtLabel: formatRelativeTime(signal.occurredAtIso),
    receivedAtIso: signal.receivedAtIso,
    receivedAtLabel: formatRelativeTime(signal.receivedAtIso),
    accountId: signal.matchedEntities.account?.id ?? null,
    accountName: signal.matchedEntities.account?.name ?? null,
    contactId: signal.matchedEntities.contact?.id ?? null,
    contactName: signal.matchedEntities.contact?.name ?? null,
    leadId: signal.matchedEntities.lead?.id ?? null,
    leadDisplay: signal.matchedEntities.lead?.name ?? null,
    isUnmatched: signal.status === SignalStatus.UNMATCHED,
    ...(signal.status === SignalStatus.UNMATCHED
      ? { recommendedQueue: getRecommendedQueue(signal.reasonCodes) }
      : {}),
  };
}

export async function getDashboardSummary(): Promise<DashboardSummaryContract> {
  const [signals, routingDecisions, taskSummary, accountCount, hotAccountCount, slaSummary] = await Promise.all([
    db.signalEvent.findMany({
      select: {
        occurredAt: true,
        receivedAt: true,
        status: true,
      },
      orderBy: { occurredAt: "desc" },
    }),
    withMissingTableFallback(
      () =>
        db.routingDecision.findMany({
          select: {
            createdAt: true,
          },
        }),
      [],
    ),
    getDashboardTaskSummary(),
    db.account.count(),
    db.account.count({
      where: {
        temperature: {
          in: [Temperature.HOT, Temperature.URGENT],
        },
      },
    }),
    getDashboardSlaSummary(),
  ]);

  const now = new Date();
  const today = startOfDay(now);
  const signalVolume14d = Array.from({ length: 14 }, (_, index) => {
    const date = startOfDay(subDays(today, 13 - index));
    const key = format(date, "yyyy-MM-dd");
    const dailySignals = signals.filter(
      (signal) => format(startOfDay(signal.occurredAt), "yyyy-MM-dd") === key,
    );

    return {
      date: format(date, "MMM d"),
      signals: dailySignals.length,
      matched: dailySignals.filter((signal) => signal.status === SignalStatus.MATCHED).length,
    };
  });

  const unmatchedSignals = signals.filter((signal) => signal.status === SignalStatus.UNMATCHED).length;
  const withinSlaCount =
    slaSummary.leadMetrics.openTrackedCount -
    slaSummary.leadMetrics.overdueCount -
    slaSummary.leadMetrics.breachedCount;
  const slaBreached = slaSummary.leadMetrics.breachedCount;
  const signalsReceivedToday = signals.filter((signal) => signal.receivedAt >= today).length;
  const routedToday = routingDecisions.filter((decision) => decision.createdAt >= today).length;
  const sevenDaySignals = signalVolume14d.slice(-7).reduce((sum, point) => sum + point.signals, 0);
  const hotAccountShare = accountCount > 0 ? Math.round((hotAccountCount / accountCount) * 100) : 0;
  const averageResponseMinutes = slaSummary.leadMetrics.averageSpeedToLeadMinutes ?? 0;
  const attainmentRateLabel =
    slaSummary.leadMetrics.attainmentRate === null
      ? "No resolved tracked leads yet"
      : `${Math.round(slaSummary.leadMetrics.attainmentRate * 100)}% attainment on resolved tracked leads`;

  return {
    asOfIso: now.toISOString(),
    kpis: [
      {
        key: "signalsReceivedToday",
        label: "Signals received today",
        value: formatCompactNumber(signalsReceivedToday),
        rawValue: signalsReceivedToday,
        change: `${sevenDaySignals} in the last 7 days`,
        tone: "default",
      },
      {
        key: "routedToday",
        label: "Routed today",
        value: formatCompactNumber(routedToday),
        rawValue: routedToday,
        change: `${formatCompactNumber(routingDecisions.length)} recent routing decisions`,
        tone: "positive",
      },
      {
        key: "unmatchedSignals",
        label: "Unmatched signals",
        value: formatCompactNumber(unmatchedSignals),
        rawValue: unmatchedSignals,
        change: "Ops review queue needs manual resolution",
        tone: unmatchedSignals > 2 ? "warning" : "default",
      },
      {
        key: "hotAccounts",
        label: "Hot accounts",
        value: formatCompactNumber(hotAccountCount),
        rawValue: hotAccountCount,
        change: `${hotAccountShare}% of the tracked portfolio`,
        tone: "positive",
      },
      {
        key: "slaBreaches",
        label: "SLA breaches",
        value: formatCompactNumber(slaBreached),
        rawValue: slaBreached,
        change: attainmentRateLabel,
        tone: slaBreached > 4 ? "danger" : "warning",
      },
      {
        key: "averageSpeedToLead",
        label: "Avg. speed-to-lead",
        value: averageResponseMinutes ? `${Math.round(averageResponseMinutes / 60)}h` : "n/a",
        rawValue: averageResponseMinutes,
        change: `${taskSummary.openCount} open tasks across active queues`,
        tone: "default",
      },
    ],
    signalVolume14d,
    slaHealth: [
      { label: "Within SLA", value: Math.max(0, withinSlaCount), tone: "positive" },
      { label: "At risk", value: slaSummary.leadMetrics.overdueCount, tone: "warning" },
      { label: "Breached", value: slaBreached, tone: "danger" },
    ],
    slaSummary,
  };
}

export async function getHotAccounts(): Promise<HotAccountContract[]> {
  const accounts = await db.account.findMany({
    where: {
      temperature: {
        in: [Temperature.HOT, Temperature.URGENT],
      },
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
      signals: {
        take: 1,
        orderBy: {
          occurredAt: "desc",
        },
        select: {
          occurredAt: true,
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
      lastSignalAtLabel: getRelativeLabel(account.signals[0]?.occurredAt),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftSignalAt = left.lastSignalAtIso ? new Date(left.lastSignalAtIso).getTime() : 0;
      const rightSignalAt = right.lastSignalAtIso ? new Date(right.lastSignalAtIso).getTime() : 0;

      if (rightSignalAt !== leftSignalAt) {
        return rightSignalAt - leftSignalAt;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, 6);
}

export async function getRecentSignals(): Promise<RecentSignalContract[]> {
  const signals = await getRecentSignalFeed(8);
  return signals.map(mapRecentSignal);
}

async function getRecentRoutingFeed(): Promise<RoutingFeedItem[]> {
  const routingDecisions = await withMissingTableFallback(() => getRecentRoutingDecisions(6), []);
  const accountIds = routingDecisions
    .map((decision) => decision.accountId)
    .filter((accountId): accountId is string => Boolean(accountId));
  const accounts = await db.account.findMany({
    where: {
      id: {
        in: accountIds,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  return routingDecisions.map((decision) => ({
    id: decision.id,
    accountName: decision.accountId ? accountNames.get(decision.accountId) ?? "Unknown account" : "Unmatched account",
    ownerName: decision.assignedOwner?.name ?? "Ops review",
    queue: decision.assignedQueue,
    decisionType: formatEnumLabel(decision.decisionType),
    createdAt: formatRelativeTime(decision.createdAtIso),
    explanation: getRoutingExplanationSummary(decision.explanation),
  }));
}

async function getUnmatchedDashboardSignals() {
  const signals = await getUnmatchedSignals({ limit: 5 });

  return signals.map((signal) => ({
    id: signal.signalId,
    eventType: signal.eventTypeLabel,
    sourceSystem: signal.sourceSystemLabel,
    receivedAt: formatRelativeTime(signal.receivedAtIso),
    recommendation: signal.recommendedQueue,
  }));
}

export async function getDashboardData(): Promise<DashboardData> {
  const [summary, hotAccounts, unmatchedSignals, recentRoutingDecisions] = await Promise.all([
    getDashboardSummary(),
    getHotAccounts(),
    getUnmatchedDashboardSignals(),
    getRecentRoutingFeed(),
  ]);

  return {
    kpis: summary.kpis.map(({ label, value, change, tone }) => ({
      label,
      value,
      change,
      tone,
    })),
    signalVolume14d: summary.signalVolume14d,
    slaHealth: summary.slaHealth,
    hotAccounts: hotAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      owner: account.ownerName ?? "Unassigned",
      segment: account.segmentLabel,
      score: account.score,
      lastSignalAt: account.lastSignalAtLabel ?? "No recent signals",
    })),
    unmatchedSignals,
    recentRoutingDecisions,
  };
}

export async function getWorkspaceTeasers(): Promise<Record<string, ModulePlaceholderConfig>> {
  const [leadCount, openTaskCount, signalCount, routingCount, activeRuleCount] = await Promise.all([
    db.lead.count(),
    db.task.count({ where: { status: { not: TaskStatus.COMPLETED } } }),
    db.signalEvent.count(),
    withMissingTableFallback(() => db.routingDecision.count(), 0),
    db.ruleConfig.count({ where: { isActive: true } }),
  ]);

  return {
    leads: {
      title: "Leads Queue",
      eyebrow: "Module placeholder",
      description:
        "The next build-out will focus on active lead queues, SLA countdowns, and working ownership states.",
      capabilities: [
        "Hot lead queue with SLA urgency indicators",
        "Unassigned and recently routed lead views",
        "Queue-level filters by owner, source, and temperature",
      ],
      teaserLabel: "Seeded leads",
      teaserValue: formatCompactNumber(leadCount),
      secondaryLabel: "Open tasks linked",
      secondaryValue: formatCompactNumber(openTaskCount),
    },
    tasks: {
      title: "Tasks",
      eyebrow: "Module placeholder",
      description:
        "Task orchestration will surface rep action queues, escalations, and follow-up compliance signals.",
      capabilities: [
        "Due-soon and overdue task queues",
        "Owner-level workload balancing",
        "Readiness context pulled from account and lead signals",
      ],
      teaserLabel: "Open actions",
      teaserValue: formatCompactNumber(openTaskCount),
      secondaryLabel: "Active leads",
      secondaryValue: formatCompactNumber(leadCount),
    },
    signals: {
      title: "Signals",
      eyebrow: "Module placeholder",
      description:
        "The signals module will become the operator intake layer for web, product, marketing, and sales events.",
      capabilities: [
        "Unified signal intake with source filters",
        "Unmatched queue review and resolution",
        "Signal-level normalization and confidence inspection",
      ],
      teaserLabel: "Seeded signals",
      teaserValue: formatCompactNumber(signalCount),
      secondaryLabel: "Routing decisions",
      secondaryValue: formatCompactNumber(routingCount),
    },
    "routing-simulator": {
      title: "Routing Simulator",
      eyebrow: "Module placeholder",
      description:
        "The routing simulator will let RevOps teams model assignment logic before operational changes go live.",
      capabilities: [
        "What-if scenarios by geography, segment, and named-account status",
        "Reason-code inspection for routing precedence",
        "Queue and owner simulation against live policy versions",
      ],
      teaserLabel: "Recent routes",
      teaserValue: formatCompactNumber(routingCount),
      secondaryLabel: "Active policies",
      secondaryValue: formatCompactNumber(activeRuleCount),
    },
    settings: {
      title: "Settings",
      eyebrow: "Module placeholder",
      description:
        "Settings will evolve into a read-only rules console for active routing and scoring policy versions.",
      capabilities: [
        "Scoring weight visibility and version history",
        "Routing policy precedence inspection",
        "Workspace defaults for SLA targets and review queues",
      ],
      teaserLabel: "Active rules",
      teaserValue: formatCompactNumber(activeRuleCount),
      secondaryLabel: "Signals in system",
      secondaryValue: formatCompactNumber(signalCount),
    },
  };
}
