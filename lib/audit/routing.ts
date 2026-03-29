import { AuditEventType, type Prisma, type PrismaClient } from "@prisma/client";

import { createAuditLog } from "@/lib/audit/shared";

type RoutingAuditClient = Prisma.TransactionClient | PrismaClient;

type RoutingAuditPayload = {
  eventType: AuditEventType;
  action: string;
  entityType: string;
  entityId: string;
  accountId?: string | null;
  leadId?: string | null;
  explanation: string;
  reasonCodes?: string[];
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
};

const ACTOR_TYPE = "system";
const ACTOR_NAME = "Routing Engine";

async function createRoutingAuditLog(
  client: RoutingAuditClient,
  payload: RoutingAuditPayload,
) {
  return createAuditLog(client, {
    eventType: payload.eventType,
    action: payload.action,
    actor: {
      type: ACTOR_TYPE,
      id: null,
      name: ACTOR_NAME,
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

export function recordRoutingDecisionCreated(
  client: RoutingAuditClient,
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
  return createRoutingAuditLog(client, {
    eventType: AuditEventType.ROUTE_ASSIGNED,
    action: "route_assigned",
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    reasonCodes: params.reasonCodes ?? [],
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
    reasonCodes?: string[];
  },
) {
  return createRoutingAuditLog(client, {
    eventType: AuditEventType.ROUTING_FALLBACK_CAPACITY,
    action: "routing_fallback_capacity",
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    reasonCodes: params.reasonCodes ?? [],
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
    reasonCodes?: string[];
  },
) {
  return createRoutingAuditLog(client, {
    eventType: AuditEventType.ROUTING_SENT_TO_OPS_REVIEW,
    action: "routing_sent_to_ops_review",
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    reasonCodes: params.reasonCodes ?? [],
    afterState: params.afterState,
  });
}
