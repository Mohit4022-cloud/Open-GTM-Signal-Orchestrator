import { z } from "zod";

import { db } from "@/lib/db";
import type { ScoringConfigContract } from "@/lib/contracts/scoring";

export const DEFAULT_SCORING_VERSION = "scoring/v1";

export const DEFAULT_SCORING_CONFIG: ScoringConfigContract = {
  version: DEFAULT_SCORING_VERSION,
  componentCaps: {
    fit: 25,
    intent: 20,
    engagement: 25,
    recency: 10,
    productUsage: 15,
    manualPriority: 5,
  },
  thresholds: {
    coldMax: 24,
    warmMax: 49,
    hotMax: 74,
    urgentMin: 75,
  },
};

const scoringConfigSchema = z.object({
  version: z.string().optional(),
  componentCaps: z
    .object({
      fit: z.number().int().nonnegative().max(100),
      intent: z.number().int().nonnegative().max(100),
      engagement: z.number().int().nonnegative().max(100),
      recency: z.number().int().max(100),
      productUsage: z.number().int().nonnegative().max(100),
      manualPriority: z.number().int().nonnegative().max(100),
    })
    .partial()
    .optional(),
  thresholds: z
    .object({
      coldMax: z.number().int().min(0).max(100),
      warmMax: z.number().int().min(0).max(100),
      hotMax: z.number().int().min(0).max(100),
      urgentMin: z.number().int().min(0).max(100),
    })
    .partial()
    .optional(),
});

export function parseScoringConfig(configJson: unknown, version?: string | null): ScoringConfigContract {
  const parsed = scoringConfigSchema.safeParse(configJson);

  if (!parsed.success) {
    return DEFAULT_SCORING_CONFIG;
  }

  return {
    version: parsed.data.version ?? version ?? DEFAULT_SCORING_VERSION,
    componentCaps: {
      ...DEFAULT_SCORING_CONFIG.componentCaps,
      ...parsed.data.componentCaps,
    },
    thresholds: {
      ...DEFAULT_SCORING_CONFIG.thresholds,
      ...parsed.data.thresholds,
    },
  };
}

export async function getActiveScoringConfig() {
  const configRow = await db.ruleConfig.findFirst({
    where: {
      ruleType: "scoring",
      isActive: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      version: true,
      configJson: true,
    },
  });

  if (!configRow) {
    return DEFAULT_SCORING_CONFIG;
  }

  return parseScoringConfig(configRow.configJson, configRow.version);
}
