import { SignalStatus } from "@prisma/client";

import type {
  AccountTimelineItemContract,
  GetAccountTimelineOptions,
  GetUnmatchedSignalsFilters,
  IdentityResolutionCode,
  JsonRecord,
  MatchedEntitiesContract,
  RecentSignalFeedItemContract,
  SignalDetailContract,
  SignalNormalizedSummaryContract,
  SignalRawReferenceContract,
  UnmatchedSignalQueueItemContract,
} from "@/lib/contracts/signals";
import { identityResolutionCodeValues } from "@/lib/contracts/signals";
import { db } from "@/lib/db";
import { formatEnumLabel } from "@/lib/formatters/display";

import { normalizeSourceSystem } from "./shared";

const reasonCodeSet = new Set<IdentityResolutionCode>(identityResolutionCodeValues);

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRawReference(value: unknown): SignalRawReferenceContract {
  if (!isJsonRecord(value) || !isJsonRecord(value.rawReference)) {
    return {};
  }

  return Object.entries(value.rawReference).reduce<SignalRawReferenceContract>((reference, [key, item]) => {
    if (typeof item === "string" && item.length > 0) {
      reference[key] = item;
    }

    return reference;
  }, {});
}

function parseReasonCodes(value: unknown): IdentityResolutionCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is IdentityResolutionCode => {
    return typeof item === "string" && reasonCodeSet.has(item as IdentityResolutionCode);
  });
}

function buildMatchedEntities(signal: {
  account: { id: string; name: string } | null;
  contact:
    | {
        id: string;
        firstName: string;
        lastName: string;
      }
    | null;
  lead:
    | {
        id: string;
        source: string;
      }
    | null;
}): MatchedEntitiesContract {
  return {
    account: signal.account,
    contact: signal.contact
      ? {
          id: signal.contact.id,
          name: `${signal.contact.firstName} ${signal.contact.lastName}`,
        }
      : null,
    lead: signal.lead
      ? {
          id: signal.lead.id,
          name: signal.lead.source,
        }
      : null,
  };
}

function buildNormalizedSummary(signal: {
  accountDomain: string | null;
  contactEmail: string | null;
  eventCategory: SignalNormalizedSummaryContract["eventCategory"];
  intentStrength: SignalNormalizedSummaryContract["intentStrength"];
  engagementStrength: SignalNormalizedSummaryContract["engagementStrength"];
  payloadSummary: string;
  normalizedPayloadJson: unknown;
}): SignalNormalizedSummaryContract {
  return {
    accountDomain: signal.accountDomain,
    contactEmail: signal.contactEmail,
    eventCategory: signal.eventCategory,
    intentStrength: signal.intentStrength,
    engagementStrength: signal.engagementStrength,
    payloadSummary: signal.payloadSummary,
    rawReference: parseRawReference(signal.normalizedPayloadJson),
  };
}

function buildTimelineSubtitle(signal: {
  payloadSummary: string;
  contact:
    | {
        firstName: string;
        lastName: string;
      }
    | null;
}) {
  if (!signal.contact) {
    return signal.payloadSummary;
  }

  return `${signal.contact.firstName} ${signal.contact.lastName} · ${signal.payloadSummary}`;
}

export async function getRecentSignals(limit = 8): Promise<RecentSignalFeedItemContract[]> {
  const signals = await db.signalEvent.findMany({
    take: limit,
    orderBy: {
      occurredAt: "desc",
    },
    select: {
      id: true,
      sourceSystem: true,
      eventType: true,
      occurredAt: true,
      receivedAt: true,
      status: true,
      dedupeKey: true,
      accountDomain: true,
      contactEmail: true,
      eventCategory: true,
      intentStrength: true,
      engagementStrength: true,
      payloadSummary: true,
      normalizedPayloadJson: true,
      identityResolutionCodesJson: true,
      account: {
        select: {
          id: true,
          name: true,
        },
      },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      lead: {
        select: {
          id: true,
          source: true,
        },
      },
    },
  });

  return signals.map((signal) => ({
    signalId: signal.id,
    sourceSystem: signal.sourceSystem,
    eventType: signal.eventType,
    occurredAtIso: signal.occurredAt.toISOString(),
    receivedAtIso: signal.receivedAt.toISOString(),
    status: signal.status,
    dedupeKey: signal.dedupeKey,
    matchedEntities: buildMatchedEntities(signal),
    reasonCodes: parseReasonCodes(signal.identityResolutionCodesJson),
    normalizedSummary: buildNormalizedSummary(signal),
  }));
}

export async function getAccountTimeline(
  accountId: string,
  opts: GetAccountTimelineOptions = {},
): Promise<AccountTimelineItemContract[]> {
  const limit = opts.limit ?? 20;
  const signals = await db.signalEvent.findMany({
    where: {
      accountId,
    },
    take: limit,
    orderBy: {
      occurredAt: "desc",
    },
    select: {
      id: true,
      eventType: true,
      sourceSystem: true,
      occurredAt: true,
      status: true,
      accountDomain: true,
      contactEmail: true,
      eventCategory: true,
      intentStrength: true,
      engagementStrength: true,
      payloadSummary: true,
      normalizedPayloadJson: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return signals.map((signal) => ({
    signalId: signal.id,
    eventType: signal.eventType,
    sourceSystem: signal.sourceSystem,
    occurredAtIso: signal.occurredAt.toISOString(),
    matchStatus: signal.status,
    displayTitle: formatEnumLabel(signal.eventType),
    displaySubtitle: buildTimelineSubtitle(signal),
    normalizedSummary: buildNormalizedSummary(signal),
    associatedContact: signal.contact
      ? {
          id: signal.contact.id,
          fullName: `${signal.contact.firstName} ${signal.contact.lastName}`,
          email: signal.contact.email,
        }
      : null,
  }));
}

export async function getUnmatchedSignals(
  filters: GetUnmatchedSignalsFilters = {},
): Promise<UnmatchedSignalQueueItemContract[]> {
  const limit = filters.limit ?? 25;
  const sourceSystem = filters.sourceSystem ? normalizeSourceSystem(filters.sourceSystem) : undefined;

  const unmatchedSignals = await db.signalEvent.findMany({
    where: {
      status: SignalStatus.UNMATCHED,
      ...(sourceSystem ? { sourceSystem } : {}),
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
    },
    orderBy: {
      occurredAt: "desc",
    },
    select: {
      id: true,
      sourceSystem: true,
      eventType: true,
      occurredAt: true,
      receivedAt: true,
      createdAt: true,
      accountDomain: true,
      contactEmail: true,
      eventCategory: true,
      intentStrength: true,
      engagementStrength: true,
      payloadSummary: true,
      normalizedPayloadJson: true,
      identityResolutionCodesJson: true,
    },
  });

  return unmatchedSignals
    .map((signal) => ({
      signalId: signal.id,
      sourceSystem: signal.sourceSystem,
      eventType: signal.eventType,
      occurredAtIso: signal.occurredAt.toISOString(),
      accountDomainCandidate: signal.accountDomain,
      contactEmailCandidate: signal.contactEmail,
      reasonCodes: parseReasonCodes(signal.identityResolutionCodesJson),
      normalizedSummary: buildNormalizedSummary(signal),
      createdAtIso: signal.createdAt.toISOString(),
      receivedAtIso: signal.receivedAt.toISOString(),
    }))
    .filter((signal) => {
      if (!filters.reasonCode) {
        return true;
      }

      return signal.reasonCodes.includes(filters.reasonCode);
    })
    .slice(0, limit);
}

export async function getSignalById(id: string): Promise<SignalDetailContract | null> {
  const signal = await db.signalEvent.findUnique({
    where: { id },
    select: {
      id: true,
      sourceSystem: true,
      eventType: true,
      status: true,
      dedupeKey: true,
      accountDomain: true,
      contactEmail: true,
      occurredAt: true,
      receivedAt: true,
      createdAt: true,
      errorMessage: true,
      eventCategory: true,
      intentStrength: true,
      engagementStrength: true,
      payloadSummary: true,
      rawPayloadJson: true,
      normalizedPayloadJson: true,
      identityResolutionCodesJson: true,
      account: {
        select: {
          id: true,
          name: true,
        },
      },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      lead: {
        select: {
          id: true,
          source: true,
        },
      },
    },
  });

  if (!signal) {
    return null;
  }

  const auditTrail = await db.auditLog.findMany({
    where: {
      entityType: "signal_event",
      entityId: id,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      eventType: true,
      explanation: true,
      actorType: true,
      actorName: true,
      createdAt: true,
    },
  });

  const normalizedSummary = buildNormalizedSummary(signal);
  const normalizedPayload =
    isJsonRecord(signal.normalizedPayloadJson) &&
    typeof signal.normalizedPayloadJson.sourceSystem === "string" &&
    typeof signal.normalizedPayloadJson.occurredAtIso === "string"
      ? (signal.normalizedPayloadJson as SignalDetailContract["normalizedPayload"])
      : {
          sourceSystem: signal.sourceSystem,
          eventType: signal.eventType,
          occurredAtIso: signal.occurredAt.toISOString(),
          ...normalizedSummary,
        };

  return {
    signalId: signal.id,
    sourceSystem: signal.sourceSystem,
    eventType: signal.eventType,
    status: signal.status,
    dedupeKey: signal.dedupeKey,
    accountDomain: signal.accountDomain,
    contactEmail: signal.contactEmail,
    occurredAtIso: signal.occurredAt.toISOString(),
    receivedAtIso: signal.receivedAt.toISOString(),
    createdAtIso: signal.createdAt.toISOString(),
    errorMessage: signal.errorMessage,
    reasonCodes: parseReasonCodes(signal.identityResolutionCodesJson),
    matchedEntities: buildMatchedEntities(signal),
    rawPayload: isJsonRecord(signal.rawPayloadJson) ? signal.rawPayloadJson : {},
    normalizedPayload,
    normalizedSummary,
    auditTrail: auditTrail.map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      explanation: entry.explanation,
      actorType: entry.actorType,
      actorName: entry.actorName,
      createdAtIso: entry.createdAt.toISOString(),
    })),
  };
}
