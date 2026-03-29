import {
  Geography,
  LifecycleStage,
  ScoreEntityType,
  Segment,
  Temperature,
  type Prisma,
} from "@prisma/client";

import { getTasksForAccount } from "@/lib/actions";
import { priorityValueByCode } from "@/lib/contracts/actions";
import type {
  AccountDetailContract,
  AccountDetailView,
  AccountsFilterState,
  AccountsFiltersInput,
  AccountsListContract,
  AccountsListData,
  SelectOption,
} from "@/lib/contracts/data-access";
import { getAccountTimeline } from "@/lib/data/signals";
import { getContactDisplayName } from "@/lib/data/signals/presentation";
import { db } from "@/lib/db";
import {
  formatCompactNumber,
  formatEnumLabel,
  formatRelativeTime,
  getScoreBucket,
} from "@/lib/formatters/display";
import { getAuditLogForEntity } from "@/lib/audit/queries";
import { getAccountScoreBreakdown, getScoreHistoryForEntity } from "@/lib/scoring";
import { mapLeadSlaSnapshot } from "@/lib/sla";

const SEGMENTS = Object.values(Segment);
const GEOGRAPHIES = Object.values(Geography);
const STAGES = Object.values(LifecycleStage);
const ACCOUNT_OWNER_ROLES = [
  "Account Executive",
  "Strategic AE",
  "Enterprise AE",
  "SDR",
  "SDR Manager",
] as const;
const SCORE_BUCKET_OPTIONS: SelectOption[] = [
  { value: "urgent", label: "Urgent" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

type SearchParamFilters = Record<string, string | string[] | undefined>;

function getFilterValue(
  filters: AccountsFiltersInput | SearchParamFilters | undefined,
  key: keyof AccountsFilterState,
) {
  const entry = filters?.[key];

  if (Array.isArray(entry)) {
    return entry[0] ?? "";
  }

  return entry ?? "";
}

function normalizeFilters(
  filters: AccountsFiltersInput | SearchParamFilters | undefined,
): AccountsFilterState {
  return {
    q: getFilterValue(filters, "q"),
    segment: getFilterValue(filters, "segment"),
    geography: getFilterValue(filters, "geography"),
    owner: getFilterValue(filters, "owner"),
    stage: getFilterValue(filters, "stage"),
    scoreBucket: getFilterValue(filters, "scoreBucket"),
  };
}

function buildWhere(filters: AccountsFilterState): Prisma.AccountWhereInput {
  const where: Prisma.AccountWhereInput = {};

  if (filters.q) {
    where.OR = [{ name: { contains: filters.q } }, { domain: { contains: filters.q } }];
  }

  if (SEGMENTS.includes(filters.segment as Segment)) {
    where.segment = filters.segment as Segment;
  }

  if (GEOGRAPHIES.includes(filters.geography as Geography)) {
    where.geography = filters.geography as Geography;
  }

  if (STAGES.includes(filters.stage as LifecycleStage)) {
    where.lifecycleStage = filters.stage as LifecycleStage;
  }

  if (filters.owner) {
    where.namedOwnerId = filters.owner;
  }

  if (filters.scoreBucket === "urgent") {
    where.temperature = Temperature.URGENT;
  } else if (filters.scoreBucket === "hot") {
    where.temperature = Temperature.HOT;
  } else if (filters.scoreBucket === "warm") {
    where.temperature = Temperature.WARM;
  } else if (filters.scoreBucket === "cold") {
    where.temperature = Temperature.COLD;
  }

  return where;
}

function uniqueOptions(values: SelectOption[]) {
  return values.filter((option, index, array) => {
    return array.findIndex((entry) => entry.value === option.value) === index;
  });
}

function getRelativeLabel(value: Date | null | undefined) {
  return value ? formatRelativeTime(value) : null;
}

function buildAccountSummary(account: {
  name: string;
  overallScore: number;
  signals: { eventType: string }[];
  tasks: { title: string }[];
}) {
  const signalSummary = account.signals
    .slice(0, 2)
    .map((signal) => formatEnumLabel(signal.eventType))
    .join(" and ");
  const nextTask = account.tasks[0]?.title ?? "Review account for the next-best action";

  return `${account.name} is currently ${getScoreBucket(account.overallScore).toLowerCase()} with a score of ${account.overallScore}. Recent activity includes ${signalSummary || "steady monitoring signals"}, and the next operator recommendation is to ${nextTask.toLowerCase()}.`;
}

export async function getAccounts(
  filtersInput?: AccountsFiltersInput | SearchParamFilters,
): Promise<AccountsListContract> {
  const filters = normalizeFilters(filtersInput);
  const where = buildWhere(filters);

  const [accounts, owners] = await Promise.all([
    db.account.findMany({
      where,
      orderBy: [{ overallScore: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        domain: true,
        segment: true,
        geography: true,
        lifecycleStage: true,
        overallScore: true,
        temperature: true,
        status: true,
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
    }),
    db.user.findMany({
      where: {
        role: {
          in: [...ACCOUNT_OWNER_ROLES],
        },
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  const rows = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    domain: account.domain,
    segment: account.segment,
    segmentLabel: formatEnumLabel(account.segment),
    ownerId: account.namedOwnerId,
    ownerName: account.namedOwner?.name ?? null,
    geography: account.geography,
    geographyLabel: formatEnumLabel(account.geography),
    stage: account.lifecycleStage,
    stageLabel: formatEnumLabel(account.lifecycleStage),
    score: account.overallScore,
    temperature: account.temperature,
    temperatureLabel: formatEnumLabel(account.temperature),
    status: account.status,
    statusLabel: formatEnumLabel(account.status),
    scoringVersion: account.scoringVersion,
    scoreLastComputedAtIso: account.scoreLastComputedAt?.toISOString() ?? null,
    lastSignalAtIso: account.signals[0]?.occurredAt.toISOString() ?? null,
    lastSignalAtLabel: getRelativeLabel(account.signals[0]?.occurredAt),
  }));

  const averageScore =
    rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0;

  return {
    filters,
    rows,
    stats: {
      totalAccounts: rows.length,
      averageScore,
      hotAccounts: rows.filter(
        (row) => row.temperature === Temperature.HOT || row.temperature === Temperature.URGENT,
      ).length,
      strategicAccounts: rows.filter((row) => row.segment === Segment.STRATEGIC).length,
    },
    options: {
      owners: uniqueOptions(owners.map((owner) => ({ label: owner.name, value: owner.id }))),
      segments: SEGMENTS.map((segment) => ({
        label: formatEnumLabel(segment),
        value: segment,
      })),
      geographies: GEOGRAPHIES.map((geography) => ({
        label: formatEnumLabel(geography),
        value: geography,
      })),
      stages: STAGES.map((stage) => ({
        label: formatEnumLabel(stage),
        value: stage,
      })),
      scoreBuckets: SCORE_BUCKET_OPTIONS,
    },
  };
}

export async function getAccountById(id: string): Promise<AccountDetailContract | null> {
  const now = new Date();
  const [account, timeline, score, scoreHistory, openTaskQueue, auditLog] = await Promise.all([
    db.account.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        domain: true,
        segment: true,
        geography: true,
        lifecycleStage: true,
        status: true,
        overallScore: true,
        fitScore: true,
        temperature: true,
        industry: true,
        accountTier: true,
        employeeCount: true,
        annualRevenueBand: true,
        scoreLastComputedAt: true,
        scoringVersion: true,
        namedOwner: {
          select: {
            id: true,
            name: true,
            role: true,
            email: true,
            title: true,
            geography: true,
            team: true,
            avatarColor: true,
          },
        },
        contacts: {
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            title: true,
            department: true,
            seniority: true,
            personaType: true,
            email: true,
            phone: true,
          },
        },
        leads: {
          orderBy: [{ score: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            source: true,
            inboundType: true,
            status: true,
            temperature: true,
            score: true,
            fitScore: true,
            scoringVersion: true,
            scoreLastComputedAt: true,
            slaPolicyKey: true,
            slaPolicyVersion: true,
            slaTargetMinutes: true,
            slaDeadlineAt: true,
            slaBreachedAt: true,
            firstResponseAt: true,
            routedAt: true,
            contactId: true,
            contact: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            currentOwnerId: true,
            currentOwner: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    getAccountTimeline(id, { limit: 8 }),
    getAccountScoreBreakdown(id),
    getScoreHistoryForEntity(ScoreEntityType.ACCOUNT, id, { limit: 8 }),
    getTasksForAccount(id),
    getAuditLogForEntity("account", id, { limit: 8 }),
  ]);

  if (!account || !score) {
    return null;
  }

  return {
    metadata: {
      id: account.id,
      name: account.name,
      domain: account.domain,
      industry: account.industry,
      segment: account.segment,
      segmentLabel: formatEnumLabel(account.segment),
      geography: account.geography,
      geographyLabel: formatEnumLabel(account.geography),
      lifecycleStage: account.lifecycleStage,
      lifecycleStageLabel: formatEnumLabel(account.lifecycleStage),
      status: account.status,
      statusLabel: formatEnumLabel(account.status),
      tier: account.accountTier,
      tierLabel: formatEnumLabel(account.accountTier),
      employeeCount: account.employeeCount,
      employeeCountLabel: formatCompactNumber(account.employeeCount),
      annualRevenueBand: account.annualRevenueBand,
      overallScore: account.overallScore,
      fitScore: account.fitScore,
      temperature: account.temperature,
      temperatureLabel: formatEnumLabel(account.temperature),
      scoreLastComputedAtIso: account.scoreLastComputedAt?.toISOString() ?? null,
      scoringVersion: account.scoringVersion,
    },
    namedOwner: account.namedOwner
      ? {
          id: account.namedOwner.id,
          name: account.namedOwner.name,
          role: account.namedOwner.role,
          email: account.namedOwner.email,
          title: account.namedOwner.title,
          geography: account.namedOwner.geography,
          geographyLabel: formatEnumLabel(account.namedOwner.geography),
          team: account.namedOwner.team,
          avatarColor: account.namedOwner.avatarColor,
        }
      : null,
    contacts: account.contacts.map((contact) => ({
      id: contact.id,
      fullName: getContactDisplayName(contact.firstName, contact.lastName, contact.email),
      title: contact.title,
      department: contact.department,
      seniority: contact.seniority,
      personaType: contact.personaType,
      email: contact.email,
      phone: contact.phone,
    })),
    relatedLeads: account.leads.map((lead) => ({
      id: lead.id,
      source: lead.source,
      inboundType: lead.inboundType,
      status: lead.status,
      statusLabel: formatEnumLabel(lead.status),
      temperature: lead.temperature,
      temperatureLabel: formatEnumLabel(lead.temperature),
      score: lead.score,
      fitScore: lead.fitScore,
      scoringVersion: lead.scoringVersion,
      scoreLastComputedAtIso: lead.scoreLastComputedAt?.toISOString() ?? null,
      contactId: lead.contactId,
      contactName: lead.contact
        ? getContactDisplayName(lead.contact.firstName, lead.contact.lastName, null)
        : null,
      currentOwnerId: lead.currentOwnerId,
      currentOwnerName: lead.currentOwner?.name ?? null,
      slaDeadlineAtIso: lead.slaDeadlineAt?.toISOString() ?? null,
      slaDeadlineAtLabel: getRelativeLabel(lead.slaDeadlineAt),
      firstResponseAtIso: lead.firstResponseAt?.toISOString() ?? null,
      firstResponseAtLabel: getRelativeLabel(lead.firstResponseAt),
      routedAtIso: lead.routedAt?.toISOString() ?? null,
      routedAtLabel: getRelativeLabel(lead.routedAt),
      sla: mapLeadSlaSnapshot(
        {
          slaPolicyKey: lead.slaPolicyKey,
          slaPolicyVersion: lead.slaPolicyVersion,
          slaTargetMinutes: lead.slaTargetMinutes,
          slaDeadlineAt: lead.slaDeadlineAt,
          slaBreachedAt: lead.slaBreachedAt,
          firstResponseAt: lead.firstResponseAt,
          routedAt: lead.routedAt,
        },
        now,
      ),
    })),
    recentSignals: timeline.map((signal) => {
      return {
        id: signal.signalId,
        eventType: signal.eventType,
        eventTypeLabel: signal.eventTypeLabel,
        sourceSystem: signal.sourceSystemLabel,
        status: signal.status,
        statusLabel: signal.statusLabel,
        occurredAtIso: signal.occurredAtIso,
        occurredAtLabel: formatRelativeTime(signal.occurredAtIso),
        receivedAtIso: signal.receivedAtIso,
        receivedAtLabel: formatRelativeTime(signal.receivedAtIso),
        accountId: account.id,
        accountName: account.name,
        contactId: signal.associatedContact?.id ?? null,
        contactName: signal.associatedContact?.name ?? null,
        leadId: null,
        leadDisplay: null,
        isUnmatched: signal.status === "UNMATCHED",
        description: signal.displaySubtitle,
      };
    }),
    openTasks: openTaskQueue.slice(0, 6).map((task) => ({
      id: task.id,
      taskType: task.taskType,
      actionType: task.actionType,
      actionCategory: task.actionCategory,
      taskTypeLabel: formatEnumLabel(task.taskType),
      priority: priorityValueByCode[task.priorityCode],
      priorityCode: task.priorityCode,
      priorityLabel: task.priorityLabel,
      status: task.status,
      statusLabel: formatEnumLabel(task.status),
      title: task.title,
      description: task.description,
      dueAtIso: task.dueAtIso,
      dueAtLabel: formatRelativeTime(task.dueAtIso),
      ownerId: task.owner?.id ?? null,
      ownerName: task.owner?.name ?? null,
      reasonSummary: task.reasonSummary,
      explanation: task.explanation,
      isOverdue: task.isOverdue,
      sla: task.sla,
    })),
    score,
    scoreHistory: scoreHistory.rows,
    scoreBreakdown: score.componentBreakdown.map((component) => ({
      id: `${account.id}_${component.key}`,
      scoreComponent: component.key,
      scoreComponentLabel: component.label,
      value: component.score,
      reasonCode: component.reasonCodes[0] ?? "none",
    })),
    auditLog,
    summary: buildAccountSummary({
      name: account.name,
      overallScore: account.overallScore,
      signals: timeline,
      tasks: openTaskQueue,
    }),
  };
}

export async function getAccountsListData(
  rawSearchParams: SearchParamFilters,
): Promise<AccountsListData> {
  const data = await getAccounts(rawSearchParams);

  return {
    filters: data.filters,
    rows: data.rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      segment: row.segmentLabel,
      owner: row.ownerName ?? "Unassigned",
      geography: row.geographyLabel,
      stage: row.stageLabel,
      score: row.score,
      status: row.statusLabel,
      lastSignalAt: row.lastSignalAtLabel ?? "No recent signals",
    })),
    stats: data.stats,
    options: {
      owners: data.options.owners,
      segments: data.options.segments,
      geographies: data.options.geographies,
      stages: data.options.stages,
      scoreBuckets: data.options.scoreBuckets,
    },
  };
}

export async function getAccountDetail(id: string): Promise<AccountDetailView | null> {
  const account = await getAccountById(id);

  if (!account) {
    return null;
  }

  return {
    id: account.metadata.id,
    name: account.metadata.name,
    domain: account.metadata.domain,
    owner: account.namedOwner?.name ?? "Unassigned",
    ownerRole: account.namedOwner?.role ?? "Revenue Operations",
    score: account.metadata.overallScore,
    fitScore: account.metadata.fitScore,
    segment: account.metadata.segmentLabel,
    geography: account.metadata.geographyLabel,
    status: account.metadata.statusLabel,
    lifecycleStage: account.metadata.lifecycleStageLabel,
    industry: account.metadata.industry,
    tier: account.metadata.tierLabel,
    employeeCount: account.metadata.employeeCountLabel,
    revenueBand: account.metadata.annualRevenueBand,
    contacts: account.contacts.map((contact) => ({
      id: contact.id,
      name: contact.fullName,
      title: contact.title,
      department: contact.department,
      email: contact.email,
      phone: contact.phone,
    })),
    openTasks: account.openTasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      dueAt: task.dueAtLabel,
      priority: task.priorityLabel,
      status: task.statusLabel,
      owner: task.ownerName ?? "Unassigned",
    })),
    timeline: account.recentSignals.map((signal) => ({
      id: signal.id,
      title: signal.eventTypeLabel,
      description: signal.description,
      sourceSystem: signal.sourceSystem,
      occurredAt: signal.occurredAtLabel,
      status: signal.statusLabel,
    })),
    scoreBreakdown: account.scoreBreakdown.map((item) => ({
      id: item.id,
      label: item.scoreComponentLabel,
      value: item.value,
      reasonCode: item.reasonCode,
    })),
    auditLog: account.auditLog.map((entry) => ({
      id: entry.id,
      title: entry.action,
      explanation: entry.explanation,
      createdAt: entry.timestampLabel,
      actorName: entry.actor.name,
    })),
    summary: account.summary,
  };
}
