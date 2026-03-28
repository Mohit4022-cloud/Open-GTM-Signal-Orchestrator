import type {
  RoutingCapacityBlockingCheck,
  RoutingCapacitySnapshotContract,
  RoutingDecisionContract,
  RoutingDecisionType,
  RoutingEntityType,
  RoutingEvaluationStepContract,
  RoutingExplanationContract,
  RoutingOwnerSummaryContract,
  RoutingReasonCode,
  RoutingReasonDetailContract,
  RoutingSlaContract,
} from "@/lib/contracts/routing";

import {
  buildRoutingReasonDetails,
  parseRoutingReasonCodes,
} from "./reason-codes";
import { summarizeRoutingExplanation } from "./explanation";

const routingDiagnosticReasonCodeBlockList = new Set<RoutingReasonCode>([
  "owner_has_capacity",
  "owner_over_capacity",
  "no_eligible_owner_found",
  "strategic_pair_assigned",
  "round_robin_selected",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function parseCapacityBlockingChecks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is RoutingCapacityBlockingCheck =>
      item === "open_hot_leads" ||
      item === "daily_inbound_assignments" ||
      item === "open_task_count",
  );
}

function parseCapacitySnapshot(value: unknown): RoutingCapacitySnapshotContract | null {
  if (!isRecord(value)) {
    return null;
  }

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
    blockingChecks: parseCapacityBlockingChecks(value.blockingChecks),
  };
}

function normalizeRoutingReasonCodes(reasonCodes: unknown) {
  return [...new Set(parseRoutingReasonCodes(reasonCodes))];
}

export function buildDecisionReasonCodes(
  decisionType: RoutingDecisionType,
  reasonCodes: RoutingReasonCode[],
): RoutingReasonCode[] {
  const curatedCodes = reasonCodes.filter(
    (reasonCode) => !routingDiagnosticReasonCodeBlockList.has(reasonCode),
  );

  if (curatedCodes.length > 0) {
    return curatedCodes;
  }

  switch (decisionType) {
    case "named_account_owner":
      return ["account_is_named"];
    case "existing_account_owner":
      return ["existing_owner_preserved"];
    case "strategic_tier_override":
      return ["strategic_tier_override"];
    case "territory_segment_rule":
      return ["territory_segment_match"];
    case "round_robin_pool":
      return ["round_robin_selected"];
    case "ops_review_queue":
      return ["sent_to_ops_review"];
  }
}

function parseEvaluationStep(value: unknown): RoutingEvaluationStepContract | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.precedence !== "number" ||
    typeof value.policyKey !== "string" ||
    typeof value.decisionType !== "string" ||
    typeof value.matched !== "boolean" ||
    typeof value.selected !== "boolean"
  ) {
    return null;
  }

  const reasonCodes = normalizeRoutingReasonCodes(value.reasonCodes);
  const capacityChecks = Array.isArray(value.capacityChecks)
    ? value.capacityChecks
        .map((item) => parseCapacitySnapshot(item))
        .filter(
          (
            item,
          ): item is RoutingCapacitySnapshotContract => item !== null,
        )
    : [];

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
    candidateOwnerIds: Array.isArray(value.candidateOwnerIds)
      ? value.candidateOwnerIds.filter((item): item is string => typeof item === "string")
      : [],
    capacityChecks,
  };
}

function parseRoutingSla(value: unknown): RoutingSlaContract {
  if (!isRecord(value)) {
    return {
      targetMinutes: null,
      dueAtIso: null,
      reasonCodes: [],
      reasonDetails: [],
    };
  }

  const reasonCodes = normalizeRoutingReasonCodes(value.reasonCodes);

  return {
    targetMinutes:
      typeof value.targetMinutes === "number" ? value.targetMinutes : null,
    dueAtIso: typeof value.dueAtIso === "string" ? value.dueAtIso : null,
    reasonCodes,
    reasonDetails: buildRoutingReasonDetails(reasonCodes, { includeNoisy: true }),
  };
}

export function normalizeRoutingExplanation(
  value: unknown,
  fallback: {
    decisionType: RoutingDecisionType;
    assignedOwner: RoutingOwnerSummaryContract | null;
    secondaryOwner: RoutingOwnerSummaryContract | null;
    assignedTeam: string | null;
    assignedQueue: string;
    escalationPolicyKey: string | null;
    reasonCodes: RoutingReasonCode[];
  },
): RoutingExplanationContract {
  const parsed = isRecord(value) ? value : {};
  const appliedPolicy = isRecord(parsed.appliedPolicy) ? parsed.appliedPolicy : {};
  const assignment = isRecord(parsed.assignment) ? parsed.assignment : {};
  const capacity = isRecord(parsed.capacity) ? parsed.capacity : {};
  const entityContext = isRecord(parsed.entityContext) ? parsed.entityContext : {};
  const evaluatedPolicies = Array.isArray(parsed.evaluatedPolicies)
    ? parsed.evaluatedPolicies
        .map((item) => parseEvaluationStep(item))
        .filter(
          (
            item,
          ): item is RoutingEvaluationStepContract => item !== null,
        )
    : [];
  const reasonCodes = buildDecisionReasonCodes(
    fallback.decisionType,
    normalizeRoutingReasonCodes(parsed.reasonCodes ?? fallback.reasonCodes),
  );

  const explanation: RoutingExplanationContract = {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    decision:
      parsed.decision === "assigned_to_owner"
        ? "assigned_to_owner"
        : fallback.assignedOwner
          ? "assigned_to_owner"
          : "sent_to_ops_review",
    appliedPolicy: {
      precedence:
        typeof appliedPolicy.precedence === "number" ? appliedPolicy.precedence : 0,
      policyKey:
        typeof appliedPolicy.policyKey === "string"
          ? appliedPolicy.policyKey
          : fallback.assignedQueue,
      decisionType:
        typeof appliedPolicy.decisionType === "string"
          ? (appliedPolicy.decisionType as RoutingDecisionType)
          : fallback.decisionType,
    },
    evaluatedPolicies,
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
      owner: parseOwnerSummary(assignment.owner) ?? fallback.assignedOwner,
      secondaryOwner:
        parseOwnerSummary(assignment.secondaryOwner) ?? fallback.secondaryOwner,
      team: typeof assignment.team === "string" ? assignment.team : fallback.assignedTeam,
      queue:
        typeof assignment.queue === "string" ? assignment.queue : fallback.assignedQueue,
      escalationPolicyKey:
        typeof assignment.escalationPolicyKey === "string"
          ? assignment.escalationPolicyKey
          : fallback.escalationPolicyKey,
    },
    capacity: {
      checkedOwners: Array.isArray(capacity.checkedOwners)
        ? capacity.checkedOwners
            .map((item) => parseCapacitySnapshot(item))
            .filter(
              (
                item,
              ): item is RoutingCapacitySnapshotContract => item !== null,
            )
        : [],
      fallbackTriggered:
        capacity.fallbackTriggered === true ||
        evaluatedPolicies.some(
          (step) =>
            step.matched &&
            !step.selected &&
            step.reasonCodes.includes("owner_over_capacity"),
        ),
    },
    sla: parseRoutingSla(parsed.sla),
    reasonCodes,
    reasonDetails: buildRoutingReasonDetails(reasonCodes),
  };

  explanation.summary = explanation.summary || summarizeRoutingExplanation(explanation);

  return explanation;
}

export function normalizeRoutingDecisionRow(row: {
  id: string;
  entityType: RoutingEntityType;
  entityId: string;
  accountId: string | null;
  leadId: string | null;
  policyVersion: string;
  decisionType: RoutingDecisionType;
  assignedOwner: RoutingOwnerSummaryContract | null;
  secondaryOwner: RoutingOwnerSummaryContract | null;
  assignedTeam: string | null;
  assignedQueue: string;
  slaTargetMinutes: number | null;
  slaDueAtIso: string | null;
  escalationPolicyKey: string | null;
  reasonCodes: unknown;
  explanation: unknown;
  triggerSignalId: string | null;
  createdAtIso: string;
}): RoutingDecisionContract {
  const normalizedReasonCodes = buildDecisionReasonCodes(
    row.decisionType,
    normalizeRoutingReasonCodes(row.reasonCodes),
  );
  const explanation = normalizeRoutingExplanation(row.explanation, {
    decisionType: row.decisionType,
    assignedOwner: row.assignedOwner,
    secondaryOwner: row.secondaryOwner,
    assignedTeam: row.assignedTeam,
    assignedQueue: row.assignedQueue,
    escalationPolicyKey: row.escalationPolicyKey,
    reasonCodes: normalizedReasonCodes,
  });

  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    accountId: row.accountId,
    leadId: row.leadId,
    policyVersion: row.policyVersion,
    decisionType: row.decisionType,
    assignedOwner: row.assignedOwner,
    secondaryOwner: row.secondaryOwner,
    assignedTeam: row.assignedTeam,
    assignedQueue: row.assignedQueue,
    slaTargetMinutes: row.slaTargetMinutes,
    slaDueAtIso: row.slaDueAtIso,
    escalationPolicyKey: row.escalationPolicyKey,
    reasonCodes: normalizedReasonCodes,
    reasonDetails: buildRoutingReasonDetails(normalizedReasonCodes),
    explanation,
    triggerSignalId: row.triggerSignalId,
    createdAtIso: row.createdAtIso,
  };
}
