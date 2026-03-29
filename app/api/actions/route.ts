import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type {
  ActionEntityType,
  PublicActionApiErrorCode,
  PublicActionApiErrorResponseContract,
} from "@/lib/contracts/actions";
import {
  generateActionsForAccount,
  generateActionsForLead,
  getRecommendationsList,
} from "@/lib/actions";
import { db } from "@/lib/db";
import {
  parseActionEntityLookup,
  parseActionGenerationRequest,
} from "@/lib/validation/actions";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected action error.";
}

function createErrorResponse(
  code: PublicActionApiErrorCode,
  message: string,
  error: string | null,
  status: number,
) {
  const payload: PublicActionApiErrorResponseContract = {
    code,
    message,
    error,
  };

  return NextResponse.json(payload, { status });
}

async function entityExists(entityType: ActionEntityType, entityId: string) {
  if (entityType === "lead") {
    const lead = await db.lead.findUnique({
      where: { id: entityId },
      select: { id: true },
    });

    return Boolean(lead);
  }

  const account = await db.account.findUnique({
    where: { id: entityId },
    select: { id: true },
  });

  return Boolean(account);
}

export async function GET(request: Request) {
  try {
    const input = parseActionEntityLookup(new URL(request.url).searchParams);

    if (!(await entityExists(input.entityType, input.entityId))) {
      return createErrorResponse(
        "ACTION_NOT_FOUND",
        `${input.entityType} ${input.entityId} was not found.`,
        `${input.entityType} ${input.entityId} was not found.`,
        404,
      );
    }

    const recommendations = await getRecommendationsList(input.entityType, input.entityId);
    return NextResponse.json(recommendations, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return createErrorResponse(
        "ACTION_VALIDATION_ERROR",
        "Action recommendation query validation failed.",
        getErrorMessage(error),
        400,
      );
    }

    return createErrorResponse(
      "ACTION_INTERNAL_ERROR",
      "Action recommendation query failed.",
      getErrorMessage(error),
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseActionGenerationRequest(body);

    if (!(await entityExists(input.entityType, input.entityId))) {
      return createErrorResponse(
        "ACTION_NOT_FOUND",
        `${input.entityType} ${input.entityId} was not found.`,
        `${input.entityType} ${input.entityId} was not found.`,
        404,
      );
    }

    const result =
      input.entityType === "lead"
        ? await generateActionsForLead(input.entityId, {
            effectiveAt: input.effectiveAtIso,
            triggerSignalId: input.triggerSignalId,
            triggerRoutingDecisionId: input.triggerRoutingDecisionId,
            triggerScoreHistoryId: input.triggerScoreHistoryId,
          })
        : await generateActionsForAccount(input.entityId, {
            effectiveAt: input.effectiveAtIso,
            triggerSignalId: input.triggerSignalId,
            triggerRoutingDecisionId: input.triggerRoutingDecisionId,
            triggerScoreHistoryId: input.triggerScoreHistoryId,
          });

    if (!result) {
      return createErrorResponse(
        "ACTION_NOT_FOUND",
        `${input.entityType} ${input.entityId} was not found.`,
        `${input.entityType} ${input.entityId} was not found.`,
        404,
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return createErrorResponse(
        "ACTION_VALIDATION_ERROR",
        "Action generation payload validation failed.",
        getErrorMessage(error),
        400,
      );
    }

    return createErrorResponse(
      "ACTION_INTERNAL_ERROR",
      "Action generation failed.",
      getErrorMessage(error),
      500,
    );
  }
}
