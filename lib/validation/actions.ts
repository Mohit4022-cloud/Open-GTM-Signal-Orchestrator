import { z } from "zod";

import {
  actionEntityTypeValues,
  type ActionEntityType,
} from "@/lib/contracts/actions";

export type ActionEntityLookupInput = {
  entityType: ActionEntityType;
  entityId: string;
};

export type ActionGenerationRequest = ActionEntityLookupInput & {
  effectiveAtIso?: string;
  triggerSignalId?: string;
  triggerRoutingDecisionId?: string;
  triggerScoreHistoryId?: string;
};

const actionEntityLookupSchema = z.object({
  entityType: z.enum(actionEntityTypeValues),
  entityId: z.string().trim().min(1, "entityId is required"),
});

const actionGenerationRequestSchema = actionEntityLookupSchema.extend({
  effectiveAtIso: z.iso.datetime().optional(),
  triggerSignalId: z.string().trim().min(1).optional(),
  triggerRoutingDecisionId: z.string().trim().min(1).optional(),
  triggerScoreHistoryId: z.string().trim().min(1).optional(),
});

export function parseActionEntityLookup(
  searchParams: URLSearchParams,
): ActionEntityLookupInput {
  return actionEntityLookupSchema.parse({
    entityType: searchParams.get("entityType") ?? undefined,
    entityId: searchParams.get("entityId") ?? undefined,
  });
}

export function parseActionGenerationRequest(
  input: unknown,
): ActionGenerationRequest {
  return actionGenerationRequestSchema.parse(input);
}
