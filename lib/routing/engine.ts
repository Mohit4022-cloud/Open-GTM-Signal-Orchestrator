import {
  AccountTier,
  Geography,
  Segment,
  SignalCategory,
  SignalType,
  Temperature,
} from "@prisma/client";

import type {
  RoutingCapacitySnapshotContract,
  RoutingDecisionType,
  RoutingEntityContextContract,
  RoutingEvaluationStepContract,
  RoutingOwnerSummaryContract,
  RoutingReasonCode,
} from "@/lib/contracts/routing";

import type {
  ActiveRoutingConfig,
  RoutingPoolConfig,
} from "./config";
import {
  getFallbackPoolForGeography,
  getStrategicOverride,
  getTerritorySegmentRule,
} from "./config";
import {
  buildRoutingExplanation,
  uniqueRoutingReasonCodes,
} from "./explanation";
import { buildDecisionReasonCodes } from "./normalize";
import { buildRoutingReasonDetails } from "./reason-codes";
import { resolveRoutingSla } from "./sla";

type TriggerSignalContext = {
  id: string;
  eventType: SignalType;
  eventCategory: SignalCategory;
  receivedAt: Date;
} | null;

export type RoutingEvaluationContext = {
  entityType: "lead" | "account";
  entityId: string;
  accountId: string | null;
  leadId: string | null;
  accountDomain: string | null;
  geography: Geography | null;
  segment: Segment | null;
  accountTier: AccountTier | null;
  namedOwnerId: string | null;
  existingOwnerId: string | null;
  leadSource: string | null;
  inboundType: string | null;
  sdrPod: string | null;
  temperature: Temperature | null;
  triggerSignal: TriggerSignalContext;
  referenceTime: Date;
};

type QueueContext = {
  team: string | null;
  queue: string;
  sdrPod: string | null;
};

type SelectedAssignment = {
  decisionType: RoutingDecisionType;
  precedence: number;
  policyKey: string;
  assignedOwner: RoutingOwnerSummaryContract | null;
  secondaryOwner: RoutingOwnerSummaryContract | null;
  assignedTeam: string | null;
  assignedQueue: string;
  escalationPolicyKey: string | null;
  sdrPod: string | null;
  reasonCodes: RoutingReasonCode[];
};

type StepResult = {
  step: RoutingEvaluationStepContract;
  selected: SelectedAssignment | null;
};

type RoundRobinSelection = {
  selectedOwnerId: string | null;
  candidateOwnerIds: string[];
  capacityChecks: RoutingCapacitySnapshotContract[];
};

export type RoutingEvaluationDeps = {
  getOwnerSummary(ownerId: string): Promise<RoutingOwnerSummaryContract | null>;
  getCapacitySnapshot(
    ownerId: string,
    policyType: RoutingDecisionType,
  ): Promise<RoutingCapacitySnapshotContract | null>;
  selectRoundRobinCandidate(
    pool: RoutingPoolConfig,
    policyType: RoutingDecisionType,
  ): Promise<RoundRobinSelection>;
};

export type EvaluatedRoutingDecision = {
  decisionType: RoutingDecisionType;
  policyKey: string;
  policyVersion: string;
  entityType: "lead" | "account";
  entityId: string;
  accountId: string | null;
  leadId: string | null;
  assignedOwner: RoutingOwnerSummaryContract | null;
  secondaryOwner: RoutingOwnerSummaryContract | null;
  assignedTeam: string | null;
  assignedQueue: string;
  reasonCodes: RoutingReasonCode[];
  explanation: ReturnType<typeof buildRoutingExplanation>;
  slaTargetMinutes: number | null;
  slaDueAt: Date | null;
  escalationPolicyKey: string | null;
};

function buildStep(params: {
  precedence: number;
  policyKey: string;
  decisionType: RoutingDecisionType;
  matched: boolean;
  selected: boolean;
  skippedReason: string | null;
  reasonCodes: RoutingReasonCode[];
  candidateOwnerIds: string[];
  capacityChecks: RoutingCapacitySnapshotContract[];
}): RoutingEvaluationStepContract {
  return {
    precedence: params.precedence,
    policyKey: params.policyKey,
    decisionType: params.decisionType,
    matched: params.matched,
    selected: params.selected,
    skippedReason: params.skippedReason,
    reasonCodes: uniqueRoutingReasonCodes(params.reasonCodes),
    reasonDetails: buildRoutingReasonDetails(
      uniqueRoutingReasonCodes(params.reasonCodes),
      { includeNoisy: true },
    ),
    candidateOwnerIds: params.candidateOwnerIds,
    capacityChecks: params.capacityChecks,
  };
}

function buildEntityContext(
  context: RoutingEvaluationContext,
  sdrPod: string | null,
): RoutingEntityContextContract {
  return {
    entityType: context.entityType,
    accountDomain: context.accountDomain,
    geography: context.geography,
    segment: context.segment,
    accountTier: context.accountTier,
    namedAccount: Boolean(context.namedOwnerId),
    hasExistingOwner: Boolean(context.existingOwnerId),
    leadSource: context.leadSource,
    inboundType: context.inboundType,
    sdrPod,
    temperature: context.temperature,
  };
}

function buildDefaultQueueContext(
  config: ActiveRoutingConfig,
  context: RoutingEvaluationContext,
): QueueContext {
  const territoryRule = getTerritorySegmentRule(config, {
    geography: context.geography,
    segment: context.segment,
    inboundType: context.inboundType,
  });

  if (territoryRule) {
    return {
      team: territoryRule.team,
      queue: territoryRule.queue,
      sdrPod: territoryRule.sdrPod ?? null,
    };
  }

  const fallbackPool = getFallbackPoolForGeography(config, context.geography);

  if (fallbackPool) {
    return {
      team: fallbackPool.team,
      queue: fallbackPool.queue,
      sdrPod: fallbackPool.sdrPod ?? null,
    };
  }

  return {
    team: null,
    queue: "owner-review",
    sdrPod: context.sdrPod,
  };
}

async function evaluateSingleOwnerRule(
  context: RoutingEvaluationContext,
  deps: RoutingEvaluationDeps,
  params: {
    precedence: number;
    policyKey: string;
    decisionType: RoutingDecisionType;
    ownerId: string | null;
    matchedReasonCodes: RoutingReasonCode[];
    queueContext: QueueContext;
  },
): Promise<StepResult> {
  if (!params.ownerId) {
    return {
      step: buildStep({
        precedence: params.precedence,
        policyKey: params.policyKey,
        decisionType: params.decisionType,
        matched: false,
        selected: false,
        skippedReason: "owner_not_configured",
        reasonCodes: [],
        candidateOwnerIds: [],
        capacityChecks: [],
      }),
      selected: null,
    };
  }

  const [ownerSummary, snapshot] = await Promise.all([
    deps.getOwnerSummary(params.ownerId),
    deps.getCapacitySnapshot(params.ownerId, params.decisionType),
  ]);

  if (!ownerSummary || !snapshot) {
    return {
      step: buildStep({
        precedence: params.precedence,
        policyKey: params.policyKey,
        decisionType: params.decisionType,
        matched: true,
        selected: false,
        skippedReason: "owner_not_found",
        reasonCodes: [...params.matchedReasonCodes, "no_eligible_owner_found"],
        candidateOwnerIds: [params.ownerId],
        capacityChecks: snapshot ? [snapshot] : [],
      }),
      selected: null,
    };
  }

  if (!snapshot.hasCapacity) {
    return {
      step: buildStep({
        precedence: params.precedence,
        policyKey: params.policyKey,
        decisionType: params.decisionType,
        matched: true,
        selected: false,
        skippedReason: "owner_over_capacity",
        reasonCodes: [...params.matchedReasonCodes, "owner_over_capacity"],
        candidateOwnerIds: [params.ownerId],
        capacityChecks: [snapshot],
      }),
      selected: null,
    };
  }

  return {
    step: buildStep({
      precedence: params.precedence,
      policyKey: params.policyKey,
      decisionType: params.decisionType,
      matched: true,
      selected: true,
      skippedReason: null,
      reasonCodes: [...params.matchedReasonCodes, "owner_has_capacity"],
      candidateOwnerIds: [params.ownerId],
      capacityChecks: [snapshot],
    }),
    selected: {
      decisionType: params.decisionType,
      precedence: params.precedence,
      policyKey: params.policyKey,
      assignedOwner: ownerSummary,
      secondaryOwner: null,
      assignedTeam: ownerSummary.team,
      assignedQueue: params.queueContext.queue,
      escalationPolicyKey: null,
      sdrPod: params.queueContext.sdrPod,
      reasonCodes: [...params.matchedReasonCodes, "owner_has_capacity"],
    },
  };
}

async function evaluateStrategicOverrideRule(
  config: ActiveRoutingConfig,
  context: RoutingEvaluationContext,
  deps: RoutingEvaluationDeps,
  precedence: number,
): Promise<StepResult> {
  const override = getStrategicOverride(
    config,
    context.accountTier,
    context.geography,
  );

  if (!override) {
    return {
      step: buildStep({
        precedence,
        policyKey: "strategic-tier-override",
        decisionType: "strategic_tier_override",
        matched: false,
        selected: false,
        skippedReason: "no_strategic_override_match",
        reasonCodes: [],
        candidateOwnerIds: [],
        capacityChecks: [],
      }),
      selected: null,
    };
  }

  const [primaryOwner, secondaryOwner, primarySnapshot, secondarySnapshot] =
    await Promise.all([
      deps.getOwnerSummary(override.primaryOwnerId),
      deps.getOwnerSummary(override.secondaryOwnerId),
      deps.getCapacitySnapshot(
        override.primaryOwnerId,
        "strategic_tier_override",
      ),
      deps.getCapacitySnapshot(
        override.secondaryOwnerId,
        "strategic_tier_override",
      ),
    ]);

  const capacityChecks = [primarySnapshot, secondarySnapshot].filter(
    (snapshot): snapshot is RoutingCapacitySnapshotContract => snapshot !== null,
  );

  const bothAvailable =
    primaryOwner !== null &&
    secondaryOwner !== null &&
    primarySnapshot?.hasCapacity === true &&
    secondarySnapshot?.hasCapacity === true;

  if (!bothAvailable) {
    return {
      step: buildStep({
        precedence,
        policyKey: override.key,
        decisionType: "strategic_tier_override",
        matched: true,
        selected: false,
        skippedReason: "strategic_pair_unavailable",
        reasonCodes: ["strategic_tier_override", "owner_over_capacity"],
        candidateOwnerIds: [override.primaryOwnerId, override.secondaryOwnerId],
        capacityChecks,
      }),
      selected: null,
    };
  }

  return {
    step: buildStep({
      precedence,
      policyKey: override.key,
      decisionType: "strategic_tier_override",
      matched: true,
      selected: true,
      skippedReason: null,
      reasonCodes: [
        "strategic_tier_override",
        "strategic_pair_assigned",
        "owner_has_capacity",
      ],
      candidateOwnerIds: [override.primaryOwnerId, override.secondaryOwnerId],
      capacityChecks,
    }),
    selected: {
      decisionType: "strategic_tier_override",
      precedence,
      policyKey: override.key,
      assignedOwner: primaryOwner,
      secondaryOwner,
      assignedTeam: override.team,
      assignedQueue: override.queue,
      escalationPolicyKey: override.escalationPolicyKey,
      sdrPod: null,
      reasonCodes: [
        "strategic_tier_override",
        "strategic_pair_assigned",
        "owner_has_capacity",
      ],
    },
  };
}

async function evaluateTerritoryRule(
  config: ActiveRoutingConfig,
  context: RoutingEvaluationContext,
  deps: RoutingEvaluationDeps,
  precedence: number,
): Promise<StepResult> {
  const rule = getTerritorySegmentRule(config, {
    geography: context.geography,
    segment: context.segment,
    inboundType: context.inboundType,
  });

  if (!rule) {
    return {
      step: buildStep({
        precedence,
        policyKey: "territory-segment-rule",
        decisionType: "territory_segment_rule",
        matched: false,
        selected: false,
        skippedReason: "no_rule_match",
        reasonCodes: ["territory_rule_no_match"],
        candidateOwnerIds: [],
        capacityChecks: [],
      }),
      selected: null,
    };
  }

  const pool = config.roundRobinPools.find((candidate) => candidate.key === rule.poolKey);

  if (!pool) {
    return {
      step: buildStep({
        precedence,
        policyKey: rule.key,
        decisionType: "territory_segment_rule",
        matched: true,
        selected: false,
        skippedReason: "pool_not_found",
        reasonCodes: ["territory_segment_match", "no_eligible_owner_found"],
        candidateOwnerIds: [],
        capacityChecks: [],
      }),
      selected: null,
    };
  }

  const selection = await deps.selectRoundRobinCandidate(
    pool,
    "territory_segment_rule",
  );

  if (!selection.selectedOwnerId) {
    return {
      step: buildStep({
        precedence,
        policyKey: rule.key,
        decisionType: "territory_segment_rule",
        matched: true,
        selected: false,
        skippedReason: "no_owner_with_capacity",
        reasonCodes: [
          "territory_segment_match",
          "owner_over_capacity",
          "no_eligible_owner_found",
        ],
        candidateOwnerIds: selection.candidateOwnerIds,
        capacityChecks: selection.capacityChecks,
      }),
      selected: null,
    };
  }

  const ownerSummary = await deps.getOwnerSummary(selection.selectedOwnerId);

  if (!ownerSummary) {
    return {
      step: buildStep({
        precedence,
        policyKey: rule.key,
        decisionType: "territory_segment_rule",
        matched: true,
        selected: false,
        skippedReason: "owner_not_found",
        reasonCodes: ["territory_segment_match", "no_eligible_owner_found"],
        candidateOwnerIds: selection.candidateOwnerIds,
        capacityChecks: selection.capacityChecks,
      }),
      selected: null,
    };
  }

  return {
    step: buildStep({
      precedence,
      policyKey: rule.key,
      decisionType: "territory_segment_rule",
      matched: true,
      selected: true,
      skippedReason: null,
      reasonCodes: [
        "territory_segment_match",
        "round_robin_selected",
        "owner_has_capacity",
      ],
      candidateOwnerIds: selection.candidateOwnerIds,
      capacityChecks: selection.capacityChecks,
    }),
    selected: {
      decisionType: "territory_segment_rule",
      precedence,
      policyKey: rule.key,
      assignedOwner: ownerSummary,
      secondaryOwner: null,
      assignedTeam: rule.team,
      assignedQueue: rule.queue,
      escalationPolicyKey: null,
      sdrPod: rule.sdrPod ?? null,
      reasonCodes: [
        "territory_segment_match",
        "round_robin_selected",
        "owner_has_capacity",
      ],
    },
  };
}

async function evaluateFallbackRoundRobin(
  config: ActiveRoutingConfig,
  context: RoutingEvaluationContext,
  deps: RoutingEvaluationDeps,
  precedence: number,
): Promise<StepResult> {
  const fallbackPool = getFallbackPoolForGeography(config, context.geography);

  if (!fallbackPool) {
    return {
      step: buildStep({
        precedence,
        policyKey: "round-robin-fallback",
        decisionType: "round_robin_pool",
        matched: false,
        selected: false,
        skippedReason: "no_fallback_pool",
        reasonCodes: [],
        candidateOwnerIds: [],
        capacityChecks: [],
      }),
      selected: null,
    };
  }

  const selection = await deps.selectRoundRobinCandidate(
    fallbackPool,
    "round_robin_pool",
  );

  if (!selection.selectedOwnerId) {
    return {
      step: buildStep({
        precedence,
        policyKey: fallbackPool.key,
        decisionType: "round_robin_pool",
        matched: true,
        selected: false,
        skippedReason: "no_owner_with_capacity",
        reasonCodes: ["owner_over_capacity", "no_eligible_owner_found"],
        candidateOwnerIds: selection.candidateOwnerIds,
        capacityChecks: selection.capacityChecks,
      }),
      selected: null,
    };
  }

  const ownerSummary = await deps.getOwnerSummary(selection.selectedOwnerId);

  if (!ownerSummary) {
    return {
      step: buildStep({
        precedence,
        policyKey: fallbackPool.key,
        decisionType: "round_robin_pool",
        matched: true,
        selected: false,
        skippedReason: "owner_not_found",
        reasonCodes: ["no_eligible_owner_found"],
        candidateOwnerIds: selection.candidateOwnerIds,
        capacityChecks: selection.capacityChecks,
      }),
      selected: null,
    };
  }

  return {
    step: buildStep({
      precedence,
      policyKey: fallbackPool.key,
      decisionType: "round_robin_pool",
      matched: true,
      selected: true,
      skippedReason: null,
      reasonCodes: ["round_robin_selected", "owner_has_capacity"],
      candidateOwnerIds: selection.candidateOwnerIds,
      capacityChecks: selection.capacityChecks,
    }),
    selected: {
      decisionType: "round_robin_pool",
      precedence,
      policyKey: fallbackPool.key,
      assignedOwner: ownerSummary,
      secondaryOwner: null,
      assignedTeam: fallbackPool.team,
      assignedQueue: fallbackPool.queue,
      escalationPolicyKey: null,
      sdrPod: fallbackPool.sdrPod ?? null,
      reasonCodes: ["round_robin_selected", "owner_has_capacity"],
    },
  };
}

function evaluateOpsReview(
  config: ActiveRoutingConfig,
  precedence: number,
): StepResult {
  return {
    step: buildStep({
      precedence,
      policyKey: config.opsReview.queue,
      decisionType: "ops_review_queue",
      matched: true,
      selected: true,
      skippedReason: null,
      reasonCodes: ["no_eligible_owner_found", "sent_to_ops_review"],
      candidateOwnerIds: [],
      capacityChecks: [],
    }),
    selected: {
      decisionType: "ops_review_queue",
      precedence,
      policyKey: config.opsReview.queue,
      assignedOwner: null,
      secondaryOwner: null,
      assignedTeam: config.opsReview.team ?? null,
      assignedQueue: config.opsReview.queue,
      escalationPolicyKey: null,
      sdrPod: null,
      reasonCodes: ["no_eligible_owner_found", "sent_to_ops_review"],
    },
  };
}

export async function evaluateRoutingDecision(
  config: ActiveRoutingConfig,
  context: RoutingEvaluationContext,
  deps: RoutingEvaluationDeps,
): Promise<EvaluatedRoutingDecision> {
  const evaluatedPolicies: RoutingEvaluationStepContract[] = [];
  const defaultQueueContext = buildDefaultQueueContext(config, context);

  const steps: Array<Promise<StepResult> | StepResult> = [
    evaluateSingleOwnerRule(context, deps, {
      precedence: 1,
      policyKey: "named-account-owner",
      decisionType: "named_account_owner",
      ownerId: context.namedOwnerId,
      matchedReasonCodes: ["account_is_named"],
      queueContext: defaultQueueContext,
    }),
    evaluateSingleOwnerRule(context, deps, {
      precedence: 2,
      policyKey: "existing-account-owner",
      decisionType: "existing_account_owner",
      ownerId: context.existingOwnerId,
      matchedReasonCodes: ["existing_owner_preserved"],
      queueContext: defaultQueueContext,
    }),
    evaluateStrategicOverrideRule(config, context, deps, 3),
    evaluateTerritoryRule(config, context, deps, 4),
    evaluateFallbackRoundRobin(config, context, deps, 5),
    evaluateOpsReview(config, 6),
  ];

  let selectedAssignment: SelectedAssignment | null = null;

  for (const stepResult of steps) {
    const resolved = await stepResult;
    evaluatedPolicies.push(resolved.step);

    if (resolved.selected) {
      selectedAssignment = resolved.selected;
      break;
    }
  }

  if (!selectedAssignment) {
    throw new Error("Routing evaluation did not select a decision.");
  }

  const fallbackTriggered = evaluatedPolicies.some(
    (step) =>
      step.matched &&
      !step.selected &&
      step.reasonCodes.includes("owner_over_capacity"),
  );
  const sla = resolveRoutingSla(config, {
    entityType: context.entityType,
    inboundType: context.inboundType,
    temperature: context.temperature,
    triggerSignal: context.triggerSignal,
    referenceTime: context.referenceTime,
  });
  const rawReasonCodes = uniqueRoutingReasonCodes([
    ...selectedAssignment.reasonCodes,
    ...(fallbackTriggered ? (["fallback_after_capacity"] as const) : []),
    ...sla.reasonCodes,
  ]);
  const reasonCodes = buildDecisionReasonCodes(
    selectedAssignment.decisionType,
    rawReasonCodes,
  );

  const explanation = buildRoutingExplanation({
    decisionType: selectedAssignment.decisionType,
    policyKey: selectedAssignment.policyKey,
    precedence: selectedAssignment.precedence,
    assignedOwner: selectedAssignment.assignedOwner,
    secondaryOwner: selectedAssignment.secondaryOwner,
    assignedTeam: selectedAssignment.assignedTeam,
    assignedQueue: selectedAssignment.assignedQueue,
    escalationPolicyKey: selectedAssignment.escalationPolicyKey,
    entityContext: buildEntityContext(context, selectedAssignment.sdrPod),
    evaluatedPolicies,
    slaTargetMinutes: sla.targetMinutes,
    slaDueAt: sla.dueAt,
    slaReasonCodes: sla.reasonCodes,
    reasonCodes,
  });

  return {
    decisionType: selectedAssignment.decisionType,
    policyKey: selectedAssignment.policyKey,
    policyVersion: config.version,
    entityType: context.entityType,
    entityId: context.entityId,
    accountId: context.accountId,
    leadId: context.leadId,
    assignedOwner: selectedAssignment.assignedOwner,
    secondaryOwner: selectedAssignment.secondaryOwner,
    assignedTeam: selectedAssignment.assignedTeam,
    assignedQueue: selectedAssignment.assignedQueue,
    reasonCodes,
    explanation,
    slaTargetMinutes: sla.targetMinutes,
    slaDueAt: sla.dueAt,
    escalationPolicyKey: selectedAssignment.escalationPolicyKey,
  };
}
