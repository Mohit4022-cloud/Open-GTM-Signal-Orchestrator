import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type {
  PublicTaskApiErrorCode,
  PublicTaskApiErrorResponseContract,
} from "@/lib/contracts/actions";
import { getTaskById, updateTask } from "@/lib/actions";
import { db } from "@/lib/db";
import { parseUpdateTaskRequest } from "@/lib/validation/tasks";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

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

async function validateTaskOwnership(taskId: string, ownerId: string | null | undefined) {
  if (!ownerId) {
    return null;
  }

  const [task, owner] = await Promise.all([
    db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
      },
    }),
    db.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
      },
    }),
  ]);

  if (!task) {
    return "Task not found.";
  }

  if (!owner) {
    return "Owner not found.";
  }

  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseUpdateTaskRequest(body);
    const validationError = await validateTaskOwnership(id, input.ownerId);

    if (validationError === "Task not found.") {
      return createErrorResponse("TASK_NOT_FOUND", validationError, validationError, 404);
    }

    if (validationError) {
      return createErrorResponse("TASK_VALIDATION_ERROR", validationError, validationError, 400);
    }

    const updatedTaskId = await updateTask(id, input);

    if (!updatedTaskId) {
      return createErrorResponse(
        "TASK_NOT_FOUND",
        `Task ${id} was not found.`,
        `Task ${id} was not found.`,
        404,
      );
    }

    const task = await getTaskById(updatedTaskId);

    if (!task) {
      return createErrorResponse(
        "TASK_INTERNAL_ERROR",
        "Task update succeeded but the task could not be loaded.",
        "Missing task after update.",
        500,
      );
    }

    return NextResponse.json(task, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return createErrorResponse(
        "TASK_VALIDATION_ERROR",
        "Task update payload validation failed.",
        getErrorMessage(error),
        400,
      );
    }

    return createErrorResponse(
      "TASK_INTERNAL_ERROR",
      "Task update failed.",
      getErrorMessage(error),
      500,
    );
  }
}
