import type { JsonRecord } from "@/lib/contracts/signals";

import type { NormalizedSignalEnvelope } from "./normalize";
import { hashStableValue } from "./shared";

function getPayloadFingerprint(payload: JsonRecord) {
  return hashStableValue(payload);
}

export function computeSignalDedupeKey(normalizedSignal: NormalizedSignalEnvelope) {
  const dedupeBasis = {
    sourceSystem: normalizedSignal.sourceSystem,
    eventType: normalizedSignal.eventType,
    accountDomain: normalizedSignal.accountDomain,
    contactEmail: normalizedSignal.contactEmail,
    occurredAtIso: normalizedSignal.occurredAt.toISOString(),
    rawReference: normalizedSignal.normalizedPayload.rawReference,
    payloadFingerprint:
      Object.keys(normalizedSignal.normalizedPayload.rawReference).length > 0
        ? null
        : getPayloadFingerprint(normalizedSignal.rawPayload.payload as JsonRecord),
  };

  return hashStableValue(dedupeBasis);
}
