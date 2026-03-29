import { randomUUID } from "node:crypto";

import { Prisma, SignalStatus } from "@prisma/client";
import { ZodError } from "zod";

import type { IngestSignalInput, IngestSignalResult } from "@/lib/contracts/signals";
import { db } from "@/lib/db";
import { resolveSignalIdentity } from "@/lib/identity/signals";
import {
  parseSignalInput,
  type ValidatedIngestSignalInput,
} from "@/lib/validation/signals";
import {
  recordIdentityMatched,
  recordSignalDuplicateSkipped,
  recordSignalIngestError,
  recordSignalIngested,
  recordSignalNormalized,
  recordSignalUnmatchedQueued,
} from "@/lib/audit/signals";
import { routeActiveLeadsForSignalWithClient } from "@/lib/routing";
import { recomputeScoresForSignalWithClient } from "@/lib/scoring/service";

import { computeSignalDedupeKey } from "./dedupe";
import { normalizeSignal } from "./normalize";
import { getContactDisplayName } from "./presentation";

function buildMatchedEntities(
  resolution: Awaited<ReturnType<typeof resolveSignalIdentity>>,
): IngestSignalResult["matchedEntities"] {
  return {
    account: resolution.account
      ? {
          id: resolution.account.id,
          name: resolution.account.name,
        }
      : null,
    contact: resolution.contact
      ? {
          id: resolution.contact.id,
          name: getContactDisplayName(
            resolution.contact.firstName,
            resolution.contact.lastName,
            resolution.contact.email,
          ),
        }
      : null,
    lead: null,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown signal ingest error.";
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

export async function ingestSignal(input: IngestSignalInput | unknown): Promise<IngestSignalResult> {
  const parsedInput: ValidatedIngestSignalInput = parseSignalInput(input);
  const normalizedSignal = normalizeSignal(parsedInput);
  const dedupeKey = computeSignalDedupeKey(normalizedSignal);

  const existingSignal = await db.signalEvent.findUnique({
    where: { dedupeKey },
    select: { id: true, status: true },
  });

  if (existingSignal) {
    await recordSignalDuplicateSkipped(db, {
      signalId: existingSignal.id,
      existingSignalId: existingSignal.id,
      dedupeKey,
    });

    return {
      signalId: existingSignal.id,
      created: false,
      status: existingSignal.status,
      outcome: "duplicate",
      matchedEntities: {
        account: null,
        contact: null,
        lead: null,
      },
      reasonCodes: [],
      dedupe: {
        key: dedupeKey,
        duplicate: true,
        existingSignalId: existingSignal.id,
      },
      normalizedEvent: normalizedSignal.normalizedPayload,
      errorMessage: null,
    };
  }

  const signalId = randomUUID();
  const identityResolution = await resolveSignalIdentity(normalizedSignal);
  const matchedEntities = buildMatchedEntities(identityResolution);
  const finalStatus = identityResolution.matched ? SignalStatus.MATCHED : SignalStatus.UNMATCHED;

  try {
    await db.$transaction(async (tx) => {
      await tx.signalEvent.create({
        data: {
          id: signalId,
          sourceSystem: normalizedSignal.sourceSystem,
          eventType: normalizedSignal.eventType,
          accountDomain: normalizedSignal.accountDomain,
          contactEmail: normalizedSignal.contactEmail,
          accountId: identityResolution.account?.id ?? null,
          contactId: identityResolution.contact?.id ?? null,
          leadId: null,
          eventCategory: normalizedSignal.normalizedPayload.eventCategory,
          intentStrength: normalizedSignal.normalizedPayload.intentStrength,
          engagementStrength: normalizedSignal.normalizedPayload.engagementStrength,
          payloadSummary: normalizedSignal.normalizedPayload.payloadSummary,
          rawPayloadJson: normalizedSignal.rawPayload as Prisma.InputJsonValue,
          normalizedPayloadJson: normalizedSignal.normalizedPayload as unknown as Prisma.InputJsonValue,
          identityResolutionCodesJson:
            identityResolution.reasonCodes as unknown as Prisma.InputJsonValue,
          occurredAt: normalizedSignal.occurredAt,
          receivedAt: normalizedSignal.receivedAt,
          dedupeKey,
          status: finalStatus,
          errorMessage: null,
        },
      });

      await recordSignalIngested(tx, {
        signalId,
        accountId: identityResolution.account?.id ?? null,
        rawPayload: normalizedSignal.rawPayload,
        createdAt: addSeconds(normalizedSignal.receivedAt, 0),
      });

      await recordSignalNormalized(tx, {
        signalId,
        accountId: identityResolution.account?.id ?? null,
        normalizedEvent: normalizedSignal.normalizedPayload,
        createdAt: addSeconds(normalizedSignal.receivedAt, 1),
      });

      if (identityResolution.matched) {
        await recordIdentityMatched(tx, {
          signalId,
          accountId: identityResolution.account?.id ?? null,
          contactId: identityResolution.contact?.id ?? null,
          explanation: identityResolution.explanation,
          reasonCodes: identityResolution.reasonCodes,
          createdAt: addSeconds(normalizedSignal.receivedAt, 2),
        });

        await recomputeScoresForSignalWithClient(tx, signalId, {
          type: "SIGNAL_INGESTED",
          signalId,
          effectiveAtIso: normalizedSignal.receivedAt.toISOString(),
          metadata: {
            sourceSystem: normalizedSignal.sourceSystem,
            eventType: normalizedSignal.eventType,
          },
        });
        await routeActiveLeadsForSignalWithClient(tx, signalId);
        return;
      }

      await recordSignalUnmatchedQueued(tx, {
        signalId,
        explanation: identityResolution.explanation,
        reasonCodes: identityResolution.reasonCodes,
        createdAt: addSeconds(normalizedSignal.receivedAt, 2),
      });
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    try {
      await db.signalEvent.create({
        data: {
          id: signalId,
          sourceSystem: normalizedSignal.sourceSystem,
          eventType: normalizedSignal.eventType,
          accountDomain: normalizedSignal.accountDomain,
          contactEmail: normalizedSignal.contactEmail,
          accountId: null,
          contactId: null,
          leadId: null,
          eventCategory: normalizedSignal.normalizedPayload.eventCategory,
          intentStrength: normalizedSignal.normalizedPayload.intentStrength,
          engagementStrength: normalizedSignal.normalizedPayload.engagementStrength,
          payloadSummary: normalizedSignal.normalizedPayload.payloadSummary,
          rawPayloadJson: normalizedSignal.rawPayload as Prisma.InputJsonValue,
          normalizedPayloadJson: normalizedSignal.normalizedPayload as unknown as Prisma.InputJsonValue,
          identityResolutionCodesJson:
            identityResolution.reasonCodes as unknown as Prisma.InputJsonValue,
          occurredAt: normalizedSignal.occurredAt,
          receivedAt: normalizedSignal.receivedAt,
          dedupeKey,
          status: SignalStatus.ERROR,
          errorMessage,
        },
      });

      await recordSignalIngestError(db, {
        signalId,
        errorMessage,
        rawPayload: normalizedSignal.rawPayload,
        createdAt: addSeconds(normalizedSignal.receivedAt, 2),
      });
    } catch {
      // Ignore follow-on persistence errors and surface the original failure.
    }

    throw error;
  }

  return {
    signalId,
    created: true,
    status: finalStatus,
    outcome: identityResolution.matched ? "matched" : "unmatched",
    matchedEntities,
    reasonCodes: identityResolution.reasonCodes,
    dedupe: {
      key: dedupeKey,
      duplicate: false,
      existingSignalId: null,
    },
    normalizedEvent: normalizedSignal.normalizedPayload,
    errorMessage: null,
  };
}
