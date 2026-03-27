import { differenceInMinutes, format, startOfDay, subDays } from "date-fns";
import { SignalStatus, TaskStatus } from "@prisma/client";

import type {
  DashboardData,
  DashboardSummaryContract,
  HotAccountContract,
  RecentSignalContract,
  RoutingFeedItem,
} from "@/lib/contracts/data-access";
import { db } from "@/lib/db";
import { formatCompactNumber, formatEnumLabel, formatRelativeTime } from "@/lib/formatters/display";
import type { ModulePlaceholderConfig } from "@/lib/types";

type JsonRecord = Record<string, unknown>;

function getRelativeLabel(value: Date | null | undefined) {
  return value ? formatRelativeTime(value) : null;
}

function getRecommendedQueue(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const value = (payload as JsonRecord).recommendedQueue;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function mapRecentSignal(signal: {
  id: string;
  eventType: string;
  sourceSystem: string;
  status: string;
  occurredAt: Date;
  receivedAt: Date;
  normalizedPayloadJson: unknown;
  accountId: string | null;
  account: { name: string } | null;
  contactId: string | null;
  contact: { firstName: string; lastName: string } | null;
  leadId: string | null;
  lead: { source: string; temperature: string } | null;
}): RecentSignalContract {
  const recommendedQueue = getRecommendedQueue(signal.normalizedPayloadJson);
  const contactName = signal.contact
    ? `${signal.contact.firstName} ${signal.contact.lastName}`
    : null;
  const leadDisplay = signal.lead
    ? `${signal.lead.source} · ${formatEnumLabel(signal.lead.temperature)}`
    : null;

  return {
    id: signal.id,
    eventType: signal.eventType,
    eventTypeLabel: formatEnumLabel(signal.eventType),
    sourceSystem: signal.sourceSystem,
    status: signal.status,
    statusLabel: formatEnumLabel(signal.status),
    occurredAtIso: signal.occurredAt.toISOString(),
    occurredAtLabel: formatRelativeTime(signal.occurredAt),
    receivedAtIso: signal.receivedAt.toISOString(),
    receivedAtLabel: formatRelativeTime(signal.receivedAt),
    accountId: signal.accountId,
    accountName: signal.account?.name ?? null,
    contactId: signal.contactId,
    contactName,
    leadId: signal.leadId,
    leadDisplay,
    isUnmatched: signal.status === SignalStatus.UNMATCHED,
    ...(recommendedQueue ? { recommendedQueue } : {}),
  };
}

export async function getDashboardSummary(): Promise<DashboardSummaryContract> {
  const [signals, leads, routingDecisions, tasks, accountCount, hotAccountCount] = await Promise.all([
    db.signalEvent.findMany({
      select: {
        occurredAt: true,
        receivedAt: true,
        status: true,
      },
      orderBy: { occurredAt: "desc" },
    }),
    db.lead.findMany({
      select: {
        createdAt: true,
        firstResponseAt: true,
        slaDeadlineAt: true,
      },
    }),
    db.routingDecision.findMany({
      select: {
        createdAt: true,
      },
    }),
    db.task.findMany({
      select: {
        dueAt: true,
        status: true,
      },
    }),
    db.account.count(),
    db.account.count({
      where: {
        overallScore: {
          gte: 80,
        },
      },
    }),
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
      matched: dailySignals.filter((signal) => signal.status !== SignalStatus.UNMATCHED).length,
    };
  });

  const responseTimes = leads
    .filter((lead) => lead.firstResponseAt)
    .map((lead) => differenceInMinutes(lead.firstResponseAt!, lead.createdAt));

  const averageResponseMinutes =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
      : 0;

  const unmatchedSignals = signals.filter((signal) => signal.status === SignalStatus.UNMATCHED).length;
  const slaCompliant = leads.filter(
    (lead) => lead.firstResponseAt && lead.slaDeadlineAt && lead.firstResponseAt <= lead.slaDeadlineAt,
  ).length;
  const slaAtRisk = leads.filter(
    (lead) => !lead.firstResponseAt && lead.slaDeadlineAt && lead.slaDeadlineAt > now,
  ).length;
  const slaBreached = leads.length - slaCompliant - slaAtRisk;
  const openTasks = tasks.filter((task) => task.status !== TaskStatus.COMPLETED).length;
  const signalsReceivedToday = signals.filter((signal) => signal.receivedAt >= today).length;
  const routedToday = routingDecisions.filter((decision) => decision.createdAt >= today).length;
  const sevenDaySignals = signalVolume14d.slice(-7).reduce((sum, point) => sum + point.signals, 0);
  const hotAccountShare = accountCount > 0 ? Math.round((hotAccountCount / accountCount) * 100) : 0;

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
        change: `${slaCompliant} leads resolved within target`,
        tone: slaBreached > 4 ? "danger" : "warning",
      },
      {
        key: "averageSpeedToLead",
        label: "Avg. speed-to-lead",
        value: averageResponseMinutes ? `${Math.round(averageResponseMinutes / 60)}h` : "n/a",
        rawValue: averageResponseMinutes,
        change: `${openTasks} open tasks across active queues`,
        tone: "default",
      },
    ],
    signalVolume14d,
    slaHealth: [
      { label: "Within SLA", value: slaCompliant, tone: "positive" },
      { label: "At risk", value: slaAtRisk, tone: "warning" },
      { label: "Breached", value: slaBreached, tone: "danger" },
    ],
  };
}

export async function getHotAccounts(): Promise<HotAccountContract[]> {
  const accounts = await db.account.findMany({
    where: {
      overallScore: {
        gte: 80,
      },
    },
    select: {
      id: true,
      name: true,
      domain: true,
      segment: true,
      status: true,
      overallScore: true,
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
  const signals = await db.signalEvent.findMany({
    take: 8,
    orderBy: {
      occurredAt: "desc",
    },
    select: {
      id: true,
      eventType: true,
      sourceSystem: true,
      status: true,
      occurredAt: true,
      receivedAt: true,
      normalizedPayloadJson: true,
      accountId: true,
      account: {
        select: {
          name: true,
        },
      },
      contactId: true,
      contact: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      leadId: true,
      lead: {
        select: {
          source: true,
          temperature: true,
        },
      },
    },
  });

  return signals.map(mapRecentSignal);
}

async function getRecentRoutingFeed(): Promise<RoutingFeedItem[]> {
  const routingDecisions = await db.routingDecision.findMany({
    take: 6,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      decisionType: true,
      assignedQueue: true,
      explanation: true,
      createdAt: true,
      account: {
        select: {
          name: true,
        },
      },
      assignedOwner: {
        select: {
          name: true,
        },
      },
    },
  });

  return routingDecisions.map((decision) => ({
    id: decision.id,
    accountName: decision.account?.name ?? "Unmatched account",
    ownerName: decision.assignedOwner?.name ?? "Ops review",
    queue: decision.assignedQueue,
    decisionType: formatEnumLabel(decision.decisionType),
    createdAt: formatRelativeTime(decision.createdAt),
    explanation: decision.explanation,
  }));
}

async function getUnmatchedDashboardSignals() {
  const signals = await db.signalEvent.findMany({
    where: {
      status: SignalStatus.UNMATCHED,
    },
    take: 5,
    orderBy: {
      occurredAt: "desc",
    },
    select: {
      id: true,
      eventType: true,
      sourceSystem: true,
      receivedAt: true,
      normalizedPayloadJson: true,
    },
  });

  return signals.map((signal) => ({
    id: signal.id,
    eventType: formatEnumLabel(signal.eventType),
    sourceSystem: signal.sourceSystem,
    receivedAt: formatRelativeTime(signal.receivedAt),
    recommendation: getRecommendedQueue(signal.normalizedPayloadJson) ?? "Ops review",
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
    db.routingDecision.count(),
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
