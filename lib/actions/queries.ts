import {
  ActionCategory,
  ActionType,
  TaskPriority,
  TaskStatus,
  type Prisma,
} from "@prisma/client";

import type {
  ActionEntityType,
  ActionExplanationContract,
  ActionRecommendationContract,
  ActionRecommendationsListContract,
  ActionReasonCode,
  ActionReasonSummaryContract,
  ActionOwnerSummaryContract,
  DashboardTaskSummaryContract,
  LinkedEntitySummaryContract,
  TaskFiltersInput,
  TaskPriorityCode,
  TaskQueueContract,
  TaskQueueItemContract,
} from "@/lib/contracts/actions";
import {
  actionReasonCodeValues,
  priorityCodeByValue,
  priorityLabelByCode,
} from "@/lib/contracts/actions";
import { db } from "@/lib/db";
import { mapTaskSlaSnapshot } from "@/lib/sla";

import { buildActionReasonDetails } from "./reason-codes";

const actionReasonCodeSet = new Set<ActionReasonCode>(actionReasonCodeValues);
const priorityRank: Record<TaskPriority, number> = {
  URGENT: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

function parseActionReasonCodes(value: unknown): ActionReasonCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is ActionReasonCode =>
      typeof item === "string" && actionReasonCodeSet.has(item as ActionReasonCode),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseExplanation(
  value: unknown,
  fallback: Omit<ActionExplanationContract, "reasonDetails">,
): ActionExplanationContract {
  if (!isRecord(value)) {
    return {
      ...fallback,
      reasonDetails: buildActionReasonDetails(fallback.reasonCodes),
    };
  }

  const reasonCodes = parseActionReasonCodes(value.reasonCodes);
  const trigger = isRecord(value.trigger) ? value.trigger : {};
  const context = isRecord(value.context) ? value.context : {};

  return {
    summary:
      typeof value.summary === "string" ? value.summary : fallback.summary,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : fallback.reasonCodes,
    reasonDetails: buildActionReasonDetails(
      reasonCodes.length > 0 ? reasonCodes : fallback.reasonCodes,
    ),
    trigger: {
      signalId:
        typeof trigger.signalId === "string" ? trigger.signalId : fallback.trigger.signalId,
      routingDecisionId:
        typeof trigger.routingDecisionId === "string"
          ? trigger.routingDecisionId
          : fallback.trigger.routingDecisionId,
      scoreHistoryId:
        typeof trigger.scoreHistoryId === "string"
          ? trigger.scoreHistoryId
          : fallback.trigger.scoreHistoryId,
    },
    context: {
      entityType:
        context.entityType === "account" ? "account" : fallback.context.entityType,
      entityId:
        typeof context.entityId === "string" ? context.entityId : fallback.context.entityId,
      accountId:
        typeof context.accountId === "string" ? context.accountId : fallback.context.accountId,
      leadId:
        typeof context.leadId === "string" ? context.leadId : fallback.context.leadId,
      temperature:
        typeof context.temperature === "string"
          ? context.temperature
          : fallback.context.temperature,
      inboundType:
        typeof context.inboundType === "string"
          ? context.inboundType
          : fallback.context.inboundType,
      lifecycleStage:
        typeof context.lifecycleStage === "string"
          ? context.lifecycleStage
          : fallback.context.lifecycleStage,
      assignedQueue:
        typeof context.assignedQueue === "string"
          ? context.assignedQueue
          : fallback.context.assignedQueue,
      isStrategic:
        typeof context.isStrategic === "boolean"
          ? context.isStrategic
          : fallback.context.isStrategic,
      activeAccount:
        typeof context.activeAccount === "boolean"
          ? context.activeAccount
          : fallback.context.activeAccount,
    },
    dueAtIso:
      typeof value.dueAtIso === "string" ? value.dueAtIso : fallback.dueAtIso,
    dedupeKey:
      typeof value.dedupeKey === "string" ? value.dedupeKey : fallback.dedupeKey,
  };
}

function buildOwnerSummary(owner: {
  id: string;
  name: string;
  role: string;
  team: string;
} | null): ActionOwnerSummaryContract | null {
  if (!owner) {
    return null;
  }

  return {
    id: owner.id,
    name: owner.name,
    role: owner.role,
    team: owner.team,
  };
}

function buildLinkedEntitySummary(input: {
  account:
    | {
        id: string;
        name: string;
      }
    | null;
  lead:
    | {
        id: string;
        contact:
          | {
              firstName: string;
              lastName: string;
            }
          | null;
      }
    | null;
}): LinkedEntitySummaryContract {
  if (input.lead) {
    const leadLabel = input.lead.contact
      ? `${input.lead.contact.firstName} ${input.lead.contact.lastName}`
      : input.lead.id;

    return {
      entityType: "lead",
      entityId: input.lead.id,
      accountId: input.account?.id ?? null,
      accountName: input.account?.name ?? null,
      leadId: input.lead.id,
      leadLabel,
      contactId: null,
      contactName: input.lead.contact ? leadLabel : null,
    };
  }

  return {
    entityType: "account",
    entityId: input.account?.id ?? "",
    accountId: input.account?.id ?? null,
    accountName: input.account?.name ?? null,
    leadId: null,
    leadLabel: null,
    contactId: null,
    contactName: null,
  };
}

function buildReasonSummary(
  explanation: ActionExplanationContract,
): ActionReasonSummaryContract {
  const primaryCode = explanation.reasonCodes[0] ?? "manual_task_created";
  const primaryDetail = buildActionReasonDetails([primaryCode])[0]!;

  return {
    primaryCode,
    primaryLabel: primaryDetail.label,
    summary: explanation.summary,
    relatedReasonCodes: explanation.reasonCodes,
  };
}

function buildWhere(filters: TaskFiltersInput): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};

  if (filters.ownerId) {
    where.ownerId = filters.ownerId;
  }

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    where.status = { in: statuses };
  } else {
    where.status = {
      in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
    };
  }

  if (filters.priorityCode) {
    const priorityCodes = Array.isArray(filters.priorityCode)
      ? filters.priorityCode
      : [filters.priorityCode];
    const priorities = priorityCodes.map((code) => {
      switch (code) {
        case "P1":
          return TaskPriority.URGENT;
        case "P2":
          return TaskPriority.HIGH;
        case "P3":
          return TaskPriority.MEDIUM;
        case "P4":
          return TaskPriority.LOW;
      }
    });

    where.priority = { in: priorities };
  }

  if (filters.entityType === "lead" && filters.entityId) {
    where.leadId = filters.entityId;
  } else if (filters.entityType === "account" && filters.entityId) {
    where.accountId = filters.entityId;
  }

  if (filters.tracked !== undefined) {
    where.isSlaTracked = filters.tracked;
  }

  if (filters.overdue !== undefined) {
    const now = new Date();
    where.dueAt = filters.overdue ? { lt: now } : { gte: now };
  }

  return where;
}

function mapTaskRow(
  row: {
    id: string;
    title: string;
    description: string;
    taskType: import("@prisma/client").TaskType;
    actionType: ActionType;
    actionCategory: ActionCategory;
    priority: TaskPriority;
    status: TaskStatus;
    dueAt: Date;
    createdAt: Date;
    completedAt: Date | null;
    isSlaTracked: boolean;
    slaPolicyKey: string | null;
    slaPolicyVersion: string | null;
    slaTargetMinutes: number | null;
    slaBreachedAt: Date | null;
    explanationJson: unknown;
    sourceReasonCodesJson: unknown;
    dedupeKey: string | null;
    triggerSignalId: string | null;
    triggerRoutingDecisionId: string | null;
    triggerScoreHistoryId: string | null;
    owner:
      | {
          id: string;
          name: string;
          role: string;
          team: string;
        }
      | null;
    account:
      | {
          id: string;
          name: string;
        }
      | null;
    lead:
      | {
          id: string;
          contact:
            | {
                firstName: string;
                lastName: string;
              }
            | null;
        }
      | null;
  },
  now: Date,
): TaskQueueItemContract {
  const linkedEntity = buildLinkedEntitySummary({
    account: row.account,
    lead: row.lead,
  });
  const fallbackReasonCodes = parseActionReasonCodes(row.sourceReasonCodesJson);
  const fallbackExplanation = {
    summary: row.description,
    reasonCodes: fallbackReasonCodes,
    trigger: {
      signalId: row.triggerSignalId,
      routingDecisionId: row.triggerRoutingDecisionId,
      scoreHistoryId: row.triggerScoreHistoryId,
    },
    context: {
      entityType: linkedEntity.entityType,
      entityId: linkedEntity.entityId,
      accountId: linkedEntity.accountId,
      leadId: linkedEntity.leadId,
      temperature: null,
      inboundType: null,
      lifecycleStage: null,
      assignedQueue: null,
      isStrategic: false,
      activeAccount: false,
    },
    dueAtIso: row.dueAt.toISOString(),
    dedupeKey: row.dedupeKey,
  };
  const explanation = parseExplanation(row.explanationJson, fallbackExplanation);
  const priorityCode = priorityCodeByValue[row.priority];
  const sla = mapTaskSlaSnapshot(
    {
      isSlaTracked: row.isSlaTracked,
      slaPolicyKey: row.slaPolicyKey,
      slaPolicyVersion: row.slaPolicyVersion,
      slaTargetMinutes: row.slaTargetMinutes,
      dueAt: row.dueAt,
      slaBreachedAt: row.slaBreachedAt,
      completedAt: row.completedAt,
      status: row.status,
    },
    now,
  );

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    taskType: row.taskType,
    actionType: row.actionType,
    actionCategory: row.actionCategory,
    priorityCode,
    priorityLabel: priorityLabelByCode[priorityCode],
    status: row.status,
    dueAtIso: row.dueAt.toISOString(),
    createdAtIso: row.createdAt.toISOString(),
    completedAtIso: row.completedAt?.toISOString() ?? null,
    owner: buildOwnerSummary(row.owner),
    linkedEntity,
    reasonSummary: buildReasonSummary(explanation),
    explanation,
    isOverdue:
      row.status !== TaskStatus.COMPLETED &&
      row.dueAt.getTime() < now.getTime(),
    sla,
  };
}

function mapRecommendationRow(
  row: {
    id: string;
    recommendationType: ActionType;
    actionCategory: ActionCategory;
    severity: TaskPriority;
    title: string;
    summary: string;
    explanationJson: unknown;
    sourceReasonCodesJson: unknown;
    dedupeKey: string | null;
    triggerSignalId: string | null;
    triggerRoutingDecisionId: string | null;
    triggerScoreHistoryId: string | null;
    createdAt: Date;
    suggestedQueue: string | null;
    suggestedOwner:
      | {
          id: string;
          name: string;
          role: string;
          team: string;
        }
      | null;
    account:
      | {
          id: string;
          name: string;
        }
      | null;
    lead:
      | {
          id: string;
          contact:
            | {
                firstName: string;
                lastName: string;
              }
            | null;
        }
      | null;
  },
): ActionRecommendationContract {
  const linkedEntity = buildLinkedEntitySummary({
    account: row.account,
    lead: row.lead,
  });
  const fallbackReasonCodes = parseActionReasonCodes(row.sourceReasonCodesJson);
  const fallbackExplanation = {
    summary: row.summary,
    reasonCodes: fallbackReasonCodes,
    trigger: {
      signalId: row.triggerSignalId,
      routingDecisionId: row.triggerRoutingDecisionId,
      scoreHistoryId: row.triggerScoreHistoryId,
    },
    context: {
      entityType: linkedEntity.entityType,
      entityId: linkedEntity.entityId,
      accountId: linkedEntity.accountId,
      leadId: linkedEntity.leadId,
      temperature: null,
      inboundType: null,
      lifecycleStage: null,
      assignedQueue: row.suggestedQueue,
      isStrategic: false,
      activeAccount: false,
    },
    dueAtIso: null,
    dedupeKey: row.dedupeKey,
  };
  const explanation = parseExplanation(row.explanationJson, fallbackExplanation);
  const severityCode = priorityCodeByValue[row.severity];

  return {
    id: row.id,
    recommendationType: row.recommendationType,
    actionCategory: row.actionCategory,
    severityCode,
    severityLabel: priorityLabelByCode[severityCode],
    title: row.title,
    explanation,
    suggestedOwner: buildOwnerSummary(row.suggestedOwner),
    suggestedQueue: row.suggestedQueue,
    linkedEntity,
    createdAtIso: row.createdAt.toISOString(),
  };
}

export async function getTaskById(id: string) {
  const now = new Date();
  const row = await db.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      taskType: true,
      actionType: true,
      actionCategory: true,
      priority: true,
      status: true,
      dueAt: true,
      createdAt: true,
      completedAt: true,
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaBreachedAt: true,
      explanationJson: true,
      sourceReasonCodesJson: true,
      dedupeKey: true,
      triggerSignalId: true,
      triggerRoutingDecisionId: true,
      triggerScoreHistoryId: true,
      owner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
        },
      },
      account: {
        select: {
          id: true,
          name: true,
        },
      },
      lead: {
        select: {
          id: true,
          contact: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  return row ? mapTaskRow(row, now) : null;
}

export async function getTaskQueue(filters: TaskFiltersInput = {}): Promise<TaskQueueContract> {
  const where = buildWhere(filters);
  const now = new Date();
  const rows = await db.task.findMany({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      taskType: true,
      actionType: true,
      actionCategory: true,
      priority: true,
      status: true,
      dueAt: true,
      createdAt: true,
      completedAt: true,
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaBreachedAt: true,
      explanationJson: true,
      sourceReasonCodesJson: true,
      dedupeKey: true,
      triggerSignalId: true,
      triggerRoutingDecisionId: true,
      triggerScoreHistoryId: true,
      owner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
        },
      },
      account: {
        select: {
          id: true,
          name: true,
        },
      },
      lead: {
        select: {
          id: true,
          contact: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  const mappedRows = rows
    .map((row) => mapTaskRow(row, now))
    .filter((row) => {
      if (!filters.slaState) {
        return true;
      }

      const states = Array.isArray(filters.slaState) ? filters.slaState : [filters.slaState];
      return states.includes(row.sla.currentState);
    })
    .sort((left, right) => {
    if (left.isOverdue !== right.isOverdue) {
      return left.isOverdue ? -1 : 1;
    }

    const leftPriority = priorityRank[
      left.priorityCode === "P1"
        ? TaskPriority.URGENT
        : left.priorityCode === "P2"
          ? TaskPriority.HIGH
          : left.priorityCode === "P3"
            ? TaskPriority.MEDIUM
            : TaskPriority.LOW
    ];
    const rightPriority = priorityRank[
      right.priorityCode === "P1"
        ? TaskPriority.URGENT
        : right.priorityCode === "P2"
          ? TaskPriority.HIGH
          : right.priorityCode === "P3"
            ? TaskPriority.MEDIUM
            : TaskPriority.LOW
    ];

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const dueDiff = new Date(left.dueAtIso).getTime() - new Date(right.dueAtIso).getTime();
    if (dueDiff !== 0) {
      return dueDiff;
    }

    return new Date(right.createdAtIso).getTime() - new Date(left.createdAtIso).getTime();
    });

  const statuses = filters.status
    ? Array.isArray(filters.status)
      ? filters.status
      : [filters.status]
    : [TaskStatus.OPEN, TaskStatus.IN_PROGRESS];
  const priorityCodes = filters.priorityCode
    ? Array.isArray(filters.priorityCode)
      ? filters.priorityCode
      : [filters.priorityCode]
    : [];

  return {
    filters: {
      ownerId: filters.ownerId ?? "",
      statuses,
      priorityCodes,
      overdue: filters.overdue ?? null,
      tracked: filters.tracked ?? null,
      slaStates: filters.slaState
        ? Array.isArray(filters.slaState)
          ? filters.slaState
          : [filters.slaState]
        : [],
      entityType: filters.entityType ?? "",
      entityId: filters.entityId ?? "",
    },
    totalCount: mappedRows.length,
    rows: mappedRows,
  };
}

export async function getTasks(filters: TaskFiltersInput = {}): Promise<TaskQueueContract> {
  return getTaskQueue(filters);
}

export async function getTasksForLead(leadId: string) {
  const queue = await getTaskQueue({
    entityType: "lead",
    entityId: leadId,
  });

  return queue.rows;
}

export async function getTasksForAccount(accountId: string) {
  const queue = await getTaskQueue({
    entityType: "account",
    entityId: accountId,
  });

  return queue.rows;
}

export async function getActionRecommendationsForEntity(
  entityType: ActionEntityType,
  entityId: string,
): Promise<ActionRecommendationContract[]> {
  const rows = await db.actionRecommendation.findMany({
    where:
      entityType === "lead"
        ? { leadId: entityId }
        : { accountId: entityId },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      recommendationType: true,
      actionCategory: true,
      severity: true,
      title: true,
      summary: true,
      explanationJson: true,
      sourceReasonCodesJson: true,
      dedupeKey: true,
      triggerSignalId: true,
      triggerRoutingDecisionId: true,
      triggerScoreHistoryId: true,
      createdAt: true,
      suggestedQueue: true,
      suggestedOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
        },
      },
      account: {
        select: {
          id: true,
          name: true,
        },
      },
      lead: {
        select: {
          id: true,
          contact: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  return rows.map(mapRecommendationRow);
}

export async function getRecommendationsList(
  entityType: ActionEntityType,
  entityId: string,
): Promise<ActionRecommendationsListContract> {
  return {
    entityType,
    entityId,
    rows: await getActionRecommendationsForEntity(entityType, entityId),
  };
}

export async function getDashboardTaskSummary(now = new Date()): Promise<DashboardTaskSummaryContract> {
  const rows = await db.task.findMany({
    where: {
      status: {
        in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
      },
    },
    select: {
      id: true,
      ownerId: true,
      priority: true,
      status: true,
      dueAt: true,
      completedAt: true,
      isSlaTracked: true,
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
      slaBreachedAt: true,
    },
  });

  const snapshots = rows.map((row) =>
    mapTaskSlaSnapshot(
      {
        isSlaTracked: row.isSlaTracked,
        slaPolicyKey: row.slaPolicyKey,
        slaPolicyVersion: row.slaPolicyVersion,
        slaTargetMinutes: row.slaTargetMinutes,
        dueAt: row.dueAt,
        slaBreachedAt: row.slaBreachedAt,
        completedAt: row.completedAt,
        status: row.status,
      },
      now,
    ),
  );

  return {
    asOfIso: now.toISOString(),
    openCount: rows.length,
    inProgressCount: rows.filter((row) => row.status === TaskStatus.IN_PROGRESS).length,
    overdueCount: rows.filter((row) => row.dueAt.getTime() < now.getTime()).length,
    urgentCount: rows.filter((row) => row.priority === TaskPriority.URGENT).length,
    unassignedCount: rows.filter((row) => row.ownerId === null).length,
    trackedSlaCount: rows.filter((row) => row.isSlaTracked).length,
    breachedCount: snapshots.filter((item) => item.currentState === "breached").length,
    dueSoonCount: snapshots.filter((item) => item.currentState === "due_soon").length,
  };
}
