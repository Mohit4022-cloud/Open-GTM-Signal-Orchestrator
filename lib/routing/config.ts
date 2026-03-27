import { AccountTier, Geography, Prisma, Segment, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { RoutingDecisionType } from "@/lib/contracts/routing";
import { db } from "@/lib/db";

type RoutingClient = Prisma.TransactionClient | PrismaClient;

const precedenceSchema = z.enum([
  "named_account_owner",
  "existing_account_owner",
  "strategic_tier_override",
  "territory_segment_rule",
  "round_robin_pool",
  "ops_review_queue",
]);

const routingPoolSchema = z.object({
  key: z.string().min(1),
  geography: z.nativeEnum(Geography),
  team: z.string().min(1),
  queue: z.string().min(1),
  members: z.array(z.string().min(1)).min(1),
  backupPoolKey: z.string().min(1).nullable().optional(),
  sdrPod: z.string().min(1).nullable().optional(),
});

const territorySegmentRuleSchema = z.object({
  key: z.string().min(1),
  geography: z.nativeEnum(Geography),
  segment: z.nativeEnum(Segment),
  team: z.string().min(1),
  queue: z.string().min(1),
  poolKey: z.string().min(1),
  inboundTypes: z.array(z.string().min(1)).default([]),
  sdrPod: z.string().min(1).nullable().optional(),
});

const strategicOverrideSchema = z.object({
  key: z.string().min(1),
  accountTier: z.nativeEnum(AccountTier).default(AccountTier.STRATEGIC),
  geography: z.nativeEnum(Geography).nullable().optional(),
  team: z.string().min(1),
  queue: z.string().min(1),
  primaryOwnerId: z.string().min(1),
  secondaryOwnerId: z.string().min(1),
  escalationPolicyKey: z.string().min(1),
});

const routingConfigSchema = z.object({
  version: z.string().min(1),
  precedence: z.array(precedenceSchema).length(6),
  territorySegmentRules: z.array(territorySegmentRuleSchema).default([]),
  roundRobinPools: z.array(routingPoolSchema).default([]),
  fallbackPoolKeys: z.record(z.nativeEnum(Geography), z.string().min(1)),
  strategicOverrides: z.array(strategicOverrideSchema).default([]),
  opsReview: z.object({
    team: z.string().min(1).nullable().optional(),
    queue: z.string().min(1),
  }),
  slaPolicy: z.object({
    hotInboundLeadMinutes: z.number().int().positive(),
    warmInboundLeadMinutes: z.number().int().positive(),
    productQualifiedMinutes: z.number().int().positive(),
    generalFormFillMinutes: z.number().int().positive(),
  }),
});

export type RoutingPoolConfig = z.infer<typeof routingPoolSchema>;
export type TerritorySegmentRuleConfig = z.infer<typeof territorySegmentRuleSchema>;
export type StrategicOverrideConfig = z.infer<typeof strategicOverrideSchema>;
export type ActiveRoutingConfig = z.infer<typeof routingConfigSchema>;
export type RoutingPrecedence = RoutingDecisionType;

function parseConfigJson(value: unknown) {
  return routingConfigSchema.parse(value);
}

export async function getActiveRoutingConfig(
  client: RoutingClient = db,
): Promise<ActiveRoutingConfig> {
  const ruleConfig = await client.ruleConfig.findFirst({
    where: {
      ruleType: "routing",
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

  if (!ruleConfig) {
    throw new Error("Active routing configuration not found.");
  }

  const parsed = parseConfigJson(ruleConfig.configJson);

  if (parsed.version !== ruleConfig.version) {
    return {
      ...parsed,
      version: ruleConfig.version,
    };
  }

  return parsed;
}

export function getRoutingPoolByKey(config: ActiveRoutingConfig, poolKey: string) {
  return config.roundRobinPools.find((pool) => pool.key === poolKey) ?? null;
}

export function getFallbackPoolForGeography(
  config: ActiveRoutingConfig,
  geography: Geography | null,
) {
  if (!geography) {
    return null;
  }

  const poolKey = config.fallbackPoolKeys[geography];
  return poolKey ? getRoutingPoolByKey(config, poolKey) : null;
}

export function getStrategicOverride(
  config: ActiveRoutingConfig,
  accountTier: AccountTier | null,
  geography: Geography | null,
) {
  if (!accountTier) {
    return null;
  }

  return (
    config.strategicOverrides.find((override) => {
      if (override.accountTier !== accountTier) {
        return false;
      }

      if (override.geography && geography && override.geography !== geography) {
        return false;
      }

      return true;
    }) ?? null
  );
}

export function getTerritorySegmentRule(
  config: ActiveRoutingConfig,
  params: {
    geography: Geography | null;
    segment: Segment | null;
    inboundType: string | null;
  },
) {
  if (!params.geography || !params.segment) {
    return null;
  }

  return (
    config.territorySegmentRules.find((rule) => {
      if (rule.geography !== params.geography || rule.segment !== params.segment) {
        return false;
      }

      if (rule.inboundTypes.length === 0) {
        return true;
      }

      return params.inboundType ? rule.inboundTypes.includes(params.inboundType) : false;
    }) ?? null
  );
}

export const routingConfigSchemaForTests = routingConfigSchema;
