import type { SignalType } from "@prisma/client";

import type {
  CanonicalSignalEventContract,
  JsonRecord,
  SignalNormalizedSummaryContract,
} from "@/lib/contracts/signals";
import type { ValidatedIngestSignalInput } from "@/lib/validation/signals";

import {
  normalizeAccountDomain,
  normalizeContactEmail,
  normalizeSourceSystem,
  signalTypeInputMap,
  signalTypeMetadata,
} from "./shared";

export type NormalizedSignalEnvelope = {
  sourceSystem: string;
  eventType: SignalType;
  accountDomain: string | null;
  contactEmail: string | null;
  occurredAt: Date;
  receivedAt: Date;
  rawPayload: JsonRecord;
  normalizedPayload: CanonicalSignalEventContract;
  normalizedSummary: SignalNormalizedSummaryContract;
};

export function normalizeSignal(input: ValidatedIngestSignalInput): NormalizedSignalEnvelope {
  const sourceSystem = normalizeSourceSystem(input.source_system);
  const eventType = signalTypeInputMap[input.event_type];
  const metadata = signalTypeMetadata[eventType];
  const accountDomain = normalizeAccountDomain(input.account_domain);
  const contactEmail = normalizeContactEmail(input.contact_email);
  const occurredAt = new Date(input.occurred_at);
  const receivedAt = input.received_at ? new Date(input.received_at) : new Date();
  const rawReference = metadata.rawReference(input.payload);
  const payloadSummary = metadata.summary(input.payload);

  const normalizedSummary: SignalNormalizedSummaryContract = {
    accountDomain,
    contactEmail,
    eventCategory: metadata.eventCategory,
    intentStrength: metadata.intentStrength,
    engagementStrength: metadata.engagementStrength,
    payloadSummary,
    rawReference,
  };

  const normalizedPayload: CanonicalSignalEventContract = {
    sourceSystem,
    eventType,
    accountDomain,
    contactEmail,
    occurredAtIso: occurredAt.toISOString(),
    eventCategory: metadata.eventCategory,
    intentStrength: metadata.intentStrength,
    engagementStrength: metadata.engagementStrength,
    payloadSummary,
    rawReference,
  };

  return {
    sourceSystem,
    eventType,
    accountDomain,
    contactEmail,
    occurredAt,
    receivedAt,
    rawPayload: {
      source_system: input.source_system,
      event_type: input.event_type,
      account_domain: input.account_domain ?? null,
      contact_email: input.contact_email ?? null,
      occurred_at: input.occurred_at,
      received_at: input.received_at ?? null,
      payload: input.payload,
    },
    normalizedPayload,
    normalizedSummary,
  };
}
