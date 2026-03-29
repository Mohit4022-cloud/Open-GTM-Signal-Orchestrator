import { AuditEventType, type Prisma, type PrismaClient } from "@prisma/client";

import { createAuditLog } from "@/lib/audit/shared";

type SlaAuditClient = Prisma.TransactionClient | PrismaClient;

type SlaAuditPayload = {
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
const ACTOR_NAME = "SLA Engine";

async function createSlaAuditLog(client: SlaAuditClient, payload: SlaAuditPayload) {
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

export function recordSlaAssigned(
  client: SlaAuditClient,
  params: {
    entityType: "lead" | "task";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    afterState: Record<string, unknown>;
    reasonCodes?: string[];
  },
) {
  return createSlaAuditLog(client, {
    eventType: AuditEventType.SLA_ASSIGNED,
    action: "sla_assigned",
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    reasonCodes: params.reasonCodes ?? [],
    afterState: params.afterState,
  });
}

export function recordSlaBreached(
  client: SlaAuditClient,
  params: {
    entityType: "lead" | "task";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    reasonCodes?: string[];
  },
) {
  return createSlaAuditLog(client, {
    eventType: AuditEventType.SLA_BREACHED,
    action: "sla_breached",
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

export function recordSlaResolved(
  client: SlaAuditClient,
  params: {
    entityType: "lead" | "task";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    reasonCodes?: string[];
  },
) {
  return createSlaAuditLog(client, {
    eventType: AuditEventType.SLA_RESOLVED,
    action: "sla_resolved",
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
