import { randomUUID } from "node:crypto";

import { AuditEventType, Prisma, type PrismaClient } from "@prisma/client";

type RoutingAuditClient = Prisma.TransactionClient | PrismaClient;

type RoutingAuditPayload = {
  eventType: AuditEventType;
  entityType: string;
  entityId: string;
  accountId?: string | null;
  leadId?: string | null;
  explanation: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
};

const ACTOR_TYPE = "system";
const ACTOR_NAME = "Routing Engine";

async function createRoutingAuditLog(
  client: RoutingAuditClient,
  payload: RoutingAuditPayload,
) {
  return client.auditLog.create({
    data: {
      id: randomUUID(),
      eventType: payload.eventType,
      actorType: ACTOR_TYPE,
      actorName: ACTOR_NAME,
      entityType: payload.entityType,
      entityId: payload.entityId,
      accountId: payload.accountId ?? null,
      leadId: payload.leadId ?? null,
      beforeState: payload.beforeState
        ? (payload.beforeState as Prisma.InputJsonValue)
        : undefined,
      afterState: payload.afterState
        ? (payload.afterState as Prisma.InputJsonValue)
        : undefined,
      explanation: payload.explanation,
    },
  });
}

export function recordRoutingDecisionCreated(
  client: RoutingAuditClient,
  params: {
    entityType: "lead" | "account";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    afterState: Record<string, unknown>;
  },
) {
  return createRoutingAuditLog(client, {
    eventType: AuditEventType.ROUTE_ASSIGNED,
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    afterState: params.afterState,
  });
}

export function recordRoutingFallbackCapacity(
  client: RoutingAuditClient,
  params: {
    entityType: "lead" | "account";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
  },
) {
  return createRoutingAuditLog(client, {
    eventType: AuditEventType.ROUTING_FALLBACK_CAPACITY,
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    beforeState: params.beforeState,
    afterState: params.afterState,
  });
}

export function recordRoutingSentToOpsReview(
  client: RoutingAuditClient,
  params: {
    entityType: "lead" | "account";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    afterState: Record<string, unknown>;
  },
) {
  return createRoutingAuditLog(client, {
    eventType: AuditEventType.ROUTING_SENT_TO_OPS_REVIEW,
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    afterState: params.afterState,
  });
}
