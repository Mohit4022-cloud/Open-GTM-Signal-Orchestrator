import { AuditEventType, type Prisma, type PrismaClient } from "@prisma/client";

import { createAuditLog } from "@/lib/audit/shared";

type ScoringAuditClient = Prisma.TransactionClient | PrismaClient;

type AuditPayload = {
  eventType: AuditEventType;
  action: string;
  entityType: string;
  entityId: string;
  accountId?: string | null;
  leadId?: string | null;
  actorType?: string;
  actorId?: string | null;
  actorName?: string;
  explanation: string;
  reasonCodes?: string[];
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
};

const DEFAULT_ACTOR_TYPE = "system";
const DEFAULT_ACTOR_NAME = "Scoring Engine";

async function createScoringAuditLog(client: ScoringAuditClient, payload: AuditPayload) {
  return createAuditLog(client, {
    eventType: payload.eventType,
    action: payload.action,
    actor: {
      type: payload.actorType === "user" ? "user" : DEFAULT_ACTOR_TYPE,
      id: payload.actorId ?? null,
      name: payload.actorName ?? DEFAULT_ACTOR_NAME,
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

export function recordScoreRecomputed(
  client: ScoringAuditClient,
  params: {
    entityType: "account" | "lead";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    reasonCodes?: string[];
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
  },
) {
  return createScoringAuditLog(client, {
    eventType: AuditEventType.SCORE_RECOMPUTED,
    action: "score_recomputed",
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

export function recordScoreThresholdCrossed(
  client: ScoringAuditClient,
  params: {
    entityType: "account" | "lead";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    previousTemperature: string;
    newTemperature: string;
    newScore: number;
    reasonCodes?: string[];
  },
) {
  return createScoringAuditLog(client, {
    eventType: AuditEventType.SCORE_THRESHOLD_CROSSED,
    action: "score_threshold_crossed",
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: `Score temperature changed from ${params.previousTemperature} to ${params.newTemperature} at ${params.newScore}.`,
    reasonCodes: params.reasonCodes ?? [],
    beforeState: {
      temperature: params.previousTemperature,
    },
    afterState: {
      temperature: params.newTemperature,
      score: params.newScore,
    },
  });
}

export function recordScoreManualPriorityOverridden(
  client: ScoringAuditClient,
  params: {
    entityType: "account" | "lead";
    entityId: string;
    accountId?: string | null;
    leadId?: string | null;
    actorType: string;
    actorName: string;
    previousBoost: number;
    newBoost: number;
    note?: string | null;
  },
) {
  return createScoringAuditLog(client, {
    eventType: AuditEventType.SCORE_MANUAL_PRIORITY_OVERRIDDEN,
    action: "score_manual_priority_overridden",
    entityType: params.entityType,
    entityId: params.entityId,
    accountId: params.accountId,
    leadId: params.leadId,
    actorType: params.actorType,
    actorId: null,
    actorName: params.actorName,
    explanation:
      params.note && params.note.trim().length > 0
        ? `Manual priority boost changed from ${params.previousBoost} to ${params.newBoost}. ${params.note.trim()}`
        : `Manual priority boost changed from ${params.previousBoost} to ${params.newBoost}.`,
    reasonCodes: ["manual_priority_boost"],
    beforeState: {
      manualPriorityBoost: params.previousBoost,
    },
    afterState: {
      manualPriorityBoost: params.newBoost,
      note: params.note ?? null,
    },
  });
}

export function recordSignalAttachedAndRescored(
  client: ScoringAuditClient,
  params: {
    signalId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    reasonCodes?: string[];
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
  },
) {
  return createScoringAuditLog(client, {
    eventType: AuditEventType.SIGNAL_ATTACHED_AND_RESCORED,
    action: "signal_attached_and_rescored",
    entityType: "signal_event",
    entityId: params.signalId,
    accountId: params.accountId,
    leadId: params.leadId,
    explanation: params.explanation,
    reasonCodes: params.reasonCodes ?? [],
    beforeState: params.beforeState,
    afterState: params.afterState,
  });
}
