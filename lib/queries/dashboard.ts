import { TaskStatus } from "@prisma/client";

import {
  getDashboardData as getCanonicalDashboardData,
  getDashboardSummary as getCanonicalDashboardSummary,
  getHotAccounts as getCanonicalHotAccounts,
} from "@/lib/data/dashboard";
import type {
  DashboardData,
  DashboardFiltersInput,
  DashboardSummaryContract,
  HotAccountContract,
  RecentSignalContract,
} from "@/lib/contracts/dashboard";
import {
  getRecentSignals as getRecentSignalFeed,
} from "@/lib/data/signals";
import { getRecommendedQueue } from "@/lib/data/signals/presentation";
import { db } from "@/lib/db";
import {
  formatCompactNumber,
  formatEnumLabel,
  formatRelativeTime,
} from "@/lib/formatters/display";
import { withMissingTableFallback } from "@/lib/prisma-errors";
import type { ModulePlaceholderConfig } from "@/lib/types";

function mapRecentSignal(
  signal: Awaited<ReturnType<typeof getRecentSignalFeed>>[number],
): RecentSignalContract {
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
    isUnmatched: signal.status === "UNMATCHED",
    ...(signal.status === "UNMATCHED"
      ? { recommendedQueue: getRecommendedQueue(signal.reasonCodes) }
      : {}),
  };
}

export async function getDashboardSummary(
  filters: DashboardFiltersInput = {},
): Promise<DashboardSummaryContract> {
  return getCanonicalDashboardSummary(filters);
}

export async function getHotAccounts(
  filters: DashboardFiltersInput = {},
): Promise<HotAccountContract[]> {
  return getCanonicalHotAccounts(filters);
}

export async function getRecentSignals(): Promise<RecentSignalContract[]> {
  const signals = await getRecentSignalFeed(8);
  return signals.map(mapRecentSignal);
}

export async function getDashboardData(
  filters: DashboardFiltersInput = {},
): Promise<DashboardData> {
  return getCanonicalDashboardData(filters);
}

export async function getWorkspaceTeasers(): Promise<
  Record<string, ModulePlaceholderConfig>
> {
  const [leadCount, openTaskCount, signalCount, routingCount, activeRuleCount] =
    await Promise.all([
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
