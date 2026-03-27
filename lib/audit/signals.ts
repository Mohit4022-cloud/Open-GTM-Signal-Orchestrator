import { randomUUID } from "node:crypto";

import { AuditEventType, Prisma, type PrismaClient } from "@prisma/client";

import type {
  CanonicalSignalEventContract,
  IdentityResolutionCode,
  JsonRecord,
} from "@/lib/contracts/signals";

type SignalAuditClient = Prisma.TransactionClient | PrismaClient;

type AuditPayload = {
  signalId: string;
  accountId?: string | null;
  leadId?: string | null;
  explanation: string;
  eventType: AuditEventType;
  beforeState?: JsonRecord | null;
  afterState?: JsonRecord | null;
};

const ACTOR_TYPE = "system";
const ACTOR_NAME = "Signal Pipeline";
const ENTITY_TYPE = "signal_event";

async function createSignalAuditLog(client: SignalAuditClient, payload: AuditPayload) {
  return client.auditLog.create({
    data: {
      id: randomUUID(),
      eventType: payload.eventType,
      actorType: ACTOR_TYPE,
      actorName: ACTOR_NAME,
      entityType: ENTITY_TYPE,
      entityId: payload.signalId,
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

export function recordSignalIngested(
  client: SignalAuditClient,
  params: {
    signalId: string;
    accountId?: string | null;
    leadId?: string | null;
    rawPayload: JsonRecord;
  },
) {
  return createSignalAuditLog(client, {
    signalId: params.signalId,
    accountId: params.accountId,
    leadId: params.leadId,
    eventType: AuditEventType.SIGNAL_INGESTED,
    explanation: "Signal ingested into the canonical pipeline.",
    afterState: params.rawPayload,
  });
}

export function recordSignalNormalized(
  client: SignalAuditClient,
  params: {
    signalId: string;
    accountId?: string | null;
    leadId?: string | null;
    normalizedEvent: CanonicalSignalEventContract;
  },
) {
  return createSignalAuditLog(client, {
    signalId: params.signalId,
    accountId: params.accountId,
    leadId: params.leadId,
    eventType: AuditEventType.SIGNAL_NORMALIZED,
    explanation: "Signal normalized into the canonical event model.",
    afterState: params.normalizedEvent as JsonRecord,
  });
}

export function recordIdentityMatched(
  client: SignalAuditClient,
  params: {
    signalId: string;
    accountId?: string | null;
    leadId?: string | null;
    explanation: string;
    reasonCodes: IdentityResolutionCode[];
    contactId?: string | null;
  },
) {
  return createSignalAuditLog(client, {
    signalId: params.signalId,
    accountId: params.accountId,
    leadId: params.leadId,
    eventType: AuditEventType.IDENTITY_RESOLVED,
    explanation: params.explanation,
    afterState: {
      accountId: params.accountId ?? null,
      contactId: params.contactId ?? null,
      reasonCodes: params.reasonCodes,
    },
  });
}

export function recordSignalUnmatchedQueued(
  client: SignalAuditClient,
  params: {
    signalId: string;
    explanation: string;
    reasonCodes: IdentityResolutionCode[];
  },
) {
  return createSignalAuditLog(client, {
    signalId: params.signalId,
    eventType: AuditEventType.SIGNAL_UNMATCHED_QUEUED,
    explanation: params.explanation,
    afterState: {
      queue: "unmatched",
      reasonCodes: params.reasonCodes,
    },
  });
}

export function recordSignalDuplicateSkipped(
  client: SignalAuditClient,
  params: {
    signalId: string;
    existingSignalId: string;
    dedupeKey: string;
  },
) {
  return createSignalAuditLog(client, {
    signalId: params.signalId,
    eventType: AuditEventType.SIGNAL_DUPLICATE_SKIPPED,
    explanation: `Signal skipped because dedupe key ${params.dedupeKey} already exists on ${params.existingSignalId}.`,
    afterState: {
      existingSignalId: params.existingSignalId,
      dedupeKey: params.dedupeKey,
    },
  });
}

export function recordSignalIngestError(
  client: SignalAuditClient,
  params: {
    signalId: string;
    errorMessage: string;
    rawPayload: JsonRecord;
  },
) {
  return createSignalAuditLog(client, {
    signalId: params.signalId,
    eventType: AuditEventType.SIGNAL_INGEST_ERROR,
    explanation: `Signal ingest failed: ${params.errorMessage}`,
    afterState: {
      rawPayload: params.rawPayload,
      errorMessage: params.errorMessage,
    },
  });
}
