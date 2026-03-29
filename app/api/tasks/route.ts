import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type {
  PublicTaskApiErrorCode,
  PublicTaskApiErrorResponseContract,
} from "@/lib/contracts/actions";
import { createManualTask, getTaskById, getTasks } from "@/lib/actions";
import { db } from "@/lib/db";
import {
  parseCreateTaskRequest,
  parseTaskFilters,
} from "@/lib/validation/tasks";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected task error.";
}

function createErrorResponse(
  code: PublicTaskApiErrorCode,
  message: string,
  error: string | null,
  status: number,
) {
  const payload: PublicTaskApiErrorResponseContract = {
    code,
    message,
    error,
  };

  return NextResponse.json(payload, { status });
}

async function validateManualTaskEntities(input: {
  leadId?: string;
  accountId?: string;
  ownerId?: string | null;
}) {
  const [lead, account, owner] = await Promise.all([
    input.leadId
      ? db.lead.findUnique({
          where: { id: input.leadId },
          select: { id: true, accountId: true },
        })
      : Promise.resolve(null),
    input.accountId
      ? db.account.findUnique({
          where: { id: input.accountId },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.ownerId
      ? db.user.findUnique({
          where: { id: input.ownerId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (input.leadId && !lead) {
    return "Lead not found.";
  }

  if (input.accountId && !account) {
    return "Account not found.";
  }

  if (lead && input.accountId && lead.accountId !== input.accountId) {
    return "leadId does not belong to the provided accountId.";
  }

  if (input.ownerId && !owner) {
    return "Owner not found.";
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const filters = parseTaskFilters(new URL(request.url).searchParams);
    const queue = await getTasks(filters);
    return NextResponse.json(queue, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return createErrorResponse(
        "TASK_VALIDATION_ERROR",
        "Task filter validation failed.",
        getErrorMessage(error),
        400,
      );
    }

    return createErrorResponse(
      "TASK_INTERNAL_ERROR",
      "Task query failed.",
      getErrorMessage(error),
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseCreateTaskRequest(body);
    const validationError = await validateManualTaskEntities(input);

    if (validationError) {
      return createErrorResponse("TASK_NOT_FOUND", validationError, validationError, 404);
    }

    const taskId = await createManualTask(input);
    const task = await getTaskById(taskId);

    if (!task) {
      return createErrorResponse(
        "TASK_INTERNAL_ERROR",
        "Task creation succeeded but the task could not be loaded.",
        "Missing task after create.",
        500,
      );
    }

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return createErrorResponse(
        "TASK_VALIDATION_ERROR",
        "Task payload validation failed.",
        getErrorMessage(error),
        400,
      );
    }

    return createErrorResponse(
      "TASK_INTERNAL_ERROR",
      "Task creation failed.",
      getErrorMessage(error),
      500,
    );
  }
}
