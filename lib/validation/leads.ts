import { LeadStatus, Temperature } from "@prisma/client";
import { z } from "zod";

import { slaCurrentStateValues, type SlaCurrentState } from "@/lib/contracts/sla";
import type { LeadFiltersInput, UpdateLeadRequest } from "@/lib/contracts/leads";

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

const leadFiltersSchema = z.object({
  ownerId: z.string().trim().min(1).optional(),
  status: z.array(z.nativeEnum(LeadStatus)).optional(),
  temperature: z.array(z.nativeEnum(Temperature)).optional(),
  slaState: z.array(z.enum(slaCurrentStateValues)).optional(),
  tracked: z.boolean().optional(),
  overdue: z.boolean().optional(),
  hot: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  recentlyRouted: z.boolean().optional(),
});

export const updateLeadRequestSchema = z
  .object({
    status: z.nativeEnum(LeadStatus).optional(),
    firstResponseAtIso: z.iso.datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one lead field must be updated.",
  });

export function parseLeadFilters(searchParams: URLSearchParams): LeadFiltersInput {
  return leadFiltersSchema.parse({
    ownerId: searchParams.get("ownerId") ?? searchParams.get("owner") ?? undefined,
    status: (() => {
      const values = normalizeListValues(searchParams.getAll("status"));
      return values.length > 0 ? values : undefined;
    })(),
    temperature: (() => {
      const values = normalizeListValues(searchParams.getAll("temperature"));
      return values.length > 0 ? values : undefined;
    })(),
    slaState: (() => {
      const values = normalizeListValues(searchParams.getAll("slaState"));
      return values.length > 0 ? (values as SlaCurrentState[]) : undefined;
    })(),
    tracked: (() => {
      const raw = searchParams.get("tracked");
      const parsed = parseBooleanValue(raw);
      return typeof parsed === "boolean" ? parsed : parsed === undefined ? undefined : raw;
    })(),
    overdue: (() => {
      const raw = searchParams.get("overdue");
      const parsed = parseBooleanValue(raw);
      return typeof parsed === "boolean" ? parsed : parsed === undefined ? undefined : raw;
    })(),
    hot: (() => {
      const raw = searchParams.get("hot");
      const parsed = parseBooleanValue(raw);
      return typeof parsed === "boolean" ? parsed : parsed === undefined ? undefined : raw;
    })(),
    unassigned: (() => {
      const raw = searchParams.get("unassigned");
      const parsed = parseBooleanValue(raw);
      return typeof parsed === "boolean" ? parsed : parsed === undefined ? undefined : raw;
    })(),
    recentlyRouted: (() => {
      const raw = searchParams.get("recentlyRouted");
      const parsed = parseBooleanValue(raw);
      return typeof parsed === "boolean" ? parsed : parsed === undefined ? undefined : raw;
    })(),
  });
}

export function parseUpdateLeadRequest(input: unknown): UpdateLeadRequest {
  return updateLeadRequestSchema.parse(input);
}
