import { Geography, Segment } from "@prisma/client";
import { z } from "zod";

import type { DashboardFiltersInput } from "@/lib/contracts/dashboard";

const dashboardFiltersSchema = z
  .object({
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    segment: z.nativeEnum(Segment).optional(),
    geography: z.nativeEnum(Geography).optional(),
  })
  .refine(
    (value) => {
      if (!value.startDate || !value.endDate) {
        return true;
      }

      return value.startDate <= value.endDate;
    },
    {
      message: "startDate must be on or before endDate.",
      path: ["endDate"],
    },
  );

export function parseDashboardFilters(
  searchParams: URLSearchParams,
): DashboardFiltersInput {
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;

  return dashboardFiltersSchema.parse({
    startDate,
    endDate,
    segment: searchParams.get("segment") ?? undefined,
    geography: searchParams.get("geography") ?? undefined,
  });
}
