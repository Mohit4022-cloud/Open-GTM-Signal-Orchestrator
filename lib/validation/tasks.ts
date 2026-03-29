import { TaskStatus, TaskType } from "@prisma/client";
import { z } from "zod";

import {
  actionEntityTypeValues,
  taskPriorityCodeValues,
  type CreateTaskRequest,
  type TaskFiltersInput,
  type UpdateTaskRequest,
} from "@/lib/contracts/actions";

function parseBooleanValue(value: string | null) {
  if (value === null) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}

function normalizeListValues(values: string[]) {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export const createTaskRequestSchema = z
  .object({
    leadId: z.string().trim().min(1).optional(),
    accountId: z.string().trim().min(1).optional(),
    ownerId: z.string().trim().min(1).nullable().optional(),
    taskType: z.nativeEnum(TaskType),
    priorityCode: z.enum(taskPriorityCodeValues),
    dueAtIso: z.iso.datetime(),
    title: z.string().trim().min(1, "title is required"),
    description: z.string().trim().min(1, "description is required"),
    status: z.nativeEnum(TaskStatus).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.leadId && !value.accountId) {
      ctx.addIssue({
        code: "custom",
        message: "leadId or accountId is required",
        path: ["leadId"],
      });
    }
  });

export const updateTaskRequestSchema = z
  .object({
    ownerId: z.string().trim().min(1).nullable().optional(),
    priorityCode: z.enum(taskPriorityCodeValues).optional(),
    dueAtIso: z.iso.datetime().optional(),
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one task field must be updated.",
  });

const taskFiltersSchema = z
  .object({
    ownerId: z.string().trim().min(1).optional(),
    status: z.array(z.nativeEnum(TaskStatus)).optional(),
    priorityCode: z.array(z.enum(taskPriorityCodeValues)).optional(),
    overdue: z.boolean().optional(),
    entityType: z.enum(actionEntityTypeValues).optional(),
    entityId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.entityType && !value.entityId) {
      ctx.addIssue({
        code: "custom",
        message: "entityId is required when entityType is provided",
        path: ["entityId"],
      });
    }

    if (value.entityId && !value.entityType) {
      ctx.addIssue({
        code: "custom",
        message: "entityType is required when entityId is provided",
        path: ["entityType"],
      });
    }
  });

export function parseCreateTaskRequest(input: unknown): CreateTaskRequest {
  return createTaskRequestSchema.parse(input);
}

export function parseUpdateTaskRequest(input: unknown): UpdateTaskRequest {
  return updateTaskRequestSchema.parse(input);
}

export function parseTaskFilters(searchParams: URLSearchParams): TaskFiltersInput {
  return taskFiltersSchema.parse({
    ownerId: searchParams.get("owner") ?? searchParams.get("ownerId") ?? undefined,
    status: (() => {
      const values = normalizeListValues(searchParams.getAll("status"));
      return values.length > 0 ? values : undefined;
    })(),
    priorityCode: (() => {
      const values = normalizeListValues(
        searchParams.getAll("priority").concat(searchParams.getAll("priorityCode")),
      );
      return values.length > 0 ? values : undefined;
    })(),
    overdue: (() => {
      const raw = searchParams.get("overdue");
      const parsed = parseBooleanValue(raw);
      return typeof parsed === "boolean" ? parsed : parsed === undefined ? undefined : raw;
    })(),
    entityType: searchParams.get("entityType") ?? undefined,
    entityId: searchParams.get("entityId") ?? undefined,
  });
}
