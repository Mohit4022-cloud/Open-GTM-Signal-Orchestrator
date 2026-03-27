import type {
  RoutingCapacitySnapshotContract,
  RoutingDecisionType,
  RoutingEvaluationStepContract,
  RoutingExplanationContract,
  RoutingOwnerSummaryContract,
  RoutingReasonCode,
} from "@/lib/contracts/routing";

type BuildRoutingExplanationParams = {
  decisionType: RoutingDecisionType;
  policyKey: string;
  precedence: number;
  assignedOwner: RoutingOwnerSummaryContract | null;
  secondaryOwner: RoutingOwnerSummaryContract | null;
  assignedTeam: string | null;
  assignedQueue: string;
  escalationPolicyKey: string | null;
  entityContext: RoutingExplanationContract["entityContext"];
  evaluatedPolicies: RoutingEvaluationStepContract[];
  slaTargetMinutes: number | null;
  slaDueAt: Date | null;
  slaReasonCodes: RoutingReasonCode[];
  reasonCodes: RoutingReasonCode[];
};

export function uniqueRoutingReasonCodes(reasonCodes: RoutingReasonCode[]) {
  return [...new Set(reasonCodes)];
}

export function flattenCapacityChecks(steps: RoutingEvaluationStepContract[]) {
  const latestByOwnerId = new Map<string, RoutingCapacitySnapshotContract>();

  for (const step of steps) {
    for (const snapshot of step.capacityChecks) {
      latestByOwnerId.set(snapshot.ownerId, snapshot);
    }
  }

  return [...latestByOwnerId.values()];
}

export function buildRoutingExplanation(
  params: BuildRoutingExplanationParams,
): RoutingExplanationContract {
  const checkedOwners = flattenCapacityChecks(params.evaluatedPolicies);
  const fallbackTriggered = params.evaluatedPolicies.some(
    (step) => step.matched && !step.selected && step.reasonCodes.includes("owner_over_capacity"),
  );

  return {
    decision:
      params.assignedOwner === null ? "sent_to_ops_review" : "assigned_to_owner",
    appliedPolicy: {
      precedence: params.precedence,
      policyKey: params.policyKey,
      decisionType: params.decisionType,
    },
    evaluatedPolicies: params.evaluatedPolicies,
    entityContext: params.entityContext,
    assignment: {
      owner: params.assignedOwner,
      secondaryOwner: params.secondaryOwner,
      team: params.assignedTeam,
      queue: params.assignedQueue,
      escalationPolicyKey: params.escalationPolicyKey,
    },
    capacity: {
      checkedOwners,
      fallbackTriggered,
    },
    sla: {
      targetMinutes: params.slaTargetMinutes,
      dueAtIso: params.slaDueAt?.toISOString() ?? null,
      reasonCodes: params.slaReasonCodes,
    },
    reasonCodes: uniqueRoutingReasonCodes(params.reasonCodes),
  };
}

function formatDecisionType(decisionType: RoutingDecisionType) {
  switch (decisionType) {
    case "named_account_owner":
      return "Named account owner";
    case "existing_account_owner":
      return "Existing account owner";
    case "strategic_tier_override":
      return "Strategic tier override";
    case "territory_segment_rule":
      return "Territory and segment rule";
    case "round_robin_pool":
      return "Round-robin pool";
    case "ops_review_queue":
      return "Ops review queue";
  }
}

export function summarizeRoutingExplanation(
  explanation: RoutingExplanationContract,
) {
  if (explanation.assignment.owner) {
    return `${explanation.assignment.owner.name} assigned via ${formatDecisionType(
      explanation.appliedPolicy.decisionType,
    )} to ${explanation.assignment.queue}.`;
  }

  return `Sent to ${explanation.assignment.queue} via ${formatDecisionType(
    explanation.appliedPolicy.decisionType,
  )}.`;
}
