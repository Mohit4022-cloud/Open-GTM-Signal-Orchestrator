import { AuditEventType, type Prisma, type PrismaClient } from "@prisma/client";

import { createAuditLog } from "@/lib/audit/shared";

type ActionAuditClient = Prisma.TransactionClient | PrismaClient;

type ActionAuditPayload = {
  eventType: AuditEventType;
  action: string;
  entityType: string;
  entityId: string;
  accountId?: string | null;
  leadId?: string | null;
  explanation: string;
  actorType?: "system" | "user";
  actorId?: string | null;
  actorName?: string;
  reasonCodes?: string[];
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
};

async function createActionAuditLog(
  client: ActionAuditClient,
  payload: ActionAuditPayload,
) {
  return createAuditLog(client, {
    eventType: payload.eventType,
    action: payload.action,
    actor: {
      type: payload.actorType ?? "system",
      id: payload.actorId ?? null,
      name: payload.actorName ?? "Action Engine",
    },
    entity: {
      type: payload.entityType,
      id: payload.entityId,
      accountId: payload.accountId,
      leadId: payload.leadId,
    },
    explanation: payload.explanation,
    reasonCodes: payload.reasonCodes ?? [],
    before: payload.beforeState,
    after: payload.afterState,
  });
}

export function recordTaskCreated(
  client: ActionAuditClient,
  params: {
    taskId: string;
    entityType: "lead" | "account";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    afterState: Record<string, unknown>;
    reasonCodes?: string[];
    actorType?: "system" | "user";
    actorId?: string | null;
    actorName?: string;
  },
) {
  return createActionAuditLog(client, {
    eventType: AuditEventType.TASK_CREATED,
    action: "task_created",
    entityType: "task",
    entityId: params.taskId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    actorType: params.actorType,
    actorId: params.actorId,
    actorName: params.actorName,
    reasonCodes: params.reasonCodes ?? [],
    afterState: {
      ...params.afterState,
      sourceEntityType: params.entityType,
      sourceEntityId: params.entityId,
    },
  });
}

export function recordTaskUpdated(
  client: ActionAuditClient,
  params: {
    taskId: string;
    entityType: "lead" | "account";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    reasonCodes?: string[];
    actorType?: "system" | "user";
    actorId?: string | null;
    actorName?: string;
  },
) {
  return createActionAuditLog(client, {
    eventType: AuditEventType.TASK_UPDATED,
    action: "task_updated",
    entityType: "task",
    entityId: params.taskId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    actorType: params.actorType,
    actorId: params.actorId,
    actorName: params.actorName,
    reasonCodes: params.reasonCodes ?? [],
    beforeState: {
      ...params.beforeState,
      sourceEntityType: params.entityType,
      sourceEntityId: params.entityId,
    },
    afterState: params.afterState,
  });
}

export function recordActionRecommendationCreated(
  client: ActionAuditClient,
  params: {
    recommendationId: string;
    entityType: "lead" | "account";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    afterState: Record<string, unknown>;
    reasonCodes?: string[];
  },
) {
  return createActionAuditLog(client, {
    eventType: AuditEventType.ACTION_RECOMMENDATION_CREATED,
    action: "action_recommendation_created",
    entityType: "action_recommendation",
    entityId: params.recommendationId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    reasonCodes: params.reasonCodes ?? [],
    afterState: {
      ...params.afterState,
      sourceEntityType: params.entityType,
      sourceEntityId: params.entityId,
    },
  });
}

export function recordDuplicateActionPrevented(
  client: ActionAuditClient,
  params: {
    entityType: "lead" | "account";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    afterState: Record<string, unknown>;
    reasonCodes?: string[];
  },
) {
  return createActionAuditLog(client, {
    eventType: AuditEventType.DUPLICATE_ACTION_PREVENTED,
    action: "duplicate_action_prevented",
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    reasonCodes: params.reasonCodes ?? [],
    afterState: params.afterState,
  });
}

export function recordActionGenerationSkipped(
  client: ActionAuditClient,
  params: {
    entityType: "lead" | "account";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    afterState: Record<string, unknown>;
    reasonCodes?: string[];
  },
) {
  return createActionAuditLog(client, {
    eventType: AuditEventType.ACTION_GENERATION_SKIPPED,
    action: "action_generation_skipped",
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    reasonCodes: params.reasonCodes ?? [],
    afterState: params.afterState,
  });
}
