import { randomUUID } from "node:crypto";

import {
  AccountTier,
  Geography,
  LeadStatus,
  Prisma,
  RoutingDecisionType as PrismaRoutingDecisionType,
  RoutingEntityType as PrismaRoutingEntityType,
  Segment,
  SignalCategory,
  SignalType,
  Temperature,
  type PrismaClient,
} from "@prisma/client";

import {
  recordRoutingDecisionCreated,
  recordRoutingFallbackCapacity,
  recordRoutingSentToOpsReview,
} from "@/lib/audit/routing";
import {
  generateActionsForAccountWithClient,
  generateActionsForLeadWithClient,
} from "@/lib/actions";
import type {
  RoutingDecisionContract,
  RoutingDecisionType,
  RoutingEntityType,
  RoutingExplanationContract,
  RoutingOwnerSummaryContract,
  RoutingReasonCode,
  RoutingSimulationInputContract,
  RoutingSimulationResultContract,
} from "@/lib/contracts/routing";
import { db } from "@/lib/db";
import { assignSlaForLeadWithClient } from "@/lib/sla";

import {
  applyCapacityScenarioOverride,
  loadCapacitySnapshot,
  type CapacityScenarioContext,
} from "./capacity";
import {
  getActiveRoutingConfig,
  getFallbackPoolForGeography,
  type RoutingPoolConfig,
} from "./config";
import {
  evaluateRoutingDecision,
  type EvaluatedRoutingDecision,
  type RoutingEvaluationContext,
} from "./engine";
import { normalizeRoutingDecisionRow } from "./normalize";
import { buildRoutingReasonDetails, parseRoutingReasonCodes } from "./reason-codes";

type RoutingClient = Prisma.TransactionClient | PrismaClient;

type RoutingContextOptions = {
  triggerSignalId?: string | null;
  effectiveAt?: Date | string | null;
  capacityScenario?: RoutingSimulationInputContract["capacityScenario"];
};

const prismaEntityTypeMap: Record<RoutingEntityType, PrismaRoutingEntityType> = {
  lead: PrismaRoutingEntityType.LEAD,
  account: PrismaRoutingEntityType.ACCOUNT,
};

const prismaDecisionTypeMap: Record<RoutingDecisionType, PrismaRoutingDecisionType> = {
  named_account_owner: PrismaRoutingDecisionType.NAMED_ACCOUNT_OWNER,
  existing_account_owner: PrismaRoutingDecisionType.EXISTING_ACCOUNT_OWNER,
  strategic_tier_override: PrismaRoutingDecisionType.STRATEGIC_TIER_OVERRIDE,
  territory_segment_rule: PrismaRoutingDecisionType.TERRITORY_SEGMENT_RULE,
  round_robin_pool: PrismaRoutingDecisionType.ROUND_ROBIN_POOL,
  ops_review_queue: PrismaRoutingDecisionType.OPS_REVIEW_QUEUE,
};

const routingDecisionTypeMap: Record<PrismaRoutingDecisionType, RoutingDecisionType> = {
  NAMED_ACCOUNT_OWNER: "named_account_owner",
  EXISTING_ACCOUNT_OWNER: "existing_account_owner",
  STRATEGIC_TIER_OVERRIDE: "strategic_tier_override",
  TERRITORY_SEGMENT_RULE: "territory_segment_rule",
  ROUND_ROBIN_POOL: "round_robin_pool",
  OPS_REVIEW_QUEUE: "ops_review_queue",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveReferenceTime(value: Date | string | null | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const resolved = value instanceof Date ? value : new Date(value);
  return Number.isNaN(resolved.getTime()) ? fallback : resolved;
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function parseOwnerSummary(value: unknown): RoutingOwnerSummaryContract | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.role !== "string" ||
    typeof value.team !== "string" ||
    typeof value.geography !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    role: value.role,
    team: value.team,
    geography: value.geography,
  };
}

function parseCapacitySnapshot(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const blockingChecks = Array.isArray(value.blockingChecks)
    ? value.blockingChecks.filter(
        (item): item is "open_hot_leads" | "daily_inbound_assignments" | "open_task_count" =>
          item === "open_hot_leads" ||
          item === "daily_inbound_assignments" ||
          item === "open_task_count",
      )
    : [];

  if (
    typeof value.ownerId !== "string" ||
    typeof value.ownerName !== "string" ||
    typeof value.role !== "string" ||
    typeof value.team !== "string" ||
    typeof value.openHotLeads !== "number" ||
    typeof value.maxOpenHotLeads !== "number" ||
    typeof value.dailyInboundAssignments !== "number" ||
    typeof value.maxDailyInboundAssignments !== "number" ||
    typeof value.openTaskCount !== "number" ||
    typeof value.maxOpenTasks !== "number" ||
    typeof value.hasCapacity !== "boolean"
  ) {
    return null;
  }

  return {
    ownerId: value.ownerId,
    ownerName: value.ownerName,
    role: value.role,
    team: value.team,
    openHotLeads: value.openHotLeads,
    maxOpenHotLeads: value.maxOpenHotLeads,
    dailyInboundAssignments: value.dailyInboundAssignments,
    maxDailyInboundAssignments: value.maxDailyInboundAssignments,
    openTaskCount: value.openTaskCount,
    maxOpenTasks: value.maxOpenTasks,
    hasCapacity: value.hasCapacity,
    blockingChecks,
  };
}

function parseEvaluationStep(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const reasonCodes = parseRoutingReasonCodes(value.reasonCodes);
  const candidateOwnerIds = Array.isArray(value.candidateOwnerIds)
    ? value.candidateOwnerIds.filter((item): item is string => typeof item === "string")
    : [];
  const capacityChecks = Array.isArray(value.capacityChecks)
    ? value.capacityChecks
        .map((item) => parseCapacitySnapshot(item))
        .filter(
          (
            item,
          ): item is NonNullable<ReturnType<typeof parseCapacitySnapshot>> => item !== null,
        )
    : [];

  if (
    typeof value.precedence !== "number" ||
    typeof value.policyKey !== "string" ||
    typeof value.decisionType !== "string" ||
    typeof value.matched !== "boolean" ||
    typeof value.selected !== "boolean"
  ) {
    return null;
  }

  return {
    precedence: value.precedence,
    policyKey: value.policyKey,
    decisionType: value.decisionType as RoutingDecisionType,
    matched: value.matched,
    selected: value.selected,
    skippedReason:
      typeof value.skippedReason === "string" ? value.skippedReason : null,
    reasonCodes,
    reasonDetails: buildRoutingReasonDetails(reasonCodes, { includeNoisy: true }),
    candidateOwnerIds,
    capacityChecks,
  };
}

function parseExplanation(value: unknown): RoutingExplanationContract {
  if (!isRecord(value)) {
    return {
      summary: "Sent to ops-review via Ops review queue.",
      decision: "sent_to_ops_review",
      appliedPolicy: {
        precedence: 0,
        policyKey: "unknown",
        decisionType: "ops_review_queue",
      },
      evaluatedPolicies: [],
      entityContext: {
        entityType: "lead",
        accountDomain: null,
        geography: null,
        segment: null,
        accountTier: null,
        namedAccount: false,
        hasExistingOwner: false,
        leadSource: null,
        inboundType: null,
        sdrPod: null,
        temperature: null,
      },
      assignment: {
        owner: null,
        secondaryOwner: null,
        team: null,
        queue: "ops-review",
        escalationPolicyKey: null,
      },
      capacity: {
        checkedOwners: [],
        fallbackTriggered: false,
      },
      sla: {
        targetMinutes: null,
        dueAtIso: null,
        reasonCodes: [],
        reasonDetails: [],
      },
      reasonCodes: [],
      reasonDetails: [],
    };
  }

  const appliedPolicy = isRecord(value.appliedPolicy) ? value.appliedPolicy : {};
  const assignment = isRecord(value.assignment) ? value.assignment : {};
  const capacity = isRecord(value.capacity) ? value.capacity : {};
  const sla = isRecord(value.sla) ? value.sla : {};
  const entityContext = isRecord(value.entityContext) ? value.entityContext : {};

  return {
    decision:
      value.decision === "assigned_to_owner" ? "assigned_to_owner" : "sent_to_ops_review",
    appliedPolicy: {
      precedence:
        typeof appliedPolicy.precedence === "number" ? appliedPolicy.precedence : 0,
      policyKey:
        typeof appliedPolicy.policyKey === "string" ? appliedPolicy.policyKey : "unknown",
      decisionType:
        typeof appliedPolicy.decisionType === "string"
          ? (appliedPolicy.decisionType as RoutingDecisionType)
          : "ops_review_queue",
    },
    evaluatedPolicies: Array.isArray(value.evaluatedPolicies)
      ? value.evaluatedPolicies
          .map((item) => parseEvaluationStep(item))
          .filter((item): item is NonNullable<ReturnType<typeof parseEvaluationStep>> => item !== null)
      : [],
    entityContext: {
      entityType:
        entityContext.entityType === "account" ? "account" : "lead",
      accountDomain:
        typeof entityContext.accountDomain === "string" ? entityContext.accountDomain : null,
      geography:
        typeof entityContext.geography === "string" ? entityContext.geography : null,
      segment: typeof entityContext.segment === "string" ? entityContext.segment : null,
      accountTier:
        typeof entityContext.accountTier === "string" ? entityContext.accountTier : null,
      namedAccount: entityContext.namedAccount === true,
      hasExistingOwner: entityContext.hasExistingOwner === true,
      leadSource:
        typeof entityContext.leadSource === "string" ? entityContext.leadSource : null,
      inboundType:
        typeof entityContext.inboundType === "string" ? entityContext.inboundType : null,
      sdrPod: typeof entityContext.sdrPod === "string" ? entityContext.sdrPod : null,
      temperature:
        typeof entityContext.temperature === "string" ? entityContext.temperature : null,
    },
    assignment: {
      owner: parseOwnerSummary(assignment.owner),
      secondaryOwner: parseOwnerSummary(assignment.secondaryOwner),
      team: typeof assignment.team === "string" ? assignment.team : null,
      queue: typeof assignment.queue === "string" ? assignment.queue : "ops-review",
      escalationPolicyKey:
        typeof assignment.escalationPolicyKey === "string"
          ? assignment.escalationPolicyKey
          : null,
    },
    capacity: {
      checkedOwners: Array.isArray(capacity.checkedOwners)
        ? capacity.checkedOwners
            .map((item) => parseCapacitySnapshot(item))
            .filter(
              (
                item,
              ): item is NonNullable<ReturnType<typeof parseCapacitySnapshot>> => item !== null,
            )
        : [],
      fallbackTriggered: capacity.fallbackTriggered === true,
    },
    sla: {
      targetMinutes: typeof sla.targetMinutes === "number" ? sla.targetMinutes : null,
      dueAtIso: typeof sla.dueAtIso === "string" ? sla.dueAtIso : null,
      reasonCodes: parseRoutingReasonCodes(sla.reasonCodes),
      reasonDetails: buildRoutingReasonDetails(parseRoutingReasonCodes(sla.reasonCodes), {
        includeNoisy: true,
      }),
    },
    reasonCodes: parseRoutingReasonCodes(value.reasonCodes),
    reasonDetails: buildRoutingReasonDetails(parseRoutingReasonCodes(value.reasonCodes)),
    summary:
      typeof value.summary === "string"
        ? value.summary
        : "Routing explanation unavailable.",
  };
}

function mapRoutingDecisionRow(row: {
  id: string;
  entityType: PrismaRoutingEntityType;
  entityId: string;
  accountId: string | null;
  leadId: string | null;
  policyVersion: string;
  decisionType: PrismaRoutingDecisionType;
  assignedTeam: string | null;
  assignedQueue: string;
  slaTargetMinutes: number | null;
  slaDueAt: Date | null;
  escalationPolicyKey: string | null;
  triggerSignalId: string | null;
  reasonCodesJson: unknown;
  explanationJson: unknown;
  createdAt: Date;
  assignedOwner:
    | {
        id: string;
        name: string;
        role: string;
        team: string;
        geography: Geography;
      }
    | null;
  secondaryOwner:
    | {
        id: string;
        name: string;
        role: string;
        team: string;
        geography: Geography;
      }
    | null;
}): RoutingDecisionContract {
  return normalizeRoutingDecisionRow({
    id: row.id,
    entityType: row.entityType === PrismaRoutingEntityType.ACCOUNT ? "account" : "lead",
    entityId: row.entityId,
    accountId: row.accountId,
    leadId: row.leadId,
    policyVersion: row.policyVersion,
    decisionType: routingDecisionTypeMap[row.decisionType],
    assignedOwner: row.assignedOwner
      ? {
          id: row.assignedOwner.id,
          name: row.assignedOwner.name,
          role: row.assignedOwner.role,
          team: row.assignedOwner.team,
          geography: row.assignedOwner.geography,
        }
      : null,
    secondaryOwner: row.secondaryOwner
      ? {
          id: row.secondaryOwner.id,
          name: row.secondaryOwner.name,
          role: row.secondaryOwner.role,
          team: row.secondaryOwner.team,
          geography: row.secondaryOwner.geography,
        }
      : null,
    assignedTeam: row.assignedTeam,
    assignedQueue: row.assignedQueue,
    slaTargetMinutes: row.slaTargetMinutes,
    slaDueAtIso: row.slaDueAt?.toISOString() ?? null,
    escalationPolicyKey: row.escalationPolicyKey,
    reasonCodes: row.reasonCodesJson,
    explanation: row.explanationJson,
    triggerSignalId: row.triggerSignalId,
    createdAtIso: row.createdAt.toISOString(),
  });
}

async function getTriggerSignal(
  client: RoutingClient,
  triggerSignalId: string | null | undefined,
) {
  if (!triggerSignalId) {
    return null;
  }

  const signal = await client.signalEvent.findUnique({
    where: { id: triggerSignalId },
    select: {
      id: true,
      eventType: true,
      eventCategory: true,
      receivedAt: true,
    },
  });

  if (!signal) {
    return null;
  }

  return signal;
}

async function buildLeadRoutingContext(
  client: RoutingClient,
  leadId: string,
  options: RoutingContextOptions,
): Promise<RoutingEvaluationContext | null> {
  const lead = await client.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      accountId: true,
      source: true,
      inboundType: true,
      status: true,
      temperature: true,
      currentOwnerId: true,
      account: {
        select: {
          id: true,
          domain: true,
          geography: true,
          segment: true,
          accountTier: true,
          namedOwnerId: true,
          ownerId: true,
        },
      },
    },
  });

  if (!lead?.account) {
    return null;
  }

  const triggerSignal = await getTriggerSignal(client, options.triggerSignalId);
  const referenceTime = resolveReferenceTime(
    options.effectiveAt,
    triggerSignal?.receivedAt ?? new Date(),
  );

  return {
    entityType: "lead",
    entityId: lead.id,
    accountId: lead.accountId,
    leadId: lead.id,
    accountDomain: lead.account.domain,
    geography: lead.account.geography,
    segment: lead.account.segment,
    accountTier: lead.account.accountTier,
    namedOwnerId: lead.account.namedOwnerId,
    existingOwnerId: lead.account.ownerId,
    leadSource: lead.source,
    inboundType: lead.inboundType,
    sdrPod: null,
    temperature: lead.temperature,
    triggerSignal,
    referenceTime,
  };
}

async function buildAccountRoutingContext(
  client: RoutingClient,
  accountId: string,
  options: RoutingContextOptions,
): Promise<RoutingEvaluationContext | null> {
  const account = await client.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      domain: true,
      geography: true,
      segment: true,
      accountTier: true,
      namedOwnerId: true,
      ownerId: true,
      temperature: true,
    },
  });

  if (!account) {
    return null;
  }

  const triggerSignal = await getTriggerSignal(client, options.triggerSignalId);
  const referenceTime = resolveReferenceTime(
    options.effectiveAt,
    triggerSignal?.receivedAt ?? new Date(),
  );

  return {
    entityType: "account",
    entityId: account.id,
    accountId: account.id,
    leadId: null,
    accountDomain: account.domain,
    geography: account.geography,
    segment: account.segment,
    accountTier: account.accountTier,
    namedOwnerId: account.namedOwnerId,
    existingOwnerId: account.ownerId,
    leadSource: null,
    inboundType: null,
    sdrPod: null,
    temperature: account.temperature,
    triggerSignal,
    referenceTime,
  };
}

async function getSimulationDefaultOwner(
  client: RoutingClient,
  geography: Geography | null,
) {
  if (!geography) {
    return null;
  }

  const owner = await client.user.findFirst({
    where: {
      geography,
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
    },
  });

  return owner?.id ?? null;
}

async function buildSimulationRoutingContext(
  client: RoutingClient,
  input: RoutingSimulationInputContract,
): Promise<RoutingEvaluationContext> {
  const existingAccount = input.accountDomain
    ? await client.account.findUnique({
        where: {
          domain: input.accountDomain,
        },
        select: {
          id: true,
          domain: true,
          geography: true,
          segment: true,
          accountTier: true,
          namedOwnerId: true,
          ownerId: true,
        },
      })
    : null;
  const geography =
    (input.geography as Geography | null | undefined) ??
    existingAccount?.geography ??
    Geography.NA_WEST;
  const segment =
    (input.segment as Segment | null | undefined) ??
    existingAccount?.segment ??
    Segment.MID_MARKET;
  const accountTier =
    (input.accountTier as AccountTier | null | undefined) ??
    existingAccount?.accountTier ??
    (segment === Segment.STRATEGIC
      ? AccountTier.STRATEGIC
      : segment === Segment.ENTERPRISE
        ? AccountTier.TIER_1
        : segment === Segment.MID_MARKET
          ? AccountTier.TIER_2
          : AccountTier.TIER_3);
  const defaultNamedOwnerId =
    input.namedAccount === true && !existingAccount?.namedOwnerId
      ? await getSimulationDefaultOwner(client, geography)
      : null;
  const triggerSignal =
    input.triggerSignalType && input.triggerSignalType in SignalType
      ? {
          id: "simulated-signal",
          eventType: input.triggerSignalType as SignalType,
          eventCategory:
            input.inboundType === "Product-led"
              ? SignalCategory.PRODUCT
              : SignalCategory.CONVERSION,
          receivedAt: new Date(),
        }
      : null;

  return {
    entityType: "lead",
    entityId: `simulation:${input.accountDomain ?? "manual"}`,
    accountId: existingAccount?.id ?? null,
    leadId: null,
    accountDomain: input.accountDomain ?? existingAccount?.domain ?? "simulation.example.com",
    geography,
    segment,
    accountTier,
    namedOwnerId:
      input.namedOwnerId ??
      (input.namedAccount === false ? null : existingAccount?.namedOwnerId ?? defaultNamedOwnerId),
    existingOwnerId: input.existingOwnerId ?? existingAccount?.ownerId ?? null,
    leadSource: input.leadSource ?? "Routing simulation",
    inboundType:
      input.inboundType ??
      (input.leadSourceType === "inbound" ? "Inbound" : "Signal-driven"),
    sdrPod: input.sdrPod ?? null,
    temperature: (input.temperature as Temperature | null | undefined) ?? Temperature.WARM,
    triggerSignal,
    referenceTime: new Date(),
  };
}

async function createRoutingDeps(
  client: RoutingClient,
  context: RoutingEvaluationContext,
  scenarioContext: CapacityScenarioContext | null,
) {
  const ownerSummaryCache = new Map<string, RoutingOwnerSummaryContract | null>();
  const capacityCache = new Map<string, Awaited<ReturnType<typeof loadCapacitySnapshot>>>();
  const latestAssignmentCache = new Map<string, Map<string, Date | null>>();

  async function getOwnerSummary(ownerId: string) {
    if (ownerSummaryCache.has(ownerId)) {
      return ownerSummaryCache.get(ownerId) ?? null;
    }

    const owner = await client.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        name: true,
        role: true,
        team: true,
        geography: true,
      },
    });

    const summary = owner
      ? {
          id: owner.id,
          name: owner.name,
          role: owner.role,
          team: owner.team,
          geography: owner.geography,
        }
      : null;

    ownerSummaryCache.set(ownerId, summary);
    return summary;
  }

  async function getCapacitySnapshot(
    ownerId: string,
    policyType: RoutingDecisionType,
  ) {
    const cacheKey = `${ownerId}:${policyType}:${context.referenceTime.toISOString()}`;

    if (!capacityCache.has(cacheKey)) {
      const snapshot = await loadCapacitySnapshot(
        client,
        ownerId,
        context.referenceTime,
      );
      capacityCache.set(cacheKey, snapshot);
    }

    const snapshot = capacityCache.get(cacheKey);
    if (!snapshot) {
      return null;
    }

    return applyCapacityScenarioOverride(snapshot, {
      policyType,
      scenarioContext,
    });
  }

  async function getLatestAssignmentsForPool(pool: RoutingPoolConfig) {
    if (latestAssignmentCache.has(pool.key)) {
      return latestAssignmentCache.get(pool.key)!;
    }

    const decisions = await client.routingDecision.findMany({
      where: {
        assignedOwnerId: {
          in: pool.members,
        },
        assignedQueue: pool.queue,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        assignedOwnerId: true,
        createdAt: true,
      },
    });

    const latestByOwnerId = new Map<string, Date | null>();
    for (const memberId of pool.members) {
      latestByOwnerId.set(memberId, null);
    }

    for (const decision of decisions) {
      if (
        decision.assignedOwnerId &&
        latestByOwnerId.get(decision.assignedOwnerId) === null
      ) {
        latestByOwnerId.set(decision.assignedOwnerId, decision.createdAt);
      }
    }

    latestAssignmentCache.set(pool.key, latestByOwnerId);
    return latestByOwnerId;
  }

  async function selectRoundRobinCandidate(
    pool: RoutingPoolConfig,
    policyType: RoutingDecisionType,
  ) {
    const [latestByOwnerId, capacityChecks] = await Promise.all([
      getLatestAssignmentsForPool(pool),
      Promise.all(
        pool.members.map((memberId) => getCapacitySnapshot(memberId, policyType)),
      ),
    ]);

    const resolvedChecks = capacityChecks.filter(
      (
        snapshot,
      ): snapshot is NonNullable<Awaited<ReturnType<typeof getCapacitySnapshot>>> => snapshot !== null,
    );

    const eligibleSnapshots = resolvedChecks.filter((snapshot) => snapshot.hasCapacity);
    eligibleSnapshots.sort((left, right) => {
      const leftAssignedAt = latestByOwnerId.get(left.ownerId)?.getTime() ?? 0;
      const rightAssignedAt = latestByOwnerId.get(right.ownerId)?.getTime() ?? 0;

      if (leftAssignedAt !== rightAssignedAt) {
        return leftAssignedAt - rightAssignedAt;
      }

      const leftIndex = pool.members.indexOf(left.ownerId);
      const rightIndex = pool.members.indexOf(right.ownerId);

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return left.ownerId.localeCompare(right.ownerId);
    });

    return {
      selectedOwnerId: eligibleSnapshots[0]?.ownerId ?? null,
      candidateOwnerIds: [...pool.members],
      capacityChecks: resolvedChecks,
    };
  }

  return {
    getOwnerSummary,
    getCapacitySnapshot,
    selectRoundRobinCandidate,
  };
}

function hasMaterialRoutingChange(
  latestDecision: {
    decisionType: PrismaRoutingDecisionType;
    assignedOwnerId: string | null;
    secondaryOwnerId: string | null;
    assignedTeam: string | null;
    assignedQueue: string;
    slaTargetMinutes: number | null;
    slaDueAt: Date | null;
    escalationPolicyKey: string | null;
    policyVersion: string;
  } | null,
  nextDecision: EvaluatedRoutingDecision,
) {
  if (!latestDecision) {
    return true;
  }

  return (
    latestDecision.decisionType !== prismaDecisionTypeMap[nextDecision.decisionType] ||
    latestDecision.assignedOwnerId !== (nextDecision.assignedOwner?.id ?? null) ||
    latestDecision.secondaryOwnerId !== (nextDecision.secondaryOwner?.id ?? null) ||
    latestDecision.assignedTeam !== nextDecision.assignedTeam ||
    latestDecision.assignedQueue !== nextDecision.assignedQueue ||
    latestDecision.slaTargetMinutes !== nextDecision.slaTargetMinutes ||
    (latestDecision.slaDueAt?.toISOString() ?? null) !==
      (nextDecision.slaDueAt?.toISOString() ?? null) ||
    latestDecision.escalationPolicyKey !== nextDecision.escalationPolicyKey ||
    latestDecision.policyVersion !== nextDecision.policyVersion
  );
}

async function persistRoutingDecision(
  client: RoutingClient,
  context: RoutingEvaluationContext,
  nextDecision: EvaluatedRoutingDecision,
  triggerSignalId: string | null,
) {
  const latestDecision = await client.routingDecision.findFirst({
    where: {
      entityType: prismaEntityTypeMap[context.entityType],
      entityId: context.entityId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      decisionType: true,
      assignedOwnerId: true,
      secondaryOwnerId: true,
      assignedTeam: true,
      assignedQueue: true,
      slaTargetMinutes: true,
      slaDueAt: true,
      escalationPolicyKey: true,
      policyVersion: true,
    },
  });

  if (!hasMaterialRoutingChange(latestDecision, nextDecision)) {
    return client.routingDecision.findUnique({
      where: { id: latestDecision!.id },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        accountId: true,
        leadId: true,
        policyVersion: true,
        decisionType: true,
        assignedTeam: true,
        assignedQueue: true,
        slaTargetMinutes: true,
        slaDueAt: true,
        escalationPolicyKey: true,
        triggerSignalId: true,
        reasonCodesJson: true,
        explanationJson: true,
        createdAt: true,
        assignedOwner: {
          select: {
            id: true,
            name: true,
            role: true,
            team: true,
            geography: true,
          },
        },
        secondaryOwner: {
          select: {
            id: true,
            name: true,
            role: true,
            team: true,
            geography: true,
          },
        },
      },
    });
  }

  if (context.entityType === "lead" && context.leadId) {
    await client.lead.update({
      where: { id: context.leadId },
      data: {
        currentOwnerId: nextDecision.assignedOwner?.id ?? null,
        routedAt: context.referenceTime,
      },
    });
  } else if (context.entityType === "account" && context.accountId) {
    await client.account.update({
      where: { id: context.accountId },
      data: {
        ownerId: nextDecision.assignedOwner?.id ?? null,
      },
    });
  }

  const createdDecision = await client.routingDecision.create({
    data: {
      id: randomUUID(),
      entityType: prismaEntityTypeMap[context.entityType],
      entityId: context.entityId,
      leadId: context.leadId,
      accountId: context.accountId,
      policyVersion: nextDecision.policyVersion,
      decisionType: prismaDecisionTypeMap[nextDecision.decisionType],
      assignedOwnerId: nextDecision.assignedOwner?.id ?? null,
      secondaryOwnerId: nextDecision.secondaryOwner?.id ?? null,
      assignedTeam: nextDecision.assignedTeam,
      assignedQueue: nextDecision.assignedQueue,
      reasonCodesJson: toJsonValue(nextDecision.reasonCodes),
      explanationJson: toJsonValue(nextDecision.explanation),
      slaTargetMinutes: nextDecision.slaTargetMinutes,
      slaDueAt: nextDecision.slaDueAt,
      escalationPolicyKey: nextDecision.escalationPolicyKey,
      triggerSignalId,
      createdAt: context.referenceTime,
    },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      accountId: true,
      leadId: true,
      policyVersion: true,
      decisionType: true,
      assignedTeam: true,
      assignedQueue: true,
      slaTargetMinutes: true,
      slaDueAt: true,
      escalationPolicyKey: true,
      triggerSignalId: true,
      reasonCodesJson: true,
      explanationJson: true,
      createdAt: true,
      assignedOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
          geography: true,
        },
      },
      secondaryOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
          geography: true,
        },
      },
    },
  });

  const contract = mapRoutingDecisionRow(createdDecision);
  const auditCreatedAt = addSeconds(context.referenceTime, 20);

  if (contract.explanation.capacity.fallbackTriggered) {
    await recordRoutingFallbackCapacity(client, {
      entityType: contract.entityType,
      entityId: contract.entityId,
      accountId: contract.accountId,
      leadId: contract.leadId,
      createdAt: auditCreatedAt,
      explanation:
        "Routing fell through to a lower-precedence rule because a higher-precedence owner or pool was overloaded.",
      reasonCodes: contract.reasonCodes,
      beforeState: {
        queue: latestDecision?.assignedQueue ?? null,
        ownerId: latestDecision?.assignedOwnerId ?? null,
      },
      afterState: {
        queue: contract.assignedQueue,
        ownerId: contract.assignedOwner?.id ?? null,
      },
    });
  }

  if (contract.assignedOwner === null) {
    await recordRoutingSentToOpsReview(client, {
      entityType: contract.entityType,
      entityId: contract.entityId,
      accountId: contract.accountId,
      leadId: contract.leadId,
      createdAt: auditCreatedAt,
      explanation: "Routing sent the entity to the ops review queue.",
      reasonCodes: contract.reasonCodes,
      afterState: {
        queue: contract.assignedQueue,
        reasonCodes: contract.reasonCodes,
      },
    });
  } else {
    await recordRoutingDecisionCreated(client, {
      entityType: contract.entityType,
      entityId: contract.entityId,
      accountId: contract.accountId,
      leadId: contract.leadId,
      createdAt: auditCreatedAt,
      explanation:
        `${contract.assignedOwner.name} assigned to ${contract.assignedQueue} via ${contract.decisionType}.`,
      reasonCodes: contract.reasonCodes,
      afterState: {
        ownerId: contract.assignedOwner.id,
        secondaryOwnerId: contract.secondaryOwner?.id ?? null,
        queue: contract.assignedQueue,
        team: contract.assignedTeam,
        reasonCodes: contract.reasonCodes,
      },
    });
  }

  return createdDecision;
}

async function executeRoutingEvaluation(
  client: RoutingClient,
  context: RoutingEvaluationContext,
  capacityScenario: RoutingSimulationInputContract["capacityScenario"],
) {
  const config = await getActiveRoutingConfig(client);
  const scenarioContext: CapacityScenarioContext | null = capacityScenario
    ? {
        scenario: capacityScenario,
        namedOwnerId: context.namedOwnerId,
        existingOwnerId: context.existingOwnerId,
      }
    : null;
  const deps = await createRoutingDeps(client, context, scenarioContext);

  return evaluateRoutingDecision(config, context, deps);
}

export async function routeLeadWithClient(
  client: RoutingClient,
  leadId: string,
  options: RoutingContextOptions = {},
) {
  const context = await buildLeadRoutingContext(client, leadId, options);

  if (!context) {
    return null;
  }

  const nextDecision = await executeRoutingEvaluation(
    client,
    context,
    options.capacityScenario ?? "current",
  );
  const persisted = await persistRoutingDecision(
    client,
    context,
    nextDecision,
    options.triggerSignalId ?? context.triggerSignal?.id ?? null,
  );

  if (!persisted) {
    return null;
  }

  const contract = mapRoutingDecisionRow(persisted);
  await assignSlaForLeadWithClient(client, leadId, {
    inboundType: context.inboundType,
    temperature: context.temperature,
    triggerSignal: context.triggerSignal
      ? {
          eventType: context.triggerSignal.eventType,
          eventCategory: context.triggerSignal.eventCategory,
          receivedAt: context.triggerSignal.receivedAt,
        }
      : null,
    referenceTime: context.referenceTime,
  });
  await generateActionsForLeadWithClient(client, leadId, {
    effectiveAt: context.referenceTime,
    triggerSignalId: options.triggerSignalId ?? context.triggerSignal?.id ?? null,
    triggerRoutingDecisionId: contract.id,
  });

  return contract;
}

export async function routeLead(
  leadId: string,
  options: RoutingContextOptions = {},
) {
  return db.$transaction((client) => routeLeadWithClient(client, leadId, options));
}

async function routeAccountWithClient(
  client: RoutingClient,
  accountId: string,
  options: RoutingContextOptions = {},
) {
  const context = await buildAccountRoutingContext(client, accountId, options);

  if (!context) {
    return null;
  }

  const nextDecision = await executeRoutingEvaluation(
    client,
    context,
    options.capacityScenario ?? "current",
  );
  const persisted = await persistRoutingDecision(
    client,
    context,
    nextDecision,
    options.triggerSignalId ?? context.triggerSignal?.id ?? null,
  );

  if (!persisted) {
    return null;
  }

  const contract = mapRoutingDecisionRow(persisted);
  await generateActionsForAccountWithClient(client, accountId, {
    effectiveAt: context.referenceTime,
    triggerSignalId: options.triggerSignalId ?? context.triggerSignal?.id ?? null,
    triggerRoutingDecisionId: contract.id,
  });

  return contract;
}

export async function routeAccount(
  accountId: string,
  options: RoutingContextOptions = {},
) {
  return db.$transaction((client) => routeAccountWithClient(client, accountId, options));
}

export async function simulateRouting(
  input: RoutingSimulationInputContract,
): Promise<RoutingSimulationResultContract> {
  const context = await buildSimulationRoutingContext(db, input);
  const decision = await executeRoutingEvaluation(
    db,
    context,
    input.capacityScenario ?? "current",
  );

  return {
    policyVersion: decision.policyVersion,
    decisionType: decision.decisionType,
    simulatedOwner: decision.assignedOwner,
    simulatedSecondaryOwner: decision.secondaryOwner,
    simulatedTeam: decision.assignedTeam,
    simulatedQueue: decision.assignedQueue,
    reasonCodes: decision.reasonCodes,
    reasonDetails: buildRoutingReasonDetails(decision.reasonCodes),
    slaTargetMinutes: decision.slaTargetMinutes,
    slaDueAtIso: decision.slaDueAt?.toISOString() ?? null,
    explanation: decision.explanation,
  };
}

export async function getRoutingDecisionById(id: string) {
  const decision = await db.routingDecision.findUnique({
    where: { id },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      accountId: true,
      leadId: true,
      policyVersion: true,
      decisionType: true,
      assignedTeam: true,
      assignedQueue: true,
      slaTargetMinutes: true,
      slaDueAt: true,
      escalationPolicyKey: true,
      triggerSignalId: true,
      reasonCodesJson: true,
      explanationJson: true,
      createdAt: true,
      assignedOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
          geography: true,
        },
      },
      secondaryOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
          geography: true,
        },
      },
    },
  });

  return decision ? mapRoutingDecisionRow(decision) : null;
}

export async function getRecentRoutingDecisions(limit = 10) {
  const decisions = await db.routingDecision.findMany({
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      accountId: true,
      leadId: true,
      policyVersion: true,
      decisionType: true,
      assignedTeam: true,
      assignedQueue: true,
      slaTargetMinutes: true,
      slaDueAt: true,
      escalationPolicyKey: true,
      triggerSignalId: true,
      reasonCodesJson: true,
      explanationJson: true,
      createdAt: true,
      assignedOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
          geography: true,
        },
      },
      secondaryOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
          geography: true,
        },
      },
    },
  });

  return decisions.map(mapRoutingDecisionRow);
}

export async function getRoutingDecisionsForEntity(
  entityType: RoutingEntityType,
  entityId: string,
) {
  const decisions = await db.routingDecision.findMany({
    where: {
      entityType: prismaEntityTypeMap[entityType],
      entityId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      accountId: true,
      leadId: true,
      policyVersion: true,
      decisionType: true,
      assignedTeam: true,
      assignedQueue: true,
      slaTargetMinutes: true,
      slaDueAt: true,
      escalationPolicyKey: true,
      triggerSignalId: true,
      reasonCodesJson: true,
      explanationJson: true,
      createdAt: true,
      assignedOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
          geography: true,
        },
      },
      secondaryOwner: {
        select: {
          id: true,
          name: true,
          role: true,
          team: true,
          geography: true,
        },
      },
    },
  });

  return decisions.map(mapRoutingDecisionRow);
}

export async function routeActiveLeadsForSignalWithClient(
  client: RoutingClient,
  signalId: string,
) {
  const signal = await client.signalEvent.findUnique({
    where: { id: signalId },
    select: {
      accountId: true,
      receivedAt: true,
    },
  });

  if (!signal?.accountId) {
    return [];
  }

  const leads = await client.lead.findMany({
    where: {
      accountId: signal.accountId,
      status: {
        in: [LeadStatus.NEW, LeadStatus.WORKING, LeadStatus.QUALIFIED],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  const decisions: RoutingDecisionContract[] = [];
  for (const lead of leads) {
    const decision = await routeLeadWithClient(client, lead.id, {
      triggerSignalId: signalId,
      effectiveAt: signal.receivedAt,
    });

    if (decision) {
      decisions.push(decision);
    }
  }

  return decisions;
}

export { routeAccountWithClient };
