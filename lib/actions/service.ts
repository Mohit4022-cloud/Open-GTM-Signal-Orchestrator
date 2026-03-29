import { randomUUID } from "node:crypto";

import {
  ActionCategory,
  ActionType,
  Prisma,
  SignalType,
  TaskStatus,
  TaskType,
  Temperature,
  type PrismaClient,
} from "@prisma/client";

import type {
  ActionEntityType,
  ActionGenerationRunContract,
  CreateTaskRequest,
  UpdateTaskRequest,
} from "@/lib/contracts/actions";
import { priorityValueByCode } from "@/lib/contracts/actions";
import { db } from "@/lib/db";
import { assignSlaForTaskWithClient, resolveTaskSlaWithClient } from "@/lib/sla";

import {
  recordActionGenerationSkipped,
  recordActionRecommendationCreated,
  recordDuplicateActionPrevented,
  recordTaskCreated,
  recordTaskUpdated,
} from "@/lib/audit/actions";

import {
  evaluateAccountActionRules,
  evaluateLeadActionRules,
} from "./rules";
import {
  type RecommendationDraft,
  type TaskDraft,
} from "./templates";

type ActionClient = Prisma.TransactionClient | PrismaClient;

export type ActionGenerationOptions = {
  effectiveAt?: Date | string | null;
  triggerSignalId?: string | null;
  triggerRoutingDecisionId?: string | null;
  triggerScoreHistoryId?: string | null;
};

type CreatedTaskResult = {
  id: string;
  created: boolean;
  dedupeKey: string | null;
};

type CreatedRecommendationResult = {
  id: string;
  created: boolean;
  dedupeKey: string | null;
};

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function resolveReferenceTime(value: Date | string | null | undefined, fallback = new Date()) {
  if (!value) {
    return fallback;
  }

  const resolved = value instanceof Date ? value : new Date(value);
  return Number.isNaN(resolved.getTime()) ? fallback : resolved;
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRawReference(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  const rawReference = value.rawReference;
  if (!isRecord(rawReference)) {
    return {};
  }

  return rawReference;
}

async function getGeographyFallbackOwnerId(
  client: ActionClient,
  geography: string | null | undefined,
) {
  if (!geography) {
    return null;
  }

  const owner = await client.user.findFirst({
    where: {
      geography: geography as never,
      role: {
        in: ["SDR", "SDR Manager"],
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
    },
  });

  return owner?.id ?? null;
}

function isAeLikeRole(role: string | null | undefined) {
  return Boolean(role && /account executive|strategic ae|enterprise ae/i.test(role));
}

function isSdrLikeRole(role: string | null | undefined) {
  return Boolean(role && /sdr/i.test(role));
}

async function createTaskFromTemplateWithClient(
  client: ActionClient,
  draft: TaskDraft,
  createdAt: Date,
): Promise<CreatedTaskResult> {
  if (draft.dedupeKey) {
    const existing = await client.task.findUnique({
      where: { dedupeKey: draft.dedupeKey },
      select: { id: true },
    });

    if (existing) {
      await recordDuplicateActionPrevented(client, {
        entityType: draft.leadId ? "lead" : "account",
        entityId: draft.leadId ?? draft.accountId ?? existing.id,
        accountId: draft.accountId,
        leadId: draft.leadId,
        explanation: `Duplicate ${draft.actionType} prevented by dedupe key ${draft.dedupeKey}.`,
        reasonCodes: draft.reasonCodes,
        createdAt,
        afterState: {
          actionType: draft.actionType,
          dedupeKey: draft.dedupeKey,
          existingTaskId: existing.id,
        },
      });

      return {
        id: existing.id,
        created: false,
        dedupeKey: draft.dedupeKey,
      };
    }
  }

  const created = await client.task.create({
    data: {
      id: randomUUID(),
      leadId: draft.leadId,
      accountId: draft.accountId,
      ownerId: draft.ownerId,
      taskType: draft.taskType,
      actionType: draft.actionType,
      actionCategory: draft.actionCategory,
      priority: draft.priority,
      dueAt: draft.dueAt,
      status: TaskStatus.OPEN,
      title: draft.title,
      description: draft.description,
      sourceReasonCodesJson: toJsonValue(draft.reasonCodes),
      explanationJson: toJsonValue(draft.explanation),
      dedupeKey: draft.dedupeKey,
      triggerSignalId: draft.triggerSignalId,
      triggerRoutingDecisionId: draft.triggerRoutingDecisionId,
      triggerScoreHistoryId: draft.triggerScoreHistoryId,
      createdAt,
    },
  });

  await recordTaskCreated(client, {
    taskId: created.id,
    entityType: draft.leadId ? "lead" : "account",
    entityId: draft.leadId ?? draft.accountId ?? created.id,
    accountId: draft.accountId,
    leadId: draft.leadId,
    explanation: draft.explanation.summary,
    reasonCodes: draft.reasonCodes,
    createdAt,
    afterState: {
      taskType: draft.taskType,
      actionType: draft.actionType,
      actionCategory: draft.actionCategory,
      priority: draft.priority,
      dueAt: draft.dueAt.toISOString(),
      ownerId: draft.ownerId,
      dedupeKey: draft.dedupeKey,
      reasonCodes: draft.reasonCodes,
    },
  });

  return {
    id: created.id,
    created: true,
    dedupeKey: draft.dedupeKey,
  };
}

export async function createTaskFromTemplate(draft: TaskDraft) {
  return createTaskFromTemplateWithClient(db, draft, new Date());
}

async function createRecommendationWithClient(
  client: ActionClient,
  draft: RecommendationDraft,
  createdAt: Date,
): Promise<CreatedRecommendationResult> {
  if (draft.dedupeKey) {
    const existing = await client.actionRecommendation.findUnique({
      where: { dedupeKey: draft.dedupeKey },
      select: { id: true },
    });

    if (existing) {
      await recordDuplicateActionPrevented(client, {
        entityType: draft.leadId ? "lead" : "account",
        entityId: draft.leadId ?? draft.accountId ?? existing.id,
        accountId: draft.accountId,
        leadId: draft.leadId,
        explanation: `Duplicate ${draft.recommendationType} prevented by dedupe key ${draft.dedupeKey}.`,
        reasonCodes: draft.reasonCodes,
        createdAt,
        afterState: {
          recommendationType: draft.recommendationType,
          dedupeKey: draft.dedupeKey,
          existingRecommendationId: existing.id,
        },
      });

      return {
        id: existing.id,
        created: false,
        dedupeKey: draft.dedupeKey,
      };
    }
  }

  const created = await client.actionRecommendation.create({
    data: {
      id: randomUUID(),
      leadId: draft.leadId,
      accountId: draft.accountId,
      recommendationType: draft.recommendationType,
      actionCategory: draft.actionCategory,
      severity: draft.severity,
      title: draft.title,
      summary: draft.summary,
      suggestedOwnerId: draft.suggestedOwnerId,
      suggestedQueue: draft.suggestedQueue,
      sourceReasonCodesJson: toJsonValue(draft.reasonCodes),
      explanationJson: toJsonValue(draft.explanation),
      dedupeKey: draft.dedupeKey,
      triggerSignalId: draft.triggerSignalId,
      triggerRoutingDecisionId: draft.triggerRoutingDecisionId,
      triggerScoreHistoryId: draft.triggerScoreHistoryId,
      createdAt,
    },
  });

  await recordActionRecommendationCreated(client, {
    recommendationId: created.id,
    entityType: draft.leadId ? "lead" : "account",
    entityId: draft.leadId ?? draft.accountId ?? created.id,
    accountId: draft.accountId,
    leadId: draft.leadId,
    explanation: draft.explanation.summary,
    reasonCodes: draft.reasonCodes,
    createdAt,
    afterState: {
      recommendationType: draft.recommendationType,
      actionCategory: draft.actionCategory,
      severity: draft.severity,
      suggestedOwnerId: draft.suggestedOwnerId,
      suggestedQueue: draft.suggestedQueue,
      dedupeKey: draft.dedupeKey,
      reasonCodes: draft.reasonCodes,
    },
  });

  return {
    id: created.id,
    created: true,
    dedupeKey: draft.dedupeKey,
  };
}

async function runGeneratedOutputs(
  client: ActionClient,
  entityType: ActionEntityType,
  entityId: string,
  accountId: string | null,
  leadId: string | null,
  evaluation: ReturnType<typeof evaluateLeadActionRules> | ReturnType<typeof evaluateAccountActionRules>,
  generatedAt: Date,
): Promise<ActionGenerationRunContract> {
  const createdTaskIds: string[] = [];
  const createdRecommendationIds: string[] = [];
  const preventedDuplicateKeys: string[] = [];

  for (const task of evaluation.tasks) {
    const result = await createTaskFromTemplateWithClient(client, task, generatedAt);
    if (result.created) {
      createdTaskIds.push(result.id);
    } else if (result.dedupeKey) {
      preventedDuplicateKeys.push(result.dedupeKey);
    }
  }

  for (const recommendation of evaluation.recommendations) {
    const result = await createRecommendationWithClient(client, recommendation, generatedAt);
    if (result.created) {
      createdRecommendationIds.push(result.id);
    } else if (result.dedupeKey) {
      preventedDuplicateKeys.push(result.dedupeKey);
    }
  }

  for (const reasonCode of evaluation.skippedReasonCodes) {
    await recordActionGenerationSkipped(client, {
      entityType,
      entityId,
      accountId,
      leadId,
      explanation: `Action generation skipped because ${reasonCode}.`,
      reasonCodes: [reasonCode],
      createdAt: generatedAt,
      afterState: {
        skippedReasonCode: reasonCode,
      },
    });
  }

  return {
    entityType,
    entityId,
    generatedAtIso: generatedAt.toISOString(),
    createdTaskIds,
    createdRecommendationIds,
    preventedDuplicateKeys,
    skippedReasonCodes: evaluation.skippedReasonCodes,
  };
}

async function syncPrimaryLeadSlaTask(
  client: ActionClient,
  leadId: string,
  routingDecisionId: string | null,
) {
  if (!routingDecisionId) {
    return null;
  }

  const lead = await client.lead.findUnique({
    where: { id: leadId },
    select: {
      slaPolicyKey: true,
      slaPolicyVersion: true,
      slaTargetMinutes: true,
    },
  });

  if (!lead?.slaTargetMinutes) {
    return null;
  }

  const candidates = await client.task.findMany({
    where: {
      leadId,
      triggerRoutingDecisionId: routingDecisionId,
      actionCategory: ActionCategory.IMMEDIATE_RESPONSE,
      status: {
        in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS],
      },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      dueAt: true,
    },
  });

  if (candidates.length === 0) {
    return null;
  }

  const primaryTask = candidates[0]!;

  await client.task.updateMany({
    where: {
      leadId,
      triggerRoutingDecisionId: routingDecisionId,
      id: {
        not: primaryTask.id,
      },
      isSlaTracked: true,
    },
    data: {
      isSlaTracked: false,
      slaPolicyKey: null,
      slaPolicyVersion: null,
      slaTargetMinutes: null,
      slaStatus: null,
      slaBreachedAt: null,
    },
  });

  return assignSlaForTaskWithClient(client, primaryTask.id, {
    isTracked: true,
    policyKey: lead.slaPolicyKey,
    policyVersion: lead.slaPolicyVersion,
    dueAt: primaryTask.dueAt,
  });
}

async function buildLeadRuleContext(
  client: ActionClient,
  leadId: string,
  options: ActionGenerationOptions,
) {
  const lead = await client.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      accountId: true,
      inboundType: true,
      temperature: true,
      firstResponseAt: true,
      currentOwnerId: true,
      routedAt: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      account: {
        select: {
          id: true,
          name: true,
          segment: true,
          lifecycleStage: true,
          ownerId: true,
          namedOwnerId: true,
          geography: true,
        },
      },
    },
  });

  if (!lead?.account) {
    return null;
  }

  const latestRoutingDecision = options.triggerRoutingDecisionId
    ? await client.routingDecision.findUnique({
        where: { id: options.triggerRoutingDecisionId },
        select: {
          id: true,
          assignedOwnerId: true,
          secondaryOwnerId: true,
          assignedQueue: true,
          slaDueAt: true,
          triggerSignalId: true,
          assignedOwner: {
            select: {
              role: true,
            },
          },
          secondaryOwner: {
            select: {
              role: true,
            },
          },
        },
      })
    : await client.routingDecision.findFirst({
        where: {
          leadId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          assignedOwnerId: true,
          secondaryOwnerId: true,
          assignedQueue: true,
          slaDueAt: true,
          triggerSignalId: true,
          assignedOwner: {
            select: {
              role: true,
            },
          },
          secondaryOwner: {
            select: {
              role: true,
            },
          },
        },
      });

  const latestScoreHistory = options.triggerScoreHistoryId
    ? await client.scoreHistory.findUnique({
        where: { id: options.triggerScoreHistoryId },
        select: {
          id: true,
          triggerSignalId: true,
        },
      })
    : await client.scoreHistory.findFirst({
        where: {
          leadId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          triggerSignalId: true,
        },
      });

  const signalId =
    options.triggerSignalId ??
    latestRoutingDecision?.triggerSignalId ??
    latestScoreHistory?.triggerSignalId ??
    null;

  const triggerSignal = signalId
    ? await client.signalEvent.findUnique({
        where: { id: signalId },
        select: {
          id: true,
          eventType: true,
          eventCategory: true,
          receivedAt: true,
          normalizedPayloadJson: true,
        },
      })
    : null;

  const fallbackOwnerId = await getGeographyFallbackOwnerId(client, lead.account.geography);
  const callOwnerId =
    lead.account.segment === "STRATEGIC" &&
    latestRoutingDecision?.secondaryOwnerId &&
    isSdrLikeRole(latestRoutingDecision.secondaryOwner?.role)
      ? latestRoutingDecision.secondaryOwnerId
      : latestRoutingDecision?.assignedOwnerId ??
        lead.currentOwnerId ??
        lead.account.ownerId ??
        lead.account.namedOwnerId ??
        fallbackOwnerId;
  const aeOwnerId =
    latestRoutingDecision?.assignedOwnerId &&
    isAeLikeRole(latestRoutingDecision.assignedOwner?.role)
      ? latestRoutingDecision.assignedOwnerId
      : latestRoutingDecision?.secondaryOwnerId &&
          isAeLikeRole(latestRoutingDecision.secondaryOwner?.role)
        ? latestRoutingDecision.secondaryOwnerId
        : lead.account.ownerId ?? lead.account.namedOwnerId ?? fallbackOwnerId;

  const openHumanFollowUpTask = await client.task.findFirst({
    where: {
      accountId: lead.accountId,
      taskType: {
        in: [TaskType.CALL, TaskType.EMAIL, TaskType.HANDOFF],
      },
      status: {
        not: TaskStatus.COMPLETED,
      },
    },
    select: {
      id: true,
    },
  });

  const templateContext = {
    entityType: "lead" as const,
    entityId: lead.id,
    accountId: lead.account.id,
    leadId: lead.id,
    accountName: lead.account.name,
    leadLabel: lead.contact
      ? `${lead.contact.firstName} ${lead.contact.lastName}`
      : lead.id,
    contactId: lead.contact?.id ?? null,
    contactName: lead.contact
      ? `${lead.contact.firstName} ${lead.contact.lastName}`
      : null,
    temperature: lead.temperature,
    inboundType: lead.inboundType,
    lifecycleStage: lead.account.lifecycleStage,
    assignedQueue: latestRoutingDecision?.assignedQueue ?? null,
    isStrategic: lead.account.segment === "STRATEGIC",
    activeAccount:
      lead.account.lifecycleStage === "SALES_READY" ||
      lead.account.lifecycleStage === "CUSTOMER" ||
      Boolean(openHumanFollowUpTask),
    triggerSignalId: triggerSignal?.id ?? signalId,
    triggerRoutingDecisionId: latestRoutingDecision?.id ?? options.triggerRoutingDecisionId ?? null,
    triggerScoreHistoryId: latestScoreHistory?.id ?? options.triggerScoreHistoryId ?? null,
  };

  return {
    templateContext,
    accountName: lead.account.name,
    contactName: templateContext.contactName,
    contactPhone: lead.contact?.phone ?? null,
    leadTemperature: lead.temperature,
    inboundType: lead.inboundType,
    triggerSignal: triggerSignal
      ? {
          id: triggerSignal.id,
          eventType: triggerSignal.eventType,
          eventCategory: triggerSignal.eventCategory,
          receivedAt: triggerSignal.receivedAt,
          rawReference: parseRawReference(triggerSignal.normalizedPayloadJson),
        }
      : null,
    routingDecision: latestRoutingDecision
      ? {
          id: latestRoutingDecision.id,
          assignedOwnerId: latestRoutingDecision.assignedOwnerId,
          secondaryOwnerId: latestRoutingDecision.secondaryOwnerId,
          assignedQueue: latestRoutingDecision.assignedQueue,
          slaDueAt: latestRoutingDecision.slaDueAt,
        }
      : null,
    scoreHistoryId: latestScoreHistory?.id ?? null,
    callOwnerId,
    aeOwnerId,
    hasActiveAccountPause: templateContext.activeAccount,
    firstResponseAt: lead.firstResponseAt,
    now: resolveReferenceTime(options.effectiveAt, new Date()),
  };
}

async function buildAccountRuleContext(
  client: ActionClient,
  accountId: string,
  options: ActionGenerationOptions,
) {
  const account = await client.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      temperature: true,
      lifecycleStage: true,
      ownerId: true,
      namedOwnerId: true,
      geography: true,
    },
  });

  if (!account) {
    return null;
  }

  const latestScoreHistory = options.triggerScoreHistoryId
    ? await client.scoreHistory.findUnique({
        where: { id: options.triggerScoreHistoryId },
        select: {
          id: true,
          reasonCodesJson: true,
          triggerSignalId: true,
        },
      })
    : await client.scoreHistory.findFirst({
        where: {
          accountId,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          reasonCodesJson: true,
          triggerSignalId: true,
        },
      });

  const signalId = options.triggerSignalId ?? latestScoreHistory?.triggerSignalId ?? null;
  const triggerSignal = signalId
    ? await client.signalEvent.findUnique({
        where: { id: signalId },
        select: {
          id: true,
          eventType: true,
          eventCategory: true,
          receivedAt: true,
        },
      })
    : null;

  const fallbackOwnerId = await getGeographyFallbackOwnerId(client, account.geography);
  const accountOwnerId = account.ownerId ?? account.namedOwnerId ?? fallbackOwnerId;

  const [recentFormFillCount, openHumanFollowUpTask] = await Promise.all([
    client.signalEvent.count({
      where: {
        accountId,
        eventType: SignalType.FORM_FILL,
        occurredAt: {
          gte: new Date(resolveReferenceTime(options.effectiveAt, new Date()).getTime() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    client.task.findFirst({
      where: {
        accountId,
        taskType: {
          in: [TaskType.CALL, TaskType.EMAIL, TaskType.HANDOFF],
        },
        status: {
          not: TaskStatus.COMPLETED,
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  const templateContext = {
    entityType: "account" as const,
    entityId: account.id,
    accountId: account.id,
    leadId: null,
    accountName: account.name,
    leadLabel: null,
    contactId: null,
    contactName: null,
    temperature: account.temperature,
    inboundType: null,
    lifecycleStage: account.lifecycleStage,
    assignedQueue: null,
    isStrategic: false,
    activeAccount:
      account.lifecycleStage === "SALES_READY" ||
      account.lifecycleStage === "CUSTOMER" ||
      Boolean(openHumanFollowUpTask),
    triggerSignalId: triggerSignal?.id ?? signalId,
    triggerRoutingDecisionId: options.triggerRoutingDecisionId ?? null,
    triggerScoreHistoryId: latestScoreHistory?.id ?? options.triggerScoreHistoryId ?? null,
  };

  return {
    templateContext,
    accountName: account.name,
    accountOwnerId,
    triggerSignal: triggerSignal
      ? {
          id: triggerSignal.id,
          eventType: triggerSignal.eventType,
          eventCategory: triggerSignal.eventCategory,
          receivedAt: triggerSignal.receivedAt,
        }
      : null,
    latestScoreReasonCodes: parseStringArray(latestScoreHistory?.reasonCodesJson),
    hasRecentFormFill: recentFormFillCount > 0,
    isWarmAccount: account.temperature === Temperature.WARM,
    hasActiveAccountPause: templateContext.activeAccount,
    now: resolveReferenceTime(options.effectiveAt, new Date()),
  };
}

export async function generateActionsForLeadWithClient(
  client: ActionClient,
  leadId: string,
  options: ActionGenerationOptions = {},
) {
  const context = await buildLeadRuleContext(client, leadId, options);

  if (!context) {
    return null;
  }

  const evaluation = evaluateLeadActionRules(context);
  const result = await runGeneratedOutputs(
    client,
    "lead",
    leadId,
    context.templateContext.accountId,
    leadId,
    evaluation,
    addSeconds(context.now, 40),
  );

  await syncPrimaryLeadSlaTask(client, leadId, context.routingDecision?.id ?? null);

  return result;
}

export async function generateActionsForLead(
  leadId: string,
  options: ActionGenerationOptions = {},
) {
  return db.$transaction((client) => generateActionsForLeadWithClient(client, leadId, options));
}

export async function generateActionsForAccountWithClient(
  client: ActionClient,
  accountId: string,
  options: ActionGenerationOptions = {},
) {
  const context = await buildAccountRuleContext(client, accountId, options);

  if (!context) {
    return null;
  }

  const evaluation = evaluateAccountActionRules(context);
  return runGeneratedOutputs(
    client,
    "account",
    accountId,
    accountId,
    null,
    evaluation,
    addSeconds(context.now, 40),
  );
}

export async function generateActionsForAccount(
  accountId: string,
  options: ActionGenerationOptions = {},
) {
  return db.$transaction((client) => generateActionsForAccountWithClient(client, accountId, options));
}

export async function createManualTask(
  input: CreateTaskRequest,
  options: { createdAt?: Date } = {},
) {
  return db.$transaction(async (client) => {
    const dueAt = new Date(input.dueAtIso);
    const createdAt = options.createdAt ?? new Date();

    const task = await client.task.create({
      data: {
        id: randomUUID(),
        leadId: input.leadId ?? null,
        accountId: input.accountId ?? null,
        ownerId: input.ownerId ?? null,
        taskType: input.taskType,
        actionType: ActionType.MANUAL_CUSTOM,
        actionCategory: ActionCategory.MANUAL,
        priority: priorityValueByCode[input.priorityCode],
        dueAt,
        status: input.status ?? TaskStatus.OPEN,
        title: input.title,
        description: input.description,
        sourceReasonCodesJson: toJsonValue(["manual_task_created"]),
        explanationJson: toJsonValue({
          summary: input.description,
          reasonCodes: ["manual_task_created"],
          reasonDetails: [],
          trigger: {
            signalId: null,
            routingDecisionId: null,
            scoreHistoryId: null,
          },
          context: {
            entityType: input.leadId ? "lead" : "account",
            entityId: input.leadId ?? input.accountId ?? "",
            accountId: input.accountId ?? null,
            leadId: input.leadId ?? null,
            temperature: null,
            inboundType: null,
            lifecycleStage: null,
            assignedQueue: null,
            isStrategic: false,
            activeAccount: false,
          },
          dueAtIso: dueAt.toISOString(),
          dedupeKey: null,
        }),
        createdAt,
        completedAt:
          input.status === TaskStatus.COMPLETED ? dueAt : null,
      },
      select: {
        id: true,
        leadId: true,
        accountId: true,
      },
    });

    await recordTaskCreated(client, {
      taskId: task.id,
      entityType: task.leadId ? "lead" : "account",
      entityId: task.leadId ?? task.accountId ?? task.id,
      accountId: task.accountId,
      leadId: task.leadId,
      explanation: input.description,
      actorType: "user",
      actorId: null,
      actorName: "Workspace operator",
      reasonCodes: ["manual_task_created"],
      createdAt,
      afterState: {
        actionType: ActionType.MANUAL_CUSTOM,
        actionCategory: ActionCategory.MANUAL,
        priority: priorityValueByCode[input.priorityCode],
        dueAt: input.dueAtIso,
      },
    });

    return task.id;
  });
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskRequest,
) {
  return db.$transaction(async (client) => {
    const existing = await client.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        leadId: true,
        accountId: true,
        ownerId: true,
        priority: true,
        dueAt: true,
        title: true,
        description: true,
        status: true,
        completedAt: true,
        isSlaTracked: true,
        slaStatus: true,
        slaBreachedAt: true,
      },
    });

    if (!existing) {
      return null;
    }

    const nextStatus = input.status ?? existing.status;
    const dueAt = input.dueAtIso ? new Date(input.dueAtIso) : existing.dueAt;

    const completedAt =
      nextStatus === TaskStatus.COMPLETED
        ? existing.completedAt ?? new Date()
        : null;

    await client.task.update({
      where: { id: taskId },
      data: {
        ownerId: input.ownerId !== undefined ? input.ownerId : existing.ownerId,
        priority:
          input.priorityCode !== undefined
            ? priorityValueByCode[input.priorityCode]
            : existing.priority,
        dueAt,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        status: nextStatus,
        completedAt,
        slaStatus:
          nextStatus === TaskStatus.COMPLETED
            ? existing.isSlaTracked
              ? "COMPLETED"
              : existing.slaStatus
            : existing.isSlaTracked
              ? existing.slaBreachedAt
                ? "BREACHED"
                : "ON_TRACK"
              : null,
      },
    });

    if (nextStatus === TaskStatus.COMPLETED && completedAt) {
      await resolveTaskSlaWithClient(client, {
        taskId,
        completedAt,
      });
    }

    await recordTaskUpdated(client, {
      taskId,
      entityType: existing.leadId ? "lead" : "account",
      entityId: existing.leadId ?? existing.accountId ?? taskId,
      accountId: existing.accountId,
      leadId: existing.leadId,
      explanation: `Task ${taskId} updated.`,
      actorType: "user",
      actorId: null,
      actorName: "Workspace operator",
      reasonCodes: [],
      beforeState: {
        ownerId: existing.ownerId,
        priority: existing.priority,
        dueAt: existing.dueAt.toISOString(),
        title: existing.title,
        description: existing.description,
        status: existing.status,
        completedAt: existing.completedAt?.toISOString() ?? null,
      },
      afterState: {
        ownerId: input.ownerId !== undefined ? input.ownerId : existing.ownerId,
        priority:
          input.priorityCode !== undefined
            ? priorityValueByCode[input.priorityCode]
            : existing.priority,
        dueAt: dueAt.toISOString(),
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        status: nextStatus,
        completedAt:
          nextStatus === TaskStatus.COMPLETED
            ? existing.completedAt?.toISOString() ?? new Date().toISOString()
            : null,
      },
    });

    return taskId;
  });
}
